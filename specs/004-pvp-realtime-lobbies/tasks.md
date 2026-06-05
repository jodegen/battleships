---
description: "Task list for PvP-Lobbys & Echtzeit-Online-Partie (004)"
---

# Tasks: PvP-Lobbys & Echtzeit-Online-Partie

**Input**: Design documents from `/specs/004-pvp-realtime-lobbies/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (websocket-events,
redis-state, persistence)

**Tests**: INCLUDED. Sowohl von der Spec/Nutzervorgabe ausdrücklich verlangt („Tests für
serverseitige Zugvalidierung, Fog of War, Timer-Ablauf") als auch von der Verfassung (TDD für
nicht-triviale, fairness-kritische Serverlogik). Reine Logik wird **test-first** (Red→Green→Refactor)
entwickelt; I/O-Nähte per `socket.io-client`-Integrationstests.

**Organization**: Tasks nach User Story (spec.md) gruppiert. Jede Story ist ein eigenständig
testbares Inkrement. Web-Slice ist je Story enthalten, damit Stories demonstrierbar bleiben.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisierbar (andere Datei, keine offene Abhängigkeit)
- **[Story]**: zugehörige User Story (US1…US6); Setup/Foundational/Polish ohne Story-Label
- Pfade sind repo-relativ; Server = `packages/server`, Web = `packages/web`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Abhängigkeiten, lokale Infrastruktur (Redis), Konfiguration.

- [X] T001 Server-Dependencies ergänzen in `packages/server/package.json`: `socket.io`, `@nestjs/websockets`, `@nestjs/platform-socket.io`, `ioredis`, `@socket.io/redis-adapter` (dev: `socket.io-client`, `ioredis-mock`); danach `npm install` im Repo-Root.
- [X] T002 [P] Web-Dependency `socket.io-client` ergänzen in `packages/web/package.json`.
- [X] T003 [P] Redis-Dienst (`redis:7-alpine`, Host-Port 6380→6379, Volume, Healthcheck) in `docker-compose.yml` ergänzen.
- [X] T004 [P] `REDIS_URL` + Timer-/Limit-Defaults in `packages/server/.env.example` ergänzen; `AppConfig` um `redisUrl`, `turnTimerDefaultSeconds`, `maxOpenLobbiesPerUser`, `joinRateLimit*` erweitern in `packages/server/src/config/app-config.ts` (+ Unit-Test in `packages/server/test/unit/app-config.test.ts` für die neuen Felder).
- [X] T005 [P] Redis-Service-Container im `server`-Job ergänzen in `.github/workflows/ci.yml` (neben Postgres; `REDIS_URL` als Job-Env).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Realtime-/Redis-Infrastruktur, die ALLE Stories voraussetzen.

**⚠️ CRITICAL**: Keine User-Story-Arbeit beginnt, bevor diese Phase fertig ist.

- [X] T006 [P] Typisierte Event-/Payload-Verträge (Client↔Server, Fehlercodes) als reine Typen in `packages/server/src/realtime/events.ts` gemäß `contracts/websocket-events.md`.
- [X] T007 [P] Reine Handshake-Identitäts-Auflösung `(<cookies>) => Identity` in `packages/server/src/realtime/ws-identity.ts` (+ Unit-Test `packages/server/test/unit/ws-identity.test.ts`: Session-Cookie→user, Gast-Token→guest, sonst anonym, Capability `canCreateLobby`).
- [X] T008 `RedisService` (ioredis-Lebenszyklus + dedizierte pub/sub-Clients) in `packages/server/src/redis/redis.service.ts` und `RedisModule` in `packages/server/src/redis/redis.module.ts`.
- [X] T009 Socket.IO-Redis-Adapter am Bootstrap setzen (custom `IoAdapter` mit `@socket.io/redis-adapter`) in `packages/server/src/main.ts`; Cookie-fähiger CORS/Handshake (`WEB_ORIGIN`, credentials).
- [X] T010 Socket-Handshake-Auth-Middleware (`io.use`) in `packages/server/src/realtime/ws-auth.middleware.ts`: nutzt `ws-identity` + bestehende `SessionService`/`GuestTokenService`, setzt `socket.data.identity`.
- [X] T011 `LobbyRepository` (Redis-CRUD für `LobbyRecord` mit atomarem WATCH/MULTI/EXEC bzw. Lua, TTL, `processedMoveIds`, `turnDeadline`) in `packages/server/src/lobby/lobby.repository.ts` gemäß `contracts/redis-state.md`.
- [X] T012 `GameGateway`-Grundgerüst (`@WebSocketGateway`, connect/disconnect, Raum-Join je Lobby-Code, `error`-Emit) in `packages/server/src/realtime/game.gateway.ts`; `RealtimeModule` in `packages/server/src/realtime/realtime.module.ts`.
- [X] T013 Module verdrahten in `packages/server/src/app.module.ts` (RedisModule, RealtimeModule, LobbyModule, GameModule, PersistenceModule) und Wiederverwendung von Auth/Stats-Providern.
- [X] T014 [P] Typed Socket-Client (Verbindung, Event-Typen aus Contract, `withCredentials`) in `packages/web/src/realtime/socket-client.ts`.
- [X] T015 [P] Integrations-Test-Harness: gebootstrappte Nest-App + `socket.io-client` + Redis (`ioredis-mock` default, echtes Redis wenn `REDIS_URL`) in `packages/server/test/integration/setup-ws.ts`.

**Checkpoint**: WebSocket-Server nimmt authentifizierte Verbindungen an, Redis & Adapter laufen, Test-Harness steht.

---

## Phase 3: User Story 1 - Lobby erstellen und per Code beitreten (Priority: P1) 🎯 MVP

**Goal**: Eingeloggter Spieler erstellt Lobby (Einstellungen + lesbarer Code); user/guest treten per Code bei; bei zwei Spielern → `placing`.

**Independent Test**: Ein eingeloggter Client erstellt eine Lobby und erhält einen Code; ein zweiter Client tritt (einmal eingeloggt, einmal als Gast) per Code bei; Status wechselt zu `placing`; ungültiger/voller Code wird abgelehnt.

### Tests for User Story 1 ⚠️ (zuerst schreiben, müssen fehlschlagen)

- [X] T016 [P] [US1] Unit-Test Lobby-Code-Generator (lesbar, ambiguitätsfrei, deterministisch mit Seed) in `packages/server/test/unit/lobby-code.test.ts`.
- [X] T017 [P] [US1] Unit-Test Lobby-Zustandsmaschine (waiting→placing bei 2 Spielern; Seat-Freigabe; Host-Austritt schließt — bei explizitem Leave **und** Disconnect; Drittbeitritt verboten) in `packages/server/test/unit/lobby-state.test.ts`.
- [X] T018 [P] [US1] Integrationstest `lobby:create` (nur `user`; guest/anon → `forbidden`; Code im Ack; Status `waiting`) in `packages/server/test/integration/lobby-create.test.ts`.
- [X] T019 [P] [US1] Integrationstest `lobby:join` (user & guest; `invalid-code`/`lobby-not-found`/`lobby-full`; Gast-Name-Validierung; Beitritts-Drosselung `rate-limited`; Obergrenze `too-many-lobbies`) in `packages/server/test/integration/lobby-join.test.ts`.

### Implementation for User Story 1

- [X] T020 [P] [US1] Reiner Lobby-Code-Generator (Crockford-base32, injizierbarer Zufall) in `packages/server/src/lobby/lobby-code.ts`.
- [X] T021 [P] [US1] Reine Lobby-Zustandsmaschine + Seat-Logik in `packages/server/src/lobby/lobby-state.ts`.
- [X] T022 [P] [US1] DTOs `create-lobby.dto.ts` und `join-lobby.dto.ts` (class-validator: `LobbySettings`, Code, optionaler Gast-Name) in `packages/server/src/lobby/dto/`.
- [X] T023 [US1] `LobbyService` (create/join/leave, Seat-Zuteilung, Code-Kollisionsprüfung, Obergrenze offener Lobbys `open-lobbies:{userId}`, Beitritts-Drosselung `join-fails:{id}`, 10-min-Timeout) in `packages/server/src/lobby/lobby.service.ts`; `LobbyModule` in `packages/server/src/lobby/lobby.module.ts` (depends on T011, T020–T022).
- [X] T024 [US1] Gast-Anzeigename-Validierung wiederverwenden/anbinden (`packages/server/src/auth/display-name.ts`) im Join-Pfad (FR-006).
- [X] T025 [US1] Gateway-Handler `lobby:create`/`lobby:join`/`lobby:leave` + `lobby:state`-Broadcast in `packages/server/src/realtime/game.gateway.ts` (Capability-Gate `create`=user).
- [X] T025a [US1] Pre-Game-Austritts-/Disconnect-Routing gemäß FR-011a in `packages/server/src/realtime/game.gateway.ts`: in `waiting`/`placing` schließt ein Host-Austritt die Lobby, ein Austritt des zweiten Spielers gibt den Sitz frei und setzt auf `waiting` zurück — für explizites `lobby:leave` **und** `disconnect` (Abgrenzung zum `in_progress`-Forfeit in T050).
- [X] T026 [P] [US1] Online-Hook `useOnlineGame` (Lobby anlegen/beitreten, Lobby-State abonnieren) in `packages/web/src/realtime/useOnlineGame.ts`.
- [X] T027 [P] [US1] Lobby-Screen (erstellen mit Einstellungen, beitreten per Code, Gast-Name) in `packages/web/app/(online)/lobby/page.tsx` + `packages/web/src/components/online/LobbyPanel.tsx`.
- [X] T028 [P] [US1] Web-Test Lobby-Flow (erstellen/beitreten, Code-Anzeige) in `packages/web/tests/component/online-lobby.test.tsx`.
- [X] T028a [P] [US1] Integrationstest Pre-Game-Disconnect (FR-011a): Host-Disconnect in `waiting`/`placing` → Lobby geschlossen (Restteilnehmer erhält `lobby:state`/`error`); Disconnect des zweiten Spielers → Sitz frei, zurück zu `waiting` in `packages/server/test/integration/pre-game-disconnect.test.ts`.

**Checkpoint**: Zwei Clients teilen eine Lobby; Status `placing`. US1 eigenständig testbar.

---

## Phase 4: User Story 2 - Schiffe platzieren (server-validiert) (Priority: P1)

**Goal**: Beide platzieren server-validierte Flotten; sind beide bestätigt → `in_progress` (Engine `createGame`), Startspieler bestimmt.

**Independent Test**: In einer `placing`-Lobby reichen beide gültige Flotten ein → `in_progress`; eine ungültige Platzierung wird abgelehnt; gegnerische Flotte ist während `placing` nicht abrufbar.

**Depends on**: US1 (Lobby/Seats vorhanden).

### Tests for User Story 2 ⚠️

- [X] T029 [P] [US2] Unit-Test Settings→`GameConfig`-Mapping (CLASSIC_FLEET/DEFAULT_BOARD, allowTouching, extraTurnOnHit) in `packages/server/test/unit/game-config.test.ts`.
- [X] T030 [P] [US2] Integrationstest `fleet:place`: gültige Flotte → `placed`; beide → `in_progress` + `turn:changed`; ungültige Flotte → `invalid-placement` (kein Statuswechsel); kein Leak gegnerischer Flotte in `placing` in `packages/server/test/integration/fleet-place.test.ts`.

### Implementation for User Story 2

- [X] T031 [P] [US2] DTO `place-fleet.dto.ts` (Code + `ShipPlacement[]`) in `packages/server/src/lobby/dto/place-fleet.dto.ts`.
- [X] T032 [P] [US2] Reines Settings→`GameConfig`-Mapping + Seat→`PlayerId`-Zuordnung (Host→A) in `packages/server/src/game/game-config.ts`.
- [X] T033 [US2] `GameService`-Naht zur Engine (`validatePlacement`, `createGame`, GameState in `LobbyRecord` ablegen) in `packages/server/src/game/game.service.ts`; `GameModule` in `packages/server/src/game/game.module.ts` (depends on T011, T032).
- [X] T034 [US2] Gateway-Handler `fleet:place`: Engine-Validierung, `placed`-Flag, Übergang `placing→in_progress` bei beiden Flotten, initiale `game:view`-Projektion je Spieler in `packages/server/src/realtime/game.gateway.ts`.
- [X] T035 [P] [US2] Platzierungs-UI (online) auf Basis der vorhandenen `PlacementBoard`-Komponente in `packages/web/src/components/online/OnlinePlacement.tsx` + Einbindung in `packages/web/app/(online)/play/page.tsx`.
- [X] T036 [P] [US2] `useOnlineGame` um Platzierung (senden, „placed"-Status, Start-Übergang) erweitern in `packages/web/src/realtime/useOnlineGame.ts`.
- [X] T037 [US2] Idempotenz-/Konsistenzprüfung: erneutes `fleet:place` desselben Seats überschreibt nur bis `in_progress`, danach abgelehnt (`not-in-progress`) — in `game.gateway.ts`/`game.service.ts`.
- [X] T038 [P] [US2] Web-Test Platzierung→Start in `packages/web/tests/component/online-placement.test.tsx`.

**Checkpoint**: Beide Flotten server-validiert; Partie startet. US2 testbar.

---

## Phase 5: User Story 3 - Abwechselnde Echtzeit-Züge bis zum Sieg (Priority: P1) 🎯 Kern

**Goal**: Server-autoritative Schüsse (Engine), Fog of War strukturell über `viewFor`, Extrazug-Regel, Idempotenz, Sieg-Erkennung; Disconnect→Forfeit (FR-010a).

**Independent Test**: Spieler am Zug schießt → Ergebnis live an beide; Zughoheit wechselt regelkonform; bei Versenken aller Schiffe wird Sieger gemeldet; kein Event enthält ungetroffene gegnerische Schiffe; doppelte `moveId` zählt einmal.

**Depends on**: US2 (laufende Partie).

### Tests for User Story 3 ⚠️

- [X] T039 [P] [US3] Unit-Test Fog-of-War-Hülle (Projektion strikt = engine `viewFor`; niemals ungetroffene Gegnerschiffe) in `packages/server/test/unit/fog-of-war.test.ts`.
- [X] T040 [P] [US3] Unit-Test `move-dedup` (bekannte `moveId` → No-Op, vorheriges Ergebnis; Mengen-Fortschreibung) in `packages/server/test/unit/move-dedup.test.ts`.
- [X] T041 [P] [US3] Integrationstest Zugvalidierung (`not-your-turn`, `already-shot`, `out-of-bounds`, `not-in-progress` → Reject ohne State-Änderung) in `packages/server/test/integration/shot-validation.test.ts`.
- [X] T042 [P] [US3] Integrationstest **Fog-of-War-Leak**: ganze Partie spielen, assertet dass KEIN emittiertes Event ungetroffene gegnerische Schiffszellen enthält (SC-003) in `packages/server/test/integration/fog-of-war-leak.test.ts`.
- [X] T043 [P] [US3] Integrationstest Extrazug-Regel (an: Treffer behält Zug, miss wechselt; aus: jeder Schuss wechselt) in `packages/server/test/integration/extra-turn.test.ts`.
- [X] T044 [P] [US3] Integrationstest Idempotenz (doppelte `moveId` → ein Schuss gewertet, SC-008) in `packages/server/test/integration/move-idempotency.test.ts`.
- [X] T045 [P] [US3] Integrationstest Sieg & Forfeit (`game:over` `all-sunk`; Disconnect/Leave in `in_progress` → `game:over` `forfeit`, FR-010a) in `packages/server/test/integration/game-over.test.ts`.

### Implementation for User Story 3

- [X] T046 [P] [US3] Reine Fog-of-War-Projektion (einziger Pfad GameState→Client-Payload, nutzt engine `viewFor`) in `packages/server/src/game/fog-of-war.ts`.
- [X] T047 [P] [US3] Reine `move-dedup`-Logik in `packages/server/src/game/move-dedup.ts`.
- [X] T048 [US3] `GameService.applyShot`-Pfad: atomare Redis-Transaktion (Dedup-Prüfung → engine `applyShot` → State/`processedMoveIds`/Statuswechsel) in `packages/server/src/game/game.service.ts` (depends on T046, T047).
- [X] T049 [US3] Gateway-Handler `shot:fire`: Validierung/Reject, Broadcasts `shot:result` + `turn:changed`, gezielte `game:view`-Resync, `game:over` in `packages/server/src/realtime/game.gateway.ts`.
- [X] T050 [US3] Disconnect/Leave-Behandlung in `in_progress` → Forfeit-Sieg + `game:over` (`reason:'forfeit'`) in `game.gateway.ts` (Status-abhängige Matrix gem. `contracts/websocket-events.md`).
- [X] T051 [P] [US3] Online-Spielbrett (eigene Flotte + eigene Schüsse, Schuss-Intent mit `moveId`, Schussergebnis-Anzeige) in `packages/web/src/components/online/OnlineBoard.tsx`.
- [X] T052 [US3] `useOnlineGame` um Schießen/`game:view`/`shot:result`/`game:over` erweitern (nur Anzeige, Server ist autoritativ) in `packages/web/src/realtime/useOnlineGame.ts`.
- [X] T053 [P] [US3] Web-Test Online-Spielzug & Spielende-Anzeige in `packages/web/tests/component/online-play.test.tsx`.

**Checkpoint**: Vollständige Online-Partie spielbar, server-autoritativ, Fog of War garantiert. **MVP-Trio (US1–US3) komplett.**

---

## Phase 6: User Story 4 - Server-sichtbarer Zug-Timer (Priority: P2)

**Goal**: Serverseitige Zug-Deadline; Ablauf → Zugverfall (kein Schuss) → Gegner; Treffer (Extrazug) → Deadline-Neustart; Timer „aus" → keine Deadline.

**Independent Test**: Timer ohne Aktion ablaufen lassen → Zug geht ohne Schuss an Gegner; nach Treffer Countdown-Neustart; bei „aus" verfällt nichts.

**Depends on**: US3.

### Tests for User Story 4 ⚠️

- [X] T054 [P] [US4] Integrationstest Timer-Ablauf mit injizierbarer Zeit (Deadline überschritten → genau ein Zugwechsel ohne Schuss, `turn:changed reason:'timeout'`) in `packages/server/test/integration/turn-timer.test.ts`.
- [X] T055 [P] [US4] Integrationstest Deadline-Neustart bei Treffer-mit-Extrazug und „Timer aus" → keine Deadline/keine Expiry (FR-022/023) in `packages/server/test/integration/turn-timer-restart.test.ts`.

### Implementation for User Story 4

- [X] T056 [US4] `TurnTimerService` (Deadline setzen aus `LobbySettings`, In-Process-Watcher, atomare Re-Prüfung gegen Redis-`turnDeadline`, injizierbare Zeitquelle) in `packages/server/src/game/turn-timer.service.ts`.
- [X] T057 [US4] Deadline-Lebenszyklus an Zugbeginn/Treffer/Zugwechsel in `GameService`/`GameGateway` einhängen; `turnDeadline` in `game:view`/`turn:changed` ausliefern; `timer:expired`-Broadcast.
- [X] T058 [US4] Zugverfall ausführen (Zugwechsel ohne Schuss) bei Ablauf in `turn-timer.service.ts`/`game.gateway.ts`.
- [X] T059 [P] [US4] Countdown-UI aus `turnDeadline` (clientseitig berechnet) in `packages/web/src/components/online/TurnTimer.tsx` + Einbindung in `play/page.tsx`.
- [X] T060 [P] [US4] Web-Test Countdown-Anzeige/Reset in `packages/web/tests/component/turn-timer.test.tsx`.

**Checkpoint**: Serverseitiger Timer mit Countdown; Ablaufverhalten korrekt.

---

## Phase 7: User Story 5 - Live-Statusanzeige für beide Spieler (Priority: P2)

**Goal**: Echtzeit-Status (verbunden, Schiffe platziert, am Zug) für eigenen und gegnerischen Spieler; Schussergebnisse/Spielende als Live-Update — innerhalb des Fog of War.

**Independent Test**: Bei Beitritt/Platzierung/Zugwechsel/Schuss/Spielende erhalten beide Clients passende Live-Updates.

**Depends on**: US1 (lobby:state) + US3 (Spielereignisse). Erweitert vorhandene Broadcasts.

### Tests for User Story 5 ⚠️

- [X] T061 [P] [US5] Integrationstest Presence/Status (connect→`connected`, `placed`-Flag, `turn`-Wechsel werden an beide gebroadcastet) in `packages/server/test/integration/presence-status.test.ts`.

### Implementation for User Story 5

- [X] T062 [US5] Presence-Aktualisierung (connect/disconnect → `seat.connected`) + `lobby:state`-Broadcast in `packages/server/src/realtime/game.gateway.ts`.
- [X] T063 [US5] `LobbyView` vollständig befüllen (players[connected,placed,playerId,displayName,isGuest], `turn`) im Broadcast-Pfad (`lobby.service`/`game.gateway`).
- [X] T064 [P] [US5] Gegner-/Eigenstatus-Anzeige (verbunden, platziert, am Zug) in `packages/web/src/components/online/OpponentStatus.tsx` + Einbindung.
- [X] T065 [P] [US5] `useOnlineGame` um abgeleiteten Statusview (eigener/gegnerischer Status, am Zug) erweitern in `packages/web/src/realtime/useOnlineGame.ts`.
- [X] T066 [P] [US5] Web-Test Statusanzeige-Updates in `packages/web/tests/component/online-status.test.tsx`.

**Checkpoint**: Beide Spieler sehen Live-Status transparent.

---

## Phase 8: User Story 6 - Statistik-Update bei eingeloggten Spielern (Priority: P3)

**Goal**: Bei Partieende `Match`/`MatchMove` persistieren und Statistik eingeloggter Spieler idempotent fortschreiben; Gäste ohne Eintrag.

**Independent Test**: Partie zu Ende spielen → `Match`+`MatchMove` vorhanden, Stats des eingeloggten Siegers/Verlierers aktualisiert (genau einmal), Gast ohne Eintrag; doppeltes „finished" zählt einmal.

**Depends on**: US3 (Partieende-Trigger).

### Tests for User Story 6 ⚠️

- [X] T067 [P] [US6] Unit-Test `pvp-result` (GameState+Seats → winnerSeat, per-Seat win/loss nur für eingeloggte, MatchMove-Payload) in `packages/server/test/unit/pvp-result.test.ts`.
- [X] T068 [P] [US6] Integrationstest Persistenz/Stats-Naht (Match+MatchMove geschrieben; Stats nur eingeloggt; Gast ohne Eintrag; doppeltes finish idempotent; Forfeit → `FORFEITED`) in `packages/server/test/integration/pvp-persistence.test.ts`.

### Implementation for User Story 6

- [X] T069 [US6] Prisma-Schema: `model Match`, `model MatchMove`, Enums (`MatchMode`, `MatchStatus`, `MoveResult`) + `User`-Relationen in `packages/server/prisma/schema.prisma` (gem. data-model.md §3).
- [X] T070 [US6] Prisma-Migration erzeugen (`prisma migrate dev`) → `packages/server/prisma/migrations/` und `prisma generate`.
- [X] T071 [P] [US6] Reine `pvp-result`-Ableitung in `packages/server/src/persistence/pvp-result.ts`.
- [X] T072 [US6] `MatchService` (Transaktion: Match+MatchMove schreiben, idempotent über `matchKey`; danach `StatsService.recordResult(userId, resultId=match.id, outcome)` je eingeloggtem Seat) in `packages/server/src/persistence/match.service.ts`; `PersistenceModule` in `packages/server/src/persistence/persistence.module.ts` (depends on T069–T071, bestehendes `StatsService`).
- [X] T073 [US6] Persistenz an `game:over` (sowohl `all-sunk` als auch `forfeit`) im Gateway einhängen + Lobby-Aufräumen danach in `packages/server/src/realtime/game.gateway.ts`.
- [X] T074 [P] [US6] Web: Profil-/Statistikanzeige nach Online-Partie aktualisieren (bestehendes `ProfilePanel` wiederverwenden) in `packages/web/app/(online)/play/page.tsx`.

**Checkpoint**: Beendete PvP-Partien persistiert und in Stats eingeloggter Spieler reflektiert.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Querschnitt, Qualität, Validierung.

- [X] T075 [P] Server-`README.md` um Realtime/Redis/Online-Flow ergänzen in `packages/server/README.md`.
- [X] T076 [P] Web-`README.md` um Online-Screens/Setup ergänzen in `packages/web/README.md`.
- [X] T077 Lint & Typecheck über alle Pakete grün (`npm run lint`, `npm run typecheck`) — Warnungen behandeln (Prinzip IV).
- [X] T078 Gesamte Testsuite grün (`npm test`); CI-`server`-Job inkl. Redis prüfen.
- [ ] T079 `quickstart.md`-Smoke-Flow manuell durchspielen (2 Tabs: Lobby→Platzierung→Partie→Timer→Disconnect→Stats).
- [X] T080 [P] Aufräum-/TTL-Pfade verifizieren (10-min-waiting-Timeout, finished-Cleanup) — kurzer Integrationstest in `packages/server/test/integration/lobby-cleanup.test.ts`.
- [X] T080a [P] Nebenläufigkeits-Smoke (SC-009): N parallele Lobbys/Partien (Richtwert ≥ 50) auf einer Instanz hochfahren und je einen Zug spielen; assertet, dass Schussergebnisse innerhalb der SC-005-Reaktionszeit zugestellt werden, in `packages/server/test/integration/concurrency-smoke.test.ts`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: keine Abhängigkeit — sofort startbar.
- **Foundational (Phase 2)**: nach Setup — **blockiert alle Stories**.
- **User Stories (Phase 3–8)**: nach Foundational. Inhaltlich sequenziell verkettet (Domäne):
  US1 → US2 → US3 → {US4, US5, US6}. US4/US5/US6 bauen auf US3 auf, sind untereinander unabhängig.
- **Polish (Phase 9)**: nach den gewünschten Stories.

### User Story Dependencies

- **US1 (P1)**: nach Foundational — keine Story-Abhängigkeit.
- **US2 (P1)**: benötigt US1 (Lobby/Seats).
- **US3 (P1)**: benötigt US2 (laufende Partie). **Kern/MVP-Abschluss.**
- **US4 (P2)**: benötigt US3 (Zugfluss).
- **US5 (P2)**: benötigt US1+US3 (Status-/Spielereignisse); erweitert Broadcasts.
- **US6 (P3)**: benötigt US3 (Partieende-Trigger); unabhängig von US4/US5.

### Within Each User Story

- Tests zuerst (Red), dann Implementierung (Green→Refactor).
- Reine Funktionen vor Service vor Gateway-Handler vor Web-Slice.
- Story-Abschluss vor nächster Priorität.

### Parallel Opportunities

- Setup: T002–T005 [P] parallel.
- Foundational: T006/T007/T014/T015 [P] parallel; T008→T009, T011/T012→T013 verkettet.
- Innerhalb je Story: alle `[P]`-Tests parallel; reine Funktionen (`*-code`, `*-state`, `fog-of-war`, `move-dedup`, `pvp-result`) parallel; Web-Komponenten parallel zu Server-Internals.
- US4/US5/US6 können nach US3 parallel von mehreren Personen bearbeitet werden.

---

## Parallel Example: User Story 3 (Kern)

```bash
# Tests zuerst (parallel):
Task: "Unit-Test fog-of-war in packages/server/test/unit/fog-of-war.test.ts"
Task: "Unit-Test move-dedup in packages/server/test/unit/move-dedup.test.ts"
Task: "Integration shot-validation in packages/server/test/integration/shot-validation.test.ts"
Task: "Integration fog-of-war-leak in packages/server/test/integration/fog-of-war-leak.test.ts"

# Danach reine Funktionen parallel:
Task: "fog-of-war.ts in packages/server/src/game/fog-of-war.ts"
Task: "move-dedup.ts in packages/server/src/game/move-dedup.ts"
```

---

## Implementation Strategy

### MVP First (US1 → US2 → US3)

1. Phase 1 Setup → Phase 2 Foundational (CRITICAL, blockiert alles).
2. US1 (Lobby) → US2 (Platzierung) → US3 (Echtzeit-Partie).
3. **STOP & VALIDATE**: vollständige, server-autoritative Online-Partie mit Fog of War — das ist
   der spielbare Kern und löst die M2-Prinzip-I-Abweichung auf.

### Incremental Delivery

1. Setup + Foundational → Fundament steht.
2. + US1 → + US2 → + US3 → **MVP** (spielbare PvP-Partie).
3. + US4 (Timer) → + US5 (Live-Status) → + US6 (Statistik). Jede Story additiv und eigenständig testbar.

### Notes

- `[P]` = andere Datei, keine offene Abhängigkeit.
- Engine (`packages/engine`) bleibt **unverändert** — nur konsumiert.
- Fog of War strukturell: jede client-gerichtete Brettsicht nur über `fog-of-war.ts`→`viewFor`.
- Nach jedem Task oder logischer Gruppe committen; an Checkpoints Story eigenständig validieren.
