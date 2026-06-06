---
description: "Task list for Quick Play – öffentliches Matchmaking (006)"
---

# Tasks: Quick Play – öffentliches Matchmaking

**Input**: Design documents from `/specs/006-quick-play-matchmaking/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests sind **eingeschlossen** — ausdrückliche Nutzervorgabe (vier Pflicht-Testfälle:
only-logged-in, atomares No-Double-Match, Leave-on-Disconnect, identisch-zur-Code-Lobby) und
Verfassungsgebot (Prinzip II/TDD: reine Logik test-first, muss erst fehlschlagen).

**Organization**: Tasks nach User Story gruppiert (US1–US3), jeweils unabhängig testbar. Additiv über
004/005 — **keine** Engine-Änderung, **keine** Prisma-Migration, **kein paralleler Spielpfad**.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisierbar (andere Datei, keine offene Abhängigkeit)
- **[Story]**: zugehörige User Story (US1–US3)
- Exakte Dateipfade in jeder Beschreibung

## Path Conventions

Monorepo: `packages/server/src`, `packages/server/test`, `packages/web/src`, `packages/web/app`,
`packages/web/tests`. Pfade gemäß plan.md (Project Structure).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: minimale Vorbereitung; keine neue Infrastruktur/Dependency (Lua via vorhandenem ioredis).

- [x] T001 [P] Konfigurierbares Wartetimeout `matchmakingTimeoutMs` (Default `120_000`, Env `MATCHMAKING_TIMEOUT_MS`) im Typed-Config-Loader ergänzen in `packages/server/src/config/app-config.ts` und in `packages/server/.env.example` dokumentieren (data-model.md §4).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: gemeinsam genutzte, reine Bausteine, Verträge und Redis-/Index-Naht, die ALLE User Stories brauchen.

**⚠️ CRITICAL**: Keine User-Story-Arbeit beginnt, bevor diese Phase steht.

- [x] T002 [P] Event-Vertrag additiv erweitern in `packages/server/src/realtime/events.ts`: `ClientEvents.queueJoin='queue:join'`/`queueLeave='queue:leave'`; `ServerEvents.queueMatched='queue:matched'`/`queueTimeout='queue:timeout'`; Typen `QueueMatchedMsg { code, you, lobby, reconnectToken }` und `QueueTimeoutMsg { reason:'no-match' }`; Acks `QueueJoinAck=Ack<{status:'waiting'|'matched'}>`, `QueueLeaveAck=Ack<Record<string,never>>`; `ErrorCode` um `'already-in-game'` ergänzen (contracts/websocket-events.md).
- [x] T003 [P] `SocketData` um `inQueue?: boolean` erweitern in `packages/server/src/realtime/ws-auth.middleware.ts` (Disconnect-Aufräumen, research.md §6).
- [x] T004 [P] Unit-Test (fail-first) `packages/server/test/unit/quick-play-settings.test.ts`: `QUICK_PLAY_SETTINGS` = `{ allowTouching:true, turnTimerSeconds:30, extraTurnOnHit:true }` (FR-005, SC-003).
- [x] T005 [P] Unit-Test (fail-first) `packages/server/test/unit/queue-guard.test.ts`: `canEnterQueue` — Gast→`forbidden`, anonym→`unauthenticated`, eingeloggt+`inLobby`→`already-in-game`, eingeloggt+`hasActiveGame`→`already-in-game`, eingeloggt+frei→`ok` (FR-001/015, data-model.md §1.2).
- [x] T006 [P] `packages/server/src/matchmaking/quick-play-settings.ts` implementieren bis T004 grün (reine Konstante).
- [x] T007 [P] `packages/server/src/matchmaking/queue-guard.ts` implementieren bis T005 grün (reine Funktion `canEnterQueue(identity, { inLobby, hasActiveGame })`).
- [x] T008 [P] Konto-weiten Aktiv-Index in `packages/server/src/lobby/lobby.repository.ts` ergänzen: `setUserGame(userId, code, ttlMs)`, `getUserGame(userId)`, `clearUserGame(userId)` über Key `game-of-user:{userId}` (contracts/redis-state.md §1/§4).
- [x] T009 Aktiv-Index in `packages/server/src/lobby/lobby.service.ts` pflegen: in `createLobby` (Host) und `joinLobby` (eingeloggter Seat B) `setUserGame(userId, code, ACTIVE_TTL_MS)` setzen (depends T008; FR-015).
- [x] T010 Aktiv-Index bei Partieende/Austritt löschen in `packages/server/src/realtime/game.gateway.ts`: in `finishAndPersist` `clearUserGame` für beide eingeloggten Seats; in `handleDeparture`/`removeBeforeStart`-Zweig `clearUserGame` für den austretenden eingeloggten Spieler (depends T008; Selbstheilung sonst via TTL).
- [x] T011 [P] `packages/server/src/matchmaking/matchmaking.repository.ts` neu: ZSET `quickplay:queue` mit atomarem Lua `claim-or-enqueue` (`eval`, KEYS[1]=queue, ARGV=userId,now → `['matched',opponent]`|`['waiting']`), `setConn(userId, socketId, ttl)`/`getConn`/`delConn` (`quickplay:conn:{userId}`), `removeFromQueue(userId)` (`ZREM`+`delConn`) (contracts/redis-state.md §2/§3; depends RedisService).
- [x] T012 `packages/server/src/matchmaking/matchmaking.service.ts` neu (Grundgerüst): `@Injectable`, Konstruktor mit `MatchmakingRepository`, `LobbyService`, `LobbyRepository`, `GraceTimerService`, `@Inject(APP_CONFIG)`; private Helfer `removeFromQueue(userId)` (Repo + `grace.clear`); injizierbares `now()` (depends T011).
- [x] T013 `packages/server/src/matchmaking/matchmaking.module.ts` neu (DI: importiert `LobbyModule`, `RedisModule`, `ReconnectModule`/`GraceTimerService`-Provider; exportiert `MatchmakingService`, `MatchmakingRepository`) und in `packages/server/src/app.module.ts` registrieren (depends T012).

**Checkpoint**: reine Logik + Verträge + Redis-/Index-Naht stehen und sind grün → User Stories können starten.

---

## Phase 3: User Story 1 - Zwei Spieler werden automatisch gepaart (Priority: P1) 🎯 MVP

**Goal**: Ein eingeloggter Spieler tritt der Warteschlange bei; sobald ein zweiter wartet, werden beide
**atomar** gepaart, der Server erzeugt über die bestehende Lobby-Logik eine Standard-Lobby und überführt
beide direkt in die Schiffsplatzierung — ohne Code-Austausch, danach identisch zur Code-Lobby.

**Independent Test**: Zwei eingeloggte Sockets `queue:join` → beide erhalten `queue:matched` mit
demselben `code`, landen in `placing`, spielen die Partie regulär zu Ende (Persistenz/Stats/Reconnect
identisch). Bei gleichzeitigem Beitritt entsteht genau **ein** Match.

### Tests for User Story 1 (TDD — zuerst schreiben, müssen fehlschlagen) ⚠️

- [x] T014 [P] [US1] Integrationstest `packages/server/test/integration/quick-play-atomic-match.test.ts` (`socket.io-client` + Test-Redis): zwei eingeloggte Sockets `Promise.all([queue:join, queue:join])` → genau **ein** Paar, beide `queue:matched` auf **denselben** `code`, je korrektes `you` (A=früher Wartender), `quickplay:queue` danach leer, kein dritter Eintrag (FR-003/011/012, SC-001/006). Zusätzlich: ein einzelner Sucher bleibt `status:'waiting'` ohne Match.
- [x] T015 [P] [US1] Integrationstest `packages/server/test/integration/quick-play-identical-to-code.test.ts`: gematchte Partie mit `QUICK_PLAY_SETTINGS` (touch/30s/extra-turn) bis `game:over` spielen → `Match`/`Stat`-Persistenz wie `online-game.test.ts`; Reconnect mit dem aus `queue:matched` erhaltenen `reconnectToken` funktioniert (FR-005/007, SC-003).
- [x] T016 [P] [US1] Web-Komponententest `packages/web/tests/component/quick-play-matched.test.tsx` (FakeSocket): `queue:matched` setzt `lobby` + persistiert Reconnect-Info → nahtloser Übergang in den Platzierungsbildschirm (FR-007).

### Implementation for User Story 1

- [x] T017 [US1] `packages/server/src/matchmaking/matchmaking.service.ts`: `join(identity, socketId, now, ctx)` → `canEnterQueue`-Guard, dann atomares `claim-or-enqueue`; bei **matched** Lobby via `LobbyService.createLobby(opponent, QUICK_PLAY_SETTINGS, now)` + `joinLobby(code, joiner, idKey)` erzeugen und Pairing-Ergebnis (`{code, host, joiner, record, tokens}`) zurückgeben; bei **waiting** `setConn` (depends T012, T013).
- [x] T018 [US1] `packages/server/src/realtime/game.gateway.ts`: Handler `@SubscribeMessage('queue:join') onQueueJoin` — Identität prüfen, Guard-Kontext (`inLobby` aus `socket.data.lobby`, `hasActiveGame` aus `repo.getUserGame`) bauen, `MatchmakingService.join` aufrufen; **matched** → wartenden Socket via `getConn`+`server.sockets.sockets.get` auflösen, **beide** Sockets `socket.join(code)` + `socket.data.lobby` setzen + `inQueue=false`, `broadcastLobbyState`, je `queue:matched`-Push mit Seat-`reconnectToken`; ist der Wartesocket nicht auffindbar → Match verwerfen, Gegner re-enqueue; **waiting** → `inQueue=true`, 120-s-Timer planen; Ack `{ok,status}` (depends T017, T002, T003).
- [x] T019 [US1] `packages/server/src/realtime/game.gateway.ts`: 120-s-Wartetimeout-Callback (via `GraceTimerService`, `config.matchmakingTimeoutMs`, injizierbares `now()`) — wenn User noch wartet: `MatchmakingService.removeFromQueue` + `queue:timeout`-Push `{reason:'no-match'}` (FR-016, SC-008; depends T018).
- [x] T020 [P] [US1] `packages/web/src/realtime/socket-client.ts`: Typen `QueueMatchedMsg`/`QueueTimeoutMsg` + Eventnamen-Konstanten `queue:join`/`queue:leave`/`queue:matched`/`queue:timeout` ergänzen (Spiegel des Server-Contracts).
- [x] T021 [US1] `packages/web/src/realtime/useOnlineGame.ts`: `searching`-State + `findMatch()` (emit `queue:join`, Ack `waiting`/Fehler verarbeiten); `queue:matched`-Listener → `codeRef` setzen, `saveReconnect({code, token, playerId: you})`, `lobby` in State (wie `joinLobby`); `queue:timeout`-Listener → `searching=false` + Hinweis „kein Match gefunden" (depends T020).
- [x] T022 [US1] `packages/web/src/components/online/QuickPlayPanel.tsx` neu (schlicht): „Match suchen"-Button → `findMatch()`; Wartestatus „suche Gegner …"; „kein Match gefunden"-Hinweis; und Einbindung in `packages/web/app/online/page.tsx` neben `LobbyPanel`, solange keine Lobby aktiv ist (depends T021).

**Checkpoint**: Zwei eingeloggte Spieler finden sich ohne Code, spielen eine reguläre Partie — MVP lauffähig und unabhängig testbar.

---

## Phase 4: User Story 2 - Suche abbrechen vor der Paarung (Priority: P2)

**Goal**: Ein Wartender kann die Suche abbrechen (Button) und verlässt die Warteschlange; auch
Disconnect/Tab-Schließen entfernt ihn **still** (keine Partie, kein Statistik-Eintrag).

**Independent Test**: Einreihen, dann (a) `queue:leave` bzw. (b) Socket trennen → `quickplay:queue` leer;
ein danach beitretender Spieler wird **nicht** mit dem abgebrochenen User gepaart; keine `Match`/`Stat`-Zeile.

### Tests for User Story 2 (TDD — zuerst schreiben, müssen fehlschlagen) ⚠️

- [x] T023 [P] [US2] Integrationstest `packages/server/test/integration/quick-play-leave-on-disconnect.test.ts`: einreihen → Socket `disconnect` → `quickplay:queue` leer und `quickplay:conn` gelöscht; kein `queue:matched`; keine `Match`/`Stat`-Persistenz (FR-013, SC-009).
- [x] T024 [P] [US2] Integrationstest `packages/server/test/integration/quick-play-cancel.test.ts`: einreihen → `queue:leave` (Ack `ok`) → aus der Queue entfernt (< 1 s); ein nachfolgender Sucher findet **keinen** Gegner und bleibt `waiting` (FR-008/009, SC-005).

### Implementation for User Story 2

- [x] T025 [US2] `packages/server/src/matchmaking/matchmaking.service.ts`: öffentliche `leave(userId)` → `removeFromQueue` (idempotent, No-Op wenn nicht wartend) (depends T012).
- [x] T026 [US2] `packages/server/src/realtime/game.gateway.ts`: Handler `@SubscribeMessage('queue:leave') onQueueLeave` → `leave` + `inQueue=false`, Ack `{ok:true}`; und `handleDeparture` erweitern: wenn `socket.data.inQueue` → `MatchmakingService.leave` **bevor** die Lobby-Departure-Logik greift (FR-013; depends T025, T018).
- [x] T027 [US2] `packages/web/src/realtime/useOnlineGame.ts` + `packages/web/src/components/online/QuickPlayPanel.tsx`: `cancelSearch()` (emit `queue:leave`, `searching=false`) und „Abbrechen"-Button im Wartestatus (depends T021, T022).

**Checkpoint**: US1 + US2 funktionieren unabhängig; Wartende können sauber aussteigen.

---

## Phase 5: User Story 3 - Gäste haben keinen Zugang (Priority: P2)

**Goal**: Gäste/anonyme Nutzer können Quick Play nicht nutzen — serverseitig abgelehnt und im UI gar
nicht erst angeboten; PvP per Lobby-Code bleibt für Gäste unverändert.

**Independent Test**: Gast-Cookie → `queue:join` → Ack `forbidden`, keine Queue-Mitgliedschaft; im UI
erscheint für Gäste kein „Match suchen"-Einstieg.

### Tests for User Story 3 (TDD — zuerst schreiben, müssen fehlschlagen) ⚠️

- [x] T028 [P] [US3] Integrationstest `packages/server/test/integration/quick-play-only-logged-in.test.ts`: Gast-Cookie `queue:join` → Ack `forbidden`, `quickplay:queue` leer; (Kontrolle) eingeloggt → `waiting` (FR-001, SC-004).
- [x] T029 [P] [US3] Web-Komponententest `packages/web/tests/component/quick-play-guest-hidden.test.tsx`: bei Gast-Identität rendert `app/online/page.tsx` **keinen** QuickPlayPanel-Einstieg; Lobby-Beitritt per Code bleibt sichtbar.

### Implementation for User Story 3

- [x] T030 [US3] `packages/web/app/online/page.tsx`: QuickPlayPanel nur für eingeloggte Identität (`identity?.kind === 'user'`) einblenden (Gast/anonym sehen nur `LobbyPanel`-Code-Beitritt). Serverseitige Ablehnung ist bereits durch `canEnterQueue` (T007) im Handler (T018) abgedeckt — durch T028 verifiziert (depends T022).

**Checkpoint**: Alle drei User Stories unabhängig funktionsfähig.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: querschnittliche Absicherung und Spec-Abnahme.

- [x] T031 [P] Integrationstest `packages/server/test/integration/quick-play-already-in-game.test.ts`: eingeloggter Spieler in aktiver Lobby/Partie → `queue:join` → Ack `already-in-game`, kein Queue-Eintrag (FR-015, SC-007; nutzt Index aus T008–T010).
- [x] T032 Lint/Format/Typecheck grün halten: `npm run --workspace @schiffe/server lint && npm run --workspace @schiffe/web lint` (strict TS, kein `any`; Verfassung Prinzip IV).
- [x] T033 Quickstart-Abnahme `specs/006-quick-play-matchmaking/quickstart.md` durchspielen (2-Spieler-Smoke + Verifikations-Checkliste FR/SC) und Abweichungen festhalten.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: keine Abhängigkeiten — sofort startbar.
- **Foundational (Phase 2)**: nach Setup; **blockiert** alle User Stories.
- **User Stories (Phase 3–5)**: alle nach Foundational. US1 ist MVP und liefert die Join-/Match-Infrastruktur, auf der US2 (leave) und US3 (UI-Gating) aufbauen.
- **Polish (Phase 6)**: nach den gewünschten User Stories.

### User Story Dependencies

- **US1 (P1)**: nach Foundational. Keine Abhängigkeit zu anderen Stories.
- **US2 (P2)**: nach Foundational; baut auf US1-Join/Gateway auf (`onQueueLeave`/Departure), bleibt eigenständig testbar.
- **US3 (P2)**: nach Foundational; Server-Ablehnung kommt aus Foundational-Guard (T007) + US1-Handler (T018); UI-Gating baut auf US1-Panel (T022) auf.

### Within Each User Story

- Tests zuerst (TDD) und müssen fehlschlagen, bevor Implementierung beginnt (reine Logik strikt test-first).
- Repository/Service vor Gateway-Handler; Server-Contract (T020) vor Web-Hook (T021) vor UI (T022).

### Parallel Opportunities

- Setup T001 sofort.
- Foundational: T002, T003, T004, T005 parallel; danach T006/T007 (parallel), T008 → T009/T010, T011 → T012 → T013.
- US1-Tests T014/T015/T016 parallel (verschiedene Dateien).
- T020 parallel zu Server-Impl (eigene Datei).
- US2-Tests T023/T024 parallel; US3-Tests T028/T029 parallel.
- Polish T031/T032 parallel.

---

## Parallel Example: User Story 1

```bash
# Fail-first-Tests für US1 gemeinsam schreiben:
Task: "Integration quick-play-atomic-match.test.ts (atomares No-Double-Match)"
Task: "Integration quick-play-identical-to-code.test.ts (Persistenz/Stats/Reconnect)"
Task: "Web-Komponententest quick-play-matched.test.tsx (nahtloser Übergang)"

# Danach Implementierung; Client-Contract parallel zur Server-Logik:
Task: "socket-client.ts: QueueMatched/QueueTimeout-Typen + Eventnamen"   # T020 [P]
# (T017→T018→T019 sequenziell, gleiche/serverseitig abhängige Dateien)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → Phase 2 Foundational (kritisch, blockiert alles).
2. Phase 3 US1 vollständig.
3. **STOP & VALIDATE**: zwei eingeloggte Spieler finden sich ohne Code und spielen eine reguläre Partie.
4. Demo-fähig.

### Incremental Delivery

1. Setup + Foundational → Fundament steht.
2. US1 → unabhängig testen → Demo (MVP: automatisches Matchmaking).
3. US2 → Abbrechen/Disconnect-Stille → testen → Demo.
4. US3 → Gast-Sperre (Server + UI) → testen → Demo.
5. Polish: FR-015-Absicherung, Lint, Quickstart-Abnahme.

---

## Notes

- [P] = andere Datei, keine offene Abhängigkeit.
- Additiv über 004/005: **keine** Engine-Änderung, **keine** Prisma-Migration, **kein** `LobbyRecord`-Delta, **kein paralleler Spielpfad** (ab `placing` bestehender Fluss).
- Atomare Paarung ausschließlich über das Redis-Lua-Skript (FR-012); Wartetimeout über injizierbares `now()` (deterministisch testbar).
- Integrationstests laufen über das bestehende `setup-ws.ts`-Harness und werden ohne `REDIS_URL`/`DATABASE_URL` via `HAS_INFRA` übersprungen.
- Commit nach jeder Task oder logischer Gruppe; an Checkpoints Story unabhängig validieren.
