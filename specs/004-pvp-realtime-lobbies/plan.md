# Implementation Plan: PvP-Lobbys & Echtzeit-Online-Partie

**Branch**: `004-pvp-realtime-lobbies` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-pvp-realtime-lobbies/spec.md`

## Summary

Meilenstein 3 macht das Spiel **server-autoritativ** und **online spielbar**. Das bestehende
Paket `packages/server` (NestJS) wird um einen **Socket.IO-WebSocket-Layer** erweitert: ein
Gateway mit **einem Raum pro Lobby**. **Redis** hält den aktiven Lobby- und Spielzustand,
Presence und dient als Pub/Sub-Backplane (Socket.IO-Redis-Adapter), sodass das Design
mehr-Instanz-fähig ist (gemessenes Lastziel bleibt jedoch Einzelinstanz/Dutzende Partien, SC-009).
Die **bestehende, unveränderte Engine** (`@schiffe/engine`) ist die **einzige** Instanz der
Spiellogik: Zugvalidierung (`applyShot`), Schussauswertung (`resolveShot`), Extrazug-Regel,
Siegerkennung und – entscheidend – die **Fog-of-War-Projektion** (`viewFor`) laufen ausschließlich
serverseitig. Der Server hält den vollständigen Spielzustand inkl. **beider** Flotten in Redis und
sendet jedem Client per `viewFor` nur dessen sichtbaren Teilzustand; ungetroffene gegnerische
Schiffe verlassen den Server nie (FR-013, SC-003). Der **Zug-Timer** wird serverseitig verwaltet
(Deadline im Redis-Spielzustand + In-Process-Watcher der raum-besitzenden Instanz); Ablauf → Zug
verfällt → Gegner ist dran, Treffer (mit Extrazug) startet die Deadline neu (FR-020–023).
**Idempotente Zug-Events** über eine client-erzeugte `moveId` verhindern Doppelzählung bei
Re-Send/Lag (FR-017, SC-008). Beendete Partien werden über **neue Prisma-Modelle `Match` und
`MatchMove`** (Spec §9) persistiert und aktualisieren – über den bestehenden, idempotenten
Stats-Schreibpfad – die Statistik der **eingeloggten** Spieler (Gäste: keine Statistik,
FR-024–026). `packages/web` erhält die nötigen, bewusst schlichten Screens (Lobby
erstellen/beitreten, Platzierung, Online-Brett mit Live-Updates und Timer-Countdown). Die
nicht-triviale Serverlogik (Lobby-Zustandsmaschine, Fog-of-War-Naht, Timer-Ablauf,
Idempotenz, Beitritts-Drosselung) wird testgetrieben (Vitest + `socket.io-client`-Integration)
entwickelt. **Dieses Feature löst die in M2 dokumentierte Prinzip-I-Abweichung auf.**

## Technical Context

**Language/Version**: TypeScript 5.x (`strict`, kein `any`) über alle Pakete. Node 20 (CI).

**Primary Dependencies**:
- Server (neu): `@nestjs/websockets` + `@nestjs/platform-socket.io`, `socket.io`, `ioredis`
  (Redis-Client), `@socket.io/redis-adapter` (Pub/Sub-Backplane). Bestehend weiter genutzt:
  NestJS 10, Prisma 5, `class-validator`/`class-transformer`, `cookie-parser`.
- Geteilt: `@schiffe/engine` — serverseitig importiert als **einzige** Spiellogik
  (`createGame`, `applyShot`, `resolveShot`, `viewFor`, `validatePlacement`, `isOver`,
  `getWinner`, Typen). **Keine** Regel-Reimplementierung; Engine bleibt unverändert.
- Web (neu): `socket.io-client` + dünner typed Socket-Client und Online-Screens.

**Storage**:
- **Redis** (neu, lokal via Docker Compose): aktiver Lobby-/Spielzustand (serialisierte
  `GameState` inkl. beider Boards), Presence/Verbindungsstatus, Lobby-Code→Lobby-Index,
  verarbeitete `moveId`s (Dedup), Zug-Deadline, Pub/Sub-Backplane (Socket.IO-Adapter).
  Flüchtig mit TTL; **nicht** die Quelle der Wahrheit für Regeln (das ist die Engine).
- **PostgreSQL/Prisma** (bestehend, erweitert): bei Partieende persistierte `Match`- und
  `MatchMove`-Datensätze (Spec §9) sowie Fortschreibung der `Stat`-Aggregate eingeloggter
  Spieler über den bestehenden idempotenten Schreibpfad (`MatchResult`-Ledger).

**Testing**: Vitest (einheitlich). **TDD** für die nicht-triviale Serverlogik:
Unit-Tests für reine Funktionen (Lobby-Zustandsübergänge, Code-Generierung, Identität→Seat,
Fog-of-War-Projektion über `viewFor`, Idempotenz-Helfer). Integrationstests via
`socket.io-client` gegen die gebootstrappte Nest-App + Redis (Test-Redis bzw. `ioredis-mock`,
siehe research.md) für: server-seitige Zugvalidierung, **Fog of War (kein Leak gegnerischer
Schiffe in irgendeinem emittierten Event)**, Timer-Ablauf, Idempotenz, Lobby-Lebenszyklus,
Persistenz-/Stats-Naht. Engine bleibt unverändert (bereits abgedeckt).

**Target Platform**: Node-20-Service (NestJS + Socket.IO) hinter HTTP/WS; Browser-Client
(Next.js). Mehr-Instanz-**fähig** per Redis-Adapter; gemessenes Lastziel ist
Einzelinstanz/Dutzende gleichzeitige Partien (SC-009).

**Project Type**: Web (Backend-Service `packages/server` + Frontend `packages/web`) im
npm-Workspace-Monorepo; Abhängigkeitsrichtung ausschließlich Richtung `@schiffe/engine`.

**Performance Goals**: Schussergebnis als Live-Update bei beiden Clients typischerweise < 1 s
nach dem Zug (SC-005). Mehrere Dutzend gleichzeitige Partien auf einer Instanz ohne Verletzung
dieser Reaktionszeit (SC-009).

**Constraints**:
- **Server-autoritativ** (Prinzip I, FR-012, SC-004): Clients senden nur Intents; alle
  regelrelevanten Entscheidungen fallen serverseitig in der Engine.
- **Fog of War** (FR-013, SC-003): An keinen Client werden je ungetroffene gegnerische
  Schiffspositionen gesendet — jede client-gerichtete Projektion läuft über `viewFor`.
- **Idempotenz** (FR-017, SC-008): doppelte `moveId` zählt höchstens einmal.
- **Zug-Timer serverseitig** (FR-020–023): Deadline & Verfall entscheidet der Server.
- **Minimales Anti-Abuse** (FR-006a/b): Beitritts-Drosselung gegen Code-Erraten + Obergrenze
  offener Lobbys pro Nutzer; **kein** Event-Throttling/Schimpfwortfilter in diesem Feature.
- **Reconnect & Quick-Play ausgeschlossen** (FR-027): Verbindungsverlust während `in_progress`
  → sofort Sieg-durch-Aufgabe, gewertet (FR-010a). Kein Wiedereintritt in laufende Partien.

**Scale/Scope**: Ein WebSocket-Gateway (1 Lobby = 1 Raum), eine Lobby-Zustandsmaschine
(`waiting`→`placing`→`in_progress`→`finished`), ein Redis-State-Repository, eine
Timer-Komponente, Match/MatchMove-Persistenz + Stats-Naht, minimale Beitritts-Drosselung, sowie
die Online-Screens in `packages/web`. Einzelinstanz-Lokalbetrieb als Lastziel.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Bewertung gegen `.specify/memory/constitution.md` v1.0.0:

| Prinzip | Status | Begründung |
|---------|--------|------------|
| I. Server-autoritative Spiellogik (NON-NEGOTIABLE) | ✅ PASS (stärkt das Prinzip) | Genau das Ziel dieses Features: die **gesamte** Spiellogik läuft serverseitig in der Engine; Clients senden nur Intents (Platzierung, Schuss). Fog of War wird serverseitig über `viewFor` erzwungen — verdeckte gegnerische Positionen verlassen den Server nie (FR-013). Der **client-gemeldete** KI-Ergebnis-Intake aus M2 wird hier für kompetitive PvP-Partien **abgelöst**: der Server leitet das Ergebnis autoritativ aus dem Spielzustand ab. → **Auflösung der M2-Abweichung.** |
| II. Test-First / TDD (Engine) (NON-NEGOTIABLE) | ✅ PASS | Es wird **keine** Engine-Logik geändert (sie wird nur konsumiert); das Engine-TDD-Gebot bleibt erfüllt (bestehende Abdeckung). Darüber hinaus wird die nicht-triviale **Server**-Logik testgetrieben entwickelt (Zustandsmaschine, Fog-of-War-Naht, Timer, Idempotenz) — entspricht der ausdrücklichen Nutzervorgabe „Tests für Zugvalidierung, Fog of War, Timer-Ablauf". |
| III. Geteilte, framework-unabhängige Engine (SSoT) | ✅ PASS | Der Server importiert `@schiffe/engine` als **einzige** Regelquelle; es entsteht keine zweite Regel-Implementierung. Redis hält nur (de)serialisierten Engine-`GameState` + Transport-/Presence-Metadaten, trifft aber keine Regelentscheidung. Abhängigkeitsrichtung bleibt server/web → engine; die Engine hängt von nichts ab. |
| IV. Hohe Codequalität | ✅ PASS | `strict` TS ohne `any`; ESLint/Prettier wie im Monorepo; ein Test-Runner (Vitest); kleine, zweckbenannte Module (lobby/game/realtime/timer/persistence); DTO-/Event-Validierung statt Ad-hoc-Prüfungen; CI-Job `server` wird um Redis-Service erweitert. |

**Ergebnis (vor Phase 0)**: Alle Gates bestanden, **keine Verstöße**. Dieses Feature beseitigt
die einzige bisher dokumentierte Abweichung (Prinzip I, M2). Zwei bewusste Architektur-Urteile
(Redis-Adapter jetzt einbauen trotz Einzelinstanz-Lastziel; `Match`/`MatchMove` über die reine
Statistikpflicht der Spec hinaus) sind in *Complexity Tracking* begründet — beide sind
ausdrückliche Nutzervorgaben, keine Verfassungskonflikte.

**Re-Check nach Phase 1 (Design)**: Unverändert bestanden. Das Design hält die
Abhängigkeitsschichtung ein (web/server → engine), trifft **keine** Spielregelentscheidung
außerhalb der Engine, projiziert jede client-gerichtete Sicht ausschließlich über `viewFor`
(Fog of War strukturell garantiert) und kapselt die testbare Serverlogik in reine Funktionen.
Die Contracts (websocket-events, redis-state) führen keine konkurrierende Regelquelle ein.

## Project Structure

### Documentation (this feature)

```text
specs/004-pvp-realtime-lobbies/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 — Technologie-/Pattern-Entscheidungen (Socket.IO+Nest, Redis, Timer, Tests)
├── data-model.md        # Phase 1 — Redis-Live-State + neue Prisma-Modelle (Match, MatchMove), Lobby-Zustandsmaschine
├── quickstart.md        # Phase 1 — Redis+Postgres via Docker, Server+Web starten, 2-Spieler-Smoke-Flow
├── contracts/           # Phase 1
│   ├── websocket-events.md   # Socket.IO-Events (Intents hinein, Fog-of-War-State/Events heraus), Auth, Fehler
│   ├── redis-state.md        # Redis-Keys, Serialisierung, TTL, Dedup, Presence, Pub/Sub-Adapter
│   └── persistence.md        # Match/MatchMove-Schreibpfad + idempotente Stats-Naht bei Partieende
├── checklists/
│   └── requirements.md  # (aus /speckit-specify) Spec-Qualitäts-Checkliste
└── tasks.md             # Phase 2 output (/speckit-tasks — NICHT hier erzeugt)
```

### Source Code (repository root)

Erweiterung des bestehenden `packages/server` (NestJS) um den Realtime-/Lobby-/Spiel-Layer und
`packages/web` um Online-Screens. Lokales Redis ergänzt `docker-compose.yml`.

```text
docker-compose.yml                    # + Redis-Dienst (z. B. Host-Port 6380 → Container 6379, Volume)

packages/
├── engine/                           # bestehend (M1) — UNVERÄNDERT, nur konsumiert
├── server/                           # bestehend (M2) — erweitert
│   ├── src/
│   │   ├── main.ts                   # + Socket.IO-Adapter (Redis) am Nest-App-Bootstrap
│   │   ├── app.module.ts             # + RealtimeModule, LobbyModule, GameModule, RedisModule
│   │   ├── redis/
│   │   │   ├── redis.module.ts
│   │   │   └── redis.service.ts       # ioredis-Lebenszyklus; Pub/Sub-Clients für Adapter
│   │   ├── realtime/
│   │   │   ├── realtime.module.ts
│   │   │   ├── game.gateway.ts        # @WebSocketGateway — ein Raum pro Lobby; Intents→Engine; emittiert viewFor-Projektionen
│   │   │   ├── ws-identity.ts         # REIN: Cookie/Token aus Handshake → Identity (nutzt Session/GuestToken-Service)
│   │   │   ├── ws-auth.middleware.ts  # Socket-Handshake-Auth (Session-Cookie | Gast-Token | anonym)
│   │   │   └── events.ts              # REIN: typisierte Event-/Payload-Verträge (client↔server)
│   │   ├── lobby/
│   │   │   ├── lobby.module.ts
│   │   │   ├── lobby.service.ts        # Erstellen/Beitreten/Verlassen, Code, Seat-Zuteilung, Timeout
│   │   │   ├── lobby-state.ts          # REIN: Zustandsmaschine waiting→placing→in_progress→finished — TDD
│   │   │   ├── lobby-code.ts           # REIN: lesbarer Code (Crockford-base32, ambiguitätsfrei) — TDD
│   │   │   ├── lobby.repository.ts     # Redis-CRUD für Lobby-/Spielzustand (+ TTL, Dedup, Deadline)
│   │   │   └── dto/{create-lobby,join-lobby,place-fleet,fire-shot}.dto.ts  # class-validator
│   │   ├── game/
│   │   │   ├── game.module.ts
│   │   │   ├── game.service.ts         # Brücke zur Engine: createGame/applyShot; State<->Redis; Idempotenz
│   │   │   ├── fog-of-war.ts           # REIN: clientgerichtete Projektion strikt über engine viewFor — TDD
│   │   │   ├── move-dedup.ts           # REIN: moveId-Idempotenz-Logik — TDD
│   │   │   └── turn-timer.service.ts   # serverseitige Zug-Deadline + Watcher; Ablauf→Zugwechsel
│   │   ├── persistence/
│   │   │   ├── match.service.ts        # schreibt Match + MatchMove bei Partieende; ruft Stats-Naht
│   │   │   └── pvp-result.ts           # REIN: GameState+Seats → je-Spieler win/loss + Match-Payload — TDD
│   │   └── stats/                      # bestehend — recordResult (idempotent) wiederverwendet
│   ├── prisma/
│   │   ├── schema.prisma               # + model Match, model MatchMove (Spec §9); + Relationen
│   │   └── migrations/                 # + neue Migration (Match/MatchMove)
│   ├── test/
│   │   ├── unit/                       # + lobby-state, lobby-code, fog-of-war, move-dedup, pvp-result, ws-identity
│   │   └── integration/                # + socket.io-client: validation, fog-of-war-leak, timer, idempotenz, lifecycle, persistence
│   ├── .env.example                    # + REDIS_URL, TURN_TIMER defaults, MAX_OPEN_LOBBIES, JOIN_RATE_LIMIT
│   └── package.json                    # + socket.io/ioredis/@socket.io/redis-adapter; scripts unverändert
└── web/                                # bestehend (002/003) — erweitert
    ├── app/
    │   └── (online)/                   # NEU: Lobby-/Online-Routen (schlicht, kein finales Design)
    │       ├── lobby/page.tsx          # erstellen/beitreten (Code, Einstellungen, Gast-Name)
    │       └── play/page.tsx           # Platzierung + Online-Brett + Live-Status + Timer-Countdown
    ├── src/
    │   ├── realtime/socket-client.ts   # NEU: typed socket.io-client (credentials/Cookies), Event-Typen aus events-Contract
    │   ├── realtime/useOnlineGame.ts   # NEU: Hook — Lobby/Spielzustand aus Server-Events (nur Anzeige)
    │   └── components/online/          # NEU: LobbyPanel, OnlineBoard, TurnTimer, OpponentStatus (funktional)
    └── tests/                          # + Tests: Lobby-Flows, Anzeige der Fog-of-War-Projektion, Countdown

.github/workflows/ci.yml               # + Redis-Service im `server`-Job
```

**Structure Decision**: Drei-Schichten-Monorepo gemäß Verfassung — `engine` (framework-frei,
**unverändert**) ← `server` (jetzt **autoritative Spiel-Laufzeit** + WS-Transport) und `web`
(Anzeige/Eingabe). Im Server wird die nicht-triviale Logik konsequent in **reine, framework- und
Redis-unabhängige Funktionen** gekapselt (`lobby-state`, `lobby-code`, `fog-of-war`,
`move-dedup`, `pvp-result`, `ws-identity`), die ohne Nest/Socket/Redis mit Vitest testbar sind
(Prinzip II/IV-Geist); Gateway, Redis-Repository und Timer bilden die dünne I/O-Naht und werden
per `socket.io-client`-Integrationstests gegen App + Redis geprüft. Die Engine bleibt die einzige
Regelquelle; Redis ist reiner Live-State/Transport, Postgres reine End-Persistenz.

## Complexity Tracking

> Keine Verfassungs-*Verstöße*. Die folgenden zwei bewussten Mehraufwände gehen über das
> *minimal* von der Spec Geforderte hinaus und werden — als ausdrückliche Nutzervorgaben —
> hier begründet (YAGNI-Abwägung dokumentiert).

| Entscheidung | Why Needed | Simpler Alternative Rejected Because |
|--------------|------------|--------------------------------------|
| **Socket.IO-Redis-Adapter + Redis-Live-State jetzt**, obwohl Lastziel Einzelinstanz ist (SC-009) | Ausdrückliche Nutzervorgabe; entspricht der Projektarchitektur (Spec §7/§8). Redis als Live-State + Pub/Sub macht das System **mehr-Instanz-fähig**, ohne dass später Transport/Zustandshaltung umgebaut werden müssen. | Reiner In-Memory-Single-Instance-State wäre einfacher, müsste aber für jede spätere Skalierung (M4/M5) vollständig ersetzt werden; der Adapter ist additiv und ändert die Event-Semantik nicht. **Capability ≠ Lastziel**: SC-009 bleibt Einzelinstanz/Dutzende. |
| **Neue Prisma-Modelle `Match` + `MatchMove`** (Spec §9), obwohl FR-024–026 nur Stats-Update fordern | Ausdrückliche Nutzervorgabe; schafft den dauerhaften Partie-Datensatz (Sieger, Spieler, Einstellungen) und Zug-Ledger als Grundlage für spätere Match-History/Replays (M5) und als saubere Quelle für die Stats-Naht. | Nur den bestehenden `MatchResult`-Ledger zu nutzen wäre minimaler, verlöre aber den Partiekontext (Gegner, Code, Verlauf). `MatchMove` wird beim Schreiben pro Partie als Batch erzeugt (kein Hot-Path-Overhead). Idempotenz bleibt über `MatchResult`/eindeutigen Match-Key gewahrt. |
