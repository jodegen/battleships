---
description: "Task list for Reconnect-Handling für laufende PvP-Partien (005)"
---

# Tasks: Reconnect-Handling für laufende PvP-Partien

**Input**: Design documents from `/specs/005-reconnect-handling/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests sind **eingeschlossen** — ausdrückliche Nutzervorgabe (vier Pflicht-Testklassen)
und Verfassungsgebot (Prinzip II, TDD: Tests zuerst, müssen erst fehlschlagen). Reine Logik wird
strikt test-first entwickelt.

**Organization**: Tasks nach User Story gruppiert (US1–US4), jeweils unabhängig testbar.
Additiv über Feature 004 — **keine** Engine-Änderung, **keine** Prisma-Migration.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisierbar (andere Datei, keine offene Abhängigkeit)
- **[Story]**: zugehörige User Story (US1–US4)
- Exakte Dateipfade in jeder Beschreibung

## Path Conventions

Monorepo: `packages/server/src`, `packages/server/test`, `packages/web/src`, `packages/web/tests`.
Pfade gemäß plan.md (Project Structure).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: minimale Vorbereitung; keine neue Infrastruktur/Dependency.

- [x] T001 [P] Konfigurierbares Reconnect-Fenster `RECONNECT_WINDOW_MS` (Default 60000) im Typed-Config-Loader ergänzen in `packages/server/src/config/app-config.ts` und in `packages/server/.env.example` dokumentieren (Default genügt; Spec fixiert 60 s).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: gemeinsam genutzte, reine Bausteine und Verträge, die ALLE User Stories brauchen.

**⚠️ CRITICAL**: Keine User-Story-Arbeit beginnt, bevor diese Phase steht.

- [x] T002 [P] Live-State-Typen erweitern in `packages/server/src/lobby/lobby-types.ts`: `Seat.reconnectToken: string`, `Seat.reconnectDeadline: number | null`; `LobbyRecord.pausedTurnRemainingMs: number | null` und `LobbyRecord.paused: boolean` (data-model.md §1).
- [x] T003 [P] Event-Vertrag erweitern in `packages/server/src/realtime/events.ts`: Intent `reconnect:resume` (Payload `{ code, token }` + Ack-Union inkl. `you`, Fehlercodes `forbidden`/`game-finished`), Server-Events `OpponentDisconnectedMsg`/`OpponentReconnectedMsg`, `turn:changed` reason-Union um `'resume'` ergänzen (contracts/websocket-events.md).
- [x] T004 [P] Unit-Test (fail-first) `packages/server/test/unit/reconnect-token.test.ts`: `createReconnectToken` (Format/Eindeutigkeit), `verifyReconnectToken` (Match/Mismatch), `authorizeResume` (Token ODER User-Identitäts-Match FR-003a; Gast nur Token).
- [x] T005 [P] Unit-Test (fail-first) `packages/server/test/unit/reconnect-state.test.ts`: `markDisconnected` (setzt `reconnectDeadline`, persistiert `pausedTurnRemainingMs`, `turnDeadline=null`, `paused=true`), `markReconnected` (Resume nur wenn beide verbunden; `turnDeadline=now+Restzeit`; Timer-aus-Fall `pausedTurnRemainingMs=null`), `resolveAbandon` (Sieger=Gegner; Status-Guard), „beide getrennt → erstes Fenster entscheidet" (FR-014a).
- [x] T006 [US-shared] `packages/server/src/reconnect/reconnect-token.ts` implementieren bis T004 grün (`crypto.randomBytes`→base64url; konstanter Vergleich; `authorizeResume`).
- [x] T007 [US-shared] `packages/server/src/reconnect/reconnect-state.ts` implementieren bis T005 grün (reine Funktionen über `LobbyRecord`, `now` injiziert; abhängig von T002).

**Checkpoint**: reine Reconnect-Kernlogik + Verträge stehen und sind grün → User Stories können starten.

---

## Phase 3: User Story 1 - Innerhalb des Fensters zurückkehren und weiterspielen (Priority: P1) 🎯 MVP

**Goal**: Disconnect in `in_progress` beendet die Partie nicht mehr sofort; Reconnect mit gültigem
Token (oder eingeloggter Identität) stellt den sichtbaren Zustand über `viewFor` wieder her und setzt
den Zug-Timer mit Restzeit fort.

**Independent Test**: Partie in `in_progress` bringen, einen Client trennen, vor Ablauf neu verbinden
→ Client erhält genau seinen vorherigen sichtbaren Zustand (eigene Flotte, eigene Schüsse+Ergebnisse,
Zug-Inhaber, Restzeit), kein Leak gegnerischer Schiffe, Partie läuft weiter.

### Tests for User Story 1 (TDD — zuerst schreiben, müssen fehlschlagen) ⚠️

- [x] T008 [P] [US1] Integrationstest `packages/server/test/integration/reconnect-state-restore.test.ts` (`socket.io-client` + Test-Redis): Disconnect → `reconnect:resume` (gültiges Token) liefert `game:view` mit eigener Flotte + eigener Schuss-Historie; **kein** emittiertes Event enthält ungetroffene gegnerische Schiffszellen (SC-002 Leak-Scan); Zug-Inhaber korrekt (FR-008/009).
- [x] T009 [P] [US1] Integrationstest `packages/server/test/integration/reconnect-invalid-token.test.ts`: `reconnect:resume` mit fehlendem/fremdem Token (ohne passende User-Identität) → Ack `forbidden`, Sitz unverändert (FR-002/SC-007).

### Implementation for User Story 1

- [x] T010 [US1] In `packages/server/src/lobby/lobby.service.ts` bei Sitzbelegung (create/join) je Seat `reconnectToken` via `createReconnectToken()` erzeugen und im Erstellen-/Beitreten-Ergebnis zurückgeben (abhängig T006/T002).
- [x] T011 [US1] In `packages/server/src/realtime/game.gateway.ts` `reconnectToken` in den Acks von `lobby:create`/`lobby:join` an den jeweils berechtigten Client ausliefern (nie in Broadcasts/Projektionen).
- [x] T012 [US1] In `packages/server/src/realtime/game.gateway.ts` den Disconnect-Zweig für `status==='in_progress'` umschreiben: statt Forfeit `markDisconnected` (atomare `repo.update`) + `TurnTimerService.clear(code)`; `waiting`/`placing`-Zweige unverändert lassen (FR-004/005/011/018).
- [x] T013 [US1] In `packages/server/src/realtime/game.gateway.ts` Handler für Intent `reconnect:resume` implementieren: `authorizeResume(seat, token, identity)`, `socket.join(code)`, `socket.data.lobby={code,you}`, `markReconnected`, gezieltes `projectGameView`→`game:view` an den Socket, `lobby:state` an den Raum; sind danach beide Sitze verbunden → `turnDeadline` aus Restzeit, `TurnTimerService.schedule` re-arm, `turn:changed{reason:'resume'}` (FR-008/010/012/020).
- [x] T014 [P] [US1] `packages/web/src/realtime/reconnect-store.ts` neu: `{code,token,playerId}` in `localStorage` (`schiffe.reconnect`) — `set/get/clear` (FR-003, reload-fest).
- [x] T015 [US1] `packages/web/src/realtime/socket-client.ts` erweitern: Event-Typen (`reconnect:resume`, `opponent:*`, `turn:changed reason 'resume'`); `socket.on('connect')` emittiert bei vorhandenem gespeichertem Token automatisch `reconnect:resume{code,token}`; `withCredentials` bleibt (FR-003a-Pfad).
- [x] T016 [US1] `packages/web/src/realtime/useOnlineGame.ts` erweitern: `reconnectToken` aus create/join-Acks via reconnect-store speichern; bei `game:over`/`lobby:leave`/neuer Lobby räumen; Auto-Resume-Verdrahtung sicherstellen.

**Checkpoint**: US1 eigenständig nutzbar — Trennen & Wiederkehren innerhalb des Fensters funktioniert (ohne Auto-Ablauf/Countdown).

---

## Phase 4: User Story 2 - Verbliebener Spieler sieht Trennungsstatus mit Countdown (Priority: P2)

**Goal**: Der verbundene Spieler sieht „Gegner getrennt – wartet (xx s)" mit Countdown; während der
Pause werden keine Züge angenommen; bei Rückkehr verschwindet der Hinweis.

**Independent Test**: Mit zwei Clients trennen → der verbliebene Client zeigt herunterzählenden
Countdown; ein Zugversuch wird abgelehnt; nach Reconnect verschwindet der Hinweis.

### Tests for User Story 2 (TDD) ⚠️

- [x] T017 [P] [US2] Integrationstest `packages/server/test/integration/reconnect-opponent-status.test.ts`: bei Disconnect Broadcast `opponent:disconnected{graceDeadline}`, bei Resume `opponent:reconnected`; `shot:fire` während Pause → Ack-Reject ohne State-Änderung (FR-005/007/010).
- [x] T018 [P] [US2] Komponententest `packages/web/tests/component/opponent-countdown.test.tsx` (FakeSocket): nach `opponent:disconnected` erscheint „Gegner getrennt – wartet (xx s)" mit sinkendem Countdown; nach `opponent:reconnected` verschwindet er (SC-003).

### Implementation for User Story 2

- [x] T019 [US2] In `packages/server/src/realtime/game.gateway.ts` im Disconnect-Pfad `opponent:disconnected{code,playerId,graceDeadline}` und im Resume-Pfad `opponent:reconnected{code,playerId}` an den Raum broadcasten (FR-007/010).
- [x] T020 [US2] In `packages/server/src/realtime/game.gateway.ts` Intent-Handler (`shot:fire`, `fleet:place`) um Guard erweitern: bei `paused` (Sitz getrennt) Aktion ablehnen (`not-in-progress`/passender Code), keine State-Änderung (FR-005).
- [x] T021 [US2] `packages/web/src/realtime/useOnlineGame.ts` erweitern: State `opponentDisconnect:{playerId,graceDeadline}|null` (aus `opponent:disconnected`/`reconnected`) und `selfReconnecting:boolean` (aus socket `disconnect`/`connect`).
- [x] T022 [US2] `packages/web/src/components/online/OpponentStatus.tsx` erweitern: „Gegner getrennt – wartet (xx s)" mit Countdown aus `graceDeadline` (Deadline-Logik aus `TurnTimer` wiederverwenden); eigener Aussetzer-Hinweis „Verbindung verloren – neu verbinden …" (kein neues Design).

**Checkpoint**: US1 + US2 funktionieren unabhängig — sichtbarer Trennungsstatus + Zugsperre während Pause.

---

## Phase 5: User Story 3 - Ablauf des Fensters wertet als Aufgabe (Priority: P2)

**Goal**: Läuft das 60-s-Fenster ab, gilt die Partie als aufgegeben (verbliebener Spieler gewinnt),
idempotent über bestehende Modelle persistiert; bei beidseitiger Trennung entscheidet das zuerst
ablaufende Fenster; verspäteter Reconnect erhält das Endergebnis.

**Independent Test**: Trennen und Fenster ablaufen lassen → Partie beendet, verbliebener Spieler
Sieger, Statistik eingeloggter Spieler genau einmal fortgeschrieben.

### Tests for User Story 3 (TDD) ⚠️

- [x] T023 [P] [US3] Unit-Test (fail-first) `packages/server/test/unit/grace-timer.test.ts`: per-Seat `schedule`/`clear`/`clearAll`, Ablauf ruft Callback genau einmal, `now()` injiziert (deterministisch).
- [x] T024 [P] [US3] Integrationstest `packages/server/test/integration/reconnect-abandon.test.ts`: Disconnect → 60 s ablaufen (now vorrücken) → `game:over{reason:'forfeit'}`, Sieger=verbliebener Spieler, genau **eine** Stats-Fortschreibung, kein Doppel-Persist (FR-014/015/016, SC-005).
- [x] T025 [P] [US3] Integrationstest `packages/server/test/integration/reconnect-both-disconnected.test.ts`: beide getrennt → zuerst ablaufendes Fenster wertet, der andere gewinnt, genau eine Wertung (FR-014a).
- [x] T026 [P] [US3] Integrationstest `packages/server/test/integration/reconnect-late.test.ts`: Reconnect **nach** Ablauf (Lobby gelöscht, Marker vorhanden) → Ack `game-finished` + terminales `game:over`; ohne Marker → `lobby-not-found` (FR-017).

### Implementation for User Story 3

- [x] T027 [US3] `packages/server/src/reconnect/grace-timer.service.ts` neu implementieren bis T023 grün: per-Seat `Map<\`${code}:${playerId}\`, NodeJS.Timeout>`, `schedule/clear/clearAll`, injizierbares `now()` (analog `TurnTimerService`).
- [x] T028 [US3] `GraceTimerService` registrieren/injizieren in `packages/server/src/realtime/realtime.module.ts` (und Bereitstellung im Gateway-Konstruktor).
- [x] T029 [US3] In `packages/server/src/realtime/game.gateway.ts` im Disconnect-Pfad je getrenntem Sitz `graceTimer.schedule(code, playerId, reconnectDeadline, ()=>onGraceExpired(code, playerId))`; im Resume-Pfad `graceTimer.clear(code, playerId)` (abhängig T027/T012/T013).
- [x] T030 [US3] In `packages/server/src/realtime/game.gateway.ts` `onGraceExpired(code, playerId)` implementieren: atomare `repo.update` mit `resolveAbandon` (Status-Guard, Idempotenz), `graceTimer.clearAll`, `TurnTimerService.clear`, Broadcast `game:over{winner,reason:'forfeit'}`, bestehender `finishAndPersist(record, winner, 'FORFEITED')` (FR-014/014a/016).
- [x] T031 [US3] In `packages/server/src/lobby/lobby.repository.ts` Terminal-Marker unterstützen: `match-result:{code}` (JSON `{winner,reason:'forfeit',endedAt}`, TTL ~120 s) schreiben (im Forfeit-Pfad vor dem Löschen) und lesen (contracts/redis-state.md).
- [x] T032 [US3] In `packages/server/src/realtime/game.gateway.ts` `reconnect:resume` für fehlenden aktiven Record erweitern: `match-result:{code}` lesen → Ack `game-finished` + terminales `game:over`; sonst `lobby-not-found` (FR-017).

**Checkpoint**: US1–US3 funktionieren — vollständiger Reconnect-Lebenszyklus inkl. Aufgabe-Wertung.

---

## Phase 6: User Story 4 - Zug-Timer pausiert während des Reconnect-Fensters (Priority: P3)

**Goal**: Der Zug-Timer pausiert während der Trennung und läuft mit exakt der Restzeit weiter;
Timer-aus-Lobbys pausieren ohne Timer-Effekt.

**Independent Test**: Spieler am Zug trennen, < 60 s warten, reconnecten → Zug-Restzeit entspricht der
Trennungs-Restzeit (±1 s), Timer ist während der Pause nicht abgelaufen.

### Tests for User Story 4 (TDD) ⚠️

- [x] T033 [P] [US4] Integrationstest `packages/server/test/integration/reconnect-timer-pause.test.ts`: Disconnect am Zug → während Pause kein Timer-Ablauf; nach Resume `turnDeadline` = Restzeit (±1 s, SC-004); separater Fall Zug-Timer „aus" (`turnTimerSeconds=null`) → Pause/Resume ohne Timer-Wertung (FR-011/012/013).

### Implementation for User Story 4

- [x] T034 [US4] In `packages/server/src/reconnect/reconnect-state.ts` den Timer-aus-Pfad absichern (`pausedTurnRemainingMs=null` ⇒ Resume setzt `turnDeadline=null`, keine Re-Arm) und in `packages/server/src/realtime/game.gateway.ts` das Re-Arm strikt nur ausführen, wenn beide verbunden **und** `pausedTurnRemainingMs!=null` (FR-013). (Kernlogik bereits in T007/T013; hier verifizieren/feinjustieren bis T033 grün.)

**Checkpoint**: alle vier User Stories unabhängig funktionsfähig und getestet.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T035 [P] Leak-/Geheimhaltungs-Test `packages/server/test/integration/reconnect-token-not-leaked.test.ts`: `reconnectToken` erscheint in keinem `lobby:state`/`game:view`/Broadcast — nur im create/join-Ack (contracts/redis-state.md).
- [x] T036 [P] [US1] Komponententest `packages/web/tests/component/reconnect-flow.test.tsx` (FakeSocket): Token überlebt „Reload" (reconnect-store), bei `connect` wird automatisch `reconnect:resume` emittiert; bei `game:over` wird das Token geräumt.
- [x] T037 Quickstart-Validierung gemäß `specs/005-reconnect-handling/quickstart.md` (2-Spieler-Reconnect-Smoke) durchführen.
- [x] T039 [US3] Integrationstest `packages/server/test/integration/reconnect-regular-end-priority.test.ts`: reguläres Spielende (letztes Schiff versenkt) zeitgleich mit Disconnect → reguläres Ergebnis gewinnt (Sieger = Versenkender), genau eine Wertung; beide Reihenfolgen (FR-019/016).
- [x] T038 [P] CI-Gate grün stellen: `npm --workspace packages/server test`, `npm --workspace packages/web test`, Lint/Format/Build (Prinzip IV).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: keine Abhängigkeit.
- **Foundational (Phase 2)**: nach Setup; **blockiert** alle User Stories (gemeinsame Typen + reine Kernlogik + Event-Verträge).
- **User Stories (Phase 3–6)**: nach Foundational. Reihenfolge P1 → P2 → P3; US2/US3/US4 bauen funktional auf dem in US1 umgeschriebenen Gateway-Disconnect/Resume-Pfad auf.
- **Polish (Phase 7)**: nach den gewünschten User Stories.

### User Story Dependencies

- **US1 (P1)**: nur Foundational. Liefert den MVP (Trennen/Wiederkehren).
- **US2 (P2)**: nutzt den US1-Disconnect/Resume-Pfad (ergänzt Broadcasts + UI + Zugsperre). Unabhängig testbar.
- **US3 (P2)**: nutzt den US1-Disconnect/Resume-Pfad (ergänzt Grace-Timer + Aufgabe-Wertung + Marker). Unabhängig testbar.
- **US4 (P3)**: verifiziert/feinjustiert die in Foundational/US1 angelegte Timer-Pause. Unabhängig testbar.

### Within Each Story

- Tests zuerst (müssen fehlschlagen) → Implementierung bis grün.
- Gleiche Datei (`game.gateway.ts`, `reconnect-state.ts`) ⇒ Tasks sequenziell (kein [P]).

---

## Parallel Opportunities

- **Setup**: T001.
- **Foundational**: T002, T003, T004, T005 parallel (verschiedene Dateien); danach T006/T007.
- **US1 Tests**: T008, T009 parallel; T014 parallel zu Server-Tasks (Web-Datei).
- **US2**: T017, T018 parallel.
- **US3 Tests**: T023, T024, T025, T026 parallel.
- **Polish**: T035, T036, T038 parallel.

## Parallel Example: Foundational

```bash
# gemeinsam starten (verschiedene Dateien):
Task: "T002 lobby-types erweitern"
Task: "T003 events.ts erweitern"
Task: "T004 unit-test reconnect-token (fail-first)"
Task: "T005 unit-test reconnect-state (fail-first)"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational (kritisch) → 3. Phase 3 US1 →
4. **STOP & VALIDATE**: Trennen/Wiederkehren innerhalb des Fensters funktioniert, kein Leak.

### Incremental Delivery

US1 (MVP) → US2 (sichtbarer Countdown + Zugsperre) → US3 (Aufgabe-Wertung) → US4 (Timer-Pause-Fidelity)
→ Polish. Jede Story fügt Wert hinzu, ohne vorherige zu brechen.

---

## Notes

- **Keine Engine-Änderung, keine Prisma-Migration** — Aufgabe-Wertung über bestehenden
  `finishAndPersist`/`MatchStatus.FORFEITED`/Stats-Pfad.
- Fog of War ausschließlich über bestehendes `projectGameView`→`viewFor` (auch im Resume).
- `now()` in Server-Tests injizieren (deterministische 60-s-Abläufe), bestehendes 004-Muster.
- Nach jedem Task oder logischer Gruppe committen; an Checkpoints Story unabhängig validieren.
