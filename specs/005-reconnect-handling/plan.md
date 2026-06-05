# Implementation Plan: Reconnect-Handling für laufende PvP-Partien

**Branch**: `005-reconnect-handling` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-reconnect-handling/spec.md`

## Summary

Robustheits-Feature (Meilenstein 4): Ein Verbindungsabbruch während einer laufenden Partie
(`in_progress`) beendet diese **nicht mehr sofort** (Ablösung der 004-Übergangsregel FR-010a),
sondern reserviert den Sitzplatz **60 Sekunden** lang. Technisch additiv über Feature 004: Der
bestehende `GameGateway`-Disconnect-Pfad wird so geändert, dass der Sitz als **getrennt** markiert
(`connected:false`), eine **60-s-Grace-Deadline** im Redis-`LobbyRecord` gesetzt und der **laufende
Zug-Timer pausiert** wird (verbleibende Zeit als `pausedTurnRemainingMs` persistiert,
`turnDeadline=null`). Pro Sitz erzeugt der Server ein **Reconnect-Token** (Zufallswert, im Seat
gehalten, im create/join-Ack an den berechtigten Client). Ein neuer Intent **`reconnect:resume
{ code, token }`** ordnet den neuen Socket dem bestehenden Lobby-Raum/Sitz wieder zu — autorisiert
per Token **oder** (FR-003a) per übereinstimmender eingeloggter Identität (konto-weit, jedes Gerät;
Gäste nur per Token aus `localStorage`). Der sichtbare Teilzustand wird **ausschließlich** über die
bestehende `projectGameView`/engine-`viewFor` rekonstruiert (Fog of War strukturell garantiert:
ungetroffene gegnerische Schiffe verlassen den Server nie). Sind danach beide Sitze verbunden, wird
der Zug-Timer mit der **Restzeit** fortgesetzt; der Gegner erhält `opponent:reconnected`. Läuft das
Fenster ab, wertet ein per-Seat **`GraceTimerService`** die Partie als **Aufgabe** über den
**bestehenden** `finishAndPersist`-Pfad (`MatchStatus.FORFEITED`, idempotente Stats für eingeloggte
Spieler) — bei beidseitiger Trennung entscheidet das **zuerst** ablaufende Fenster (FR-014a). Es gibt
**keine Engine-Änderung und keine Prisma-Migration**. `packages/web` hält das Token reload-fest in
`localStorage`, reconnectet automatisch und zeigt dem wartenden Gegner „Gegner getrennt – wartet
(xx s)" mit Countdown. Die nicht-triviale Logik (Pause/Resume, Aufgabe, Token, „erstes Fenster
entscheidet") wird testgetrieben entwickelt (Vitest unit + `socket.io-client`-Integration mit
injiziertem `now()`).

## Technical Context

**Language/Version**: TypeScript 5.x (`strict`, kein `any`) über alle Pakete. Node 20 (CI).

**Primary Dependencies**: Keine neuen. Server: bestehender NestJS-/Socket.IO-/`ioredis`-Stack aus
004; `crypto.randomBytes` (Node, bereits verfügbar) für Token. Geteilt: `@schiffe/engine`
**unverändert**, nur `viewFor`/`isOver`/`getWinner` konsumiert. Web: bestehender
`socket.io-client` (Auto-Reconnect ist Default), `localStorage` (Browser-API).

**Storage**: **Redis** (bestehend) — `LobbyRecord` um Seat-Felder `reconnectToken`,
`reconnectDeadline` und Record-Felder `pausedTurnRemainingMs`/`paused` erweitert; neuer flüchtiger
Key `match-result:{code}` (TTL ~120 s) für verspäteten Reconnect. **PostgreSQL/Prisma**
(bestehend) — **unverändert**; Aufgabe-Wertung nutzt `Match`/`MatchMove`/`Stat` mit
`MatchStatus.FORFEITED` über den vorhandenen idempotenten Schreibpfad.

**Testing**: Vitest. **TDD** für reine Logik (`reconnect-state`, `reconnect-token`).
Integrationstests via `socket.io-client` gegen die gebootstrappte Nest-App + Test-Redis mit
**injiziertem `now()`** für: Timer-Pause während Trennung, State-Restore ohne Leak gegnerischer
Schiffe, Aufgabe nach 60 s (genau eine Wertung), gleichzeitige Trennung beider Spieler. Web:
Komponententests mit `FakeSocket` (bestehendes Muster) für Token-Persistenz, Auto-Resume,
Gegner-Countdown.

**Target Platform**: Node-20-Service (NestJS + Socket.IO) hinter HTTP/WS; Browser-Client (Next.js).
Einzelinstanz-Lastziel wie 004 (Grace-/Zug-Timer als In-Process-Watcher der raum-besitzenden
Instanz; Deadlines liegen in Redis und sind re-derivierbar).

**Project Type**: Web (Backend `packages/server` + Frontend `packages/web`) im npm-Workspace-Monorepo;
Abhängigkeitsrichtung ausschließlich Richtung `@schiffe/engine`.

**Performance Goals**: Trennungs-Hinweis beim Gegner < 2 s (SC-003); Aufgabe-Wertung < 2 s nach
Fenster-Ablauf (SC-005); Restzeit nach Resume ±1 s (SC-004).

**Constraints**:
- **Server-autoritativ** (Prinzip I): Reconnect-Pfad rekonstruiert den Zustand serverseitig aus dem
  maßgeblichen `GameState`; der Client liefert keinen Zustand (FR-020).
- **Fog of War** (FR-009/020, SC-002): jede client-gerichtete Projektion — auch beim Resume — läuft
  über `viewFor`; `reconnectToken` gelangt nie in eine Projektion.
- **Fenster fix 60 s** (FR-006); **Zug-Timer pausiert** (FR-011), läuft mit Restzeit weiter (FR-012).
- **Idempotente Aufgabe-Wertung** (FR-016): `status`-Guard + `matchKey`-Unique-Constraint.
- **Kein Quick-Play, kein neues Design** (Nutzervorgabe): bestehende Online-Screens nur ergänzen.

**Scale/Scope**: Ein neuer Intent (`reconnect:resume`), zwei neue Server→Client-Events
(`opponent:disconnected`/`reconnected`), ein per-Seat `GraceTimerService`, zwei reine Module
(`reconnect-state`, `reconnect-token`), additive Felder im `LobbyRecord`, ein umgeschriebener
Disconnect-Zweig, plus Client-Token-Store/Auto-Resume/Countdown-UI. Keine neue Infrastruktur.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Bewertung gegen `.specify/memory/constitution.md` v1.0.0:

| Prinzip | Status | Begründung |
|---------|--------|------------|
| I. Server-autoritative Spiellogik (NON-NEGOTIABLE) | ✅ PASS (stärkt das Prinzip) | Der Reconnect-Pfad trifft **keine** Spielregelentscheidung; er rekonstruiert nur die client-gerichtete Sicht über `viewFor` aus dem serverseitigen `GameState`. Aufgabe-Wertung (Sieger) leitet der Server autoritativ ab. Fog of War wird **strukturell** über denselben Projektor wie der reguläre Fluss gewahrt — kein neuer Serialisierungspfad. |
| II. Test-First / TDD (Engine) (NON-NEGOTIABLE) | ✅ PASS | **Keine** Engine-Änderung (nur Konsum) → Engine-TDD-Gebot bleibt erfüllt. Die neue nicht-triviale **Server**-Logik (`reconnect-state`, `reconnect-token`, Aufgabe/„erstes Fenster entscheidet") wird testgetrieben entwickelt; die vier vom Nutzer geforderten Integrationsfälle sind explizit eingeplant. |
| III. Geteilte, framework-unabhängige Engine (SSoT) | ✅ PASS | Kein zweiter Regel-/Projektionspfad: Wiederherstellung läuft über das bestehende `projectGameView`→`viewFor`. Redis hält nur (de)serialisierten State + Transport-Metadaten (Token/Deadline) und trifft keine Regelentscheidung. Abhängigkeitsrichtung server/web → engine unverändert. |
| IV. Hohe Codequalität | ✅ PASS | `strict` TS ohne `any`; kleine, zweckbenannte Module (`reconnect/reconnect-state.ts`, `reconnect/reconnect-token.ts`, `reconnect/grace-timer.service.ts`); reine Funktionen für die testbare Kernlogik; additive Felder statt paralleler Strukturen; **keine** Migration/kein neuer Enum-Wert (YAGNI). |

**Ergebnis (vor Phase 0)**: Alle Gates bestanden, **keine Verstöße**, **kein** Eintrag in
*Complexity Tracking* nötig. Das Feature ist rein additiv und entfernt eine Übergangsregel (FR-010a),
ohne neue Komplexitätsquellen einzuführen.

**Re-Check nach Phase 1 (Design)**: Unverändert bestanden. data-model.md/contracts führen keine
konkurrierende Regelquelle ein; jede client-gerichtete Sicht (inkl. Resume) läuft über `viewFor`;
das Token verlässt den Server nur im Ack an den Berechtigten und nie in einer Projektion; die
Kernübergänge sind reine, deterministisch (mit injiziertem `now`) testbare Funktionen.

## Project Structure

### Documentation (this feature)

```text
specs/005-reconnect-handling/
├── plan.md              # Diese Datei (/speckit-plan)
├── research.md          # Phase 0 — Entscheidungen (Token, Pause/Resume, Grace-Timer, Aufgabe, Late-Reconnect, Tests)
├── data-model.md        # Phase 1 — erweiterte Live-State-Typen, reine Übergänge, Redis-Delta (keine Prisma-Migration)
├── quickstart.md        # Phase 1 — Start + 2-Spieler-Reconnect-Smoke + Testlauf
├── contracts/           # Phase 1
│   ├── websocket-events.md   # Delta: reconnect:resume, opponent:disconnected/reconnected, geänderter Disconnect-Pfad
│   └── redis-state.md        # Delta: neue Seat-/Record-Felder, match-result-Marker, Timer-Verortung
├── checklists/
│   └── requirements.md  # (aus /speckit-specify)
└── tasks.md             # Phase 2 (/speckit-tasks — NICHT hier erzeugt)
```

### Source Code (repository root)

Additive Erweiterung von `packages/server` und `packages/web`. **Keine** Änderung an
`packages/engine`, an `docker-compose.yml`, an `prisma/schema.prisma` oder an den Migrationen.

```text
packages/
├── engine/                              # UNVERÄNDERT (nur viewFor/isOver/getWinner konsumiert)
├── server/
│   ├── src/
│   │   ├── reconnect/                    # NEU — gekapselte Reconnect-Logik
│   │   │   ├── reconnect-token.ts        # REIN, TDD: create/verify/authorizeResume (Token | User-Identität FR-003a)
│   │   │   ├── reconnect-state.ts        # REIN, TDD: markDisconnected/markReconnected/resolveAbandon, „erstes Fenster"
│   │   │   └── grace-timer.service.ts    # per-Seat In-Process-Watcher (analog TurnTimerService), injizierbares now()
│   │   ├── lobby/
│   │   │   ├── lobby-types.ts            # ERWEITERT: Seat.reconnectToken/reconnectDeadline; Record.pausedTurnRemainingMs/paused
│   │   │   ├── lobby.service.ts          # Token bei Sitzbelegung erzeugen; Ack-Felder
│   │   │   └── lobby.repository.ts       # match-result:{code} schreiben/lesen (Marker), sonst unverändert
│   │   ├── realtime/
│   │   │   ├── game.gateway.ts           # Disconnect-Zweig in_progress → Pause+Grace; onGraceExpired; reconnect:resume-Handler; opponent:*-Broadcasts; reconnectToken in create/join-Ack
│   │   │   └── events.ts                 # ERWEITERT: ReconnectResume-Intent + Acks; OpponentDisconnected/Reconnected; turn reason 'resume'
│   │   ├── game/
│   │   │   ├── turn-timer.service.ts     # unverändert genutzt (clear bei Pause, schedule bei Resume)
│   │   │   └── fog-of-war.ts             # unverändert genutzt (projectGameView beim Resume)
│   │   └── persistence/                  # UNVERÄNDERT genutzt (finishAndPersist, FORFEITED, Stats)
│   └── test/
│       ├── unit/                         # + reconnect-token, reconnect-state (inkl. „beide getrennt"), grace-timer
│       └── integration/                  # + reconnect: timer-pause, state-restore-no-leak, abandon-after-60s, both-disconnected, invalid-token, late-reconnect
└── web/
    ├── src/realtime/
    │   ├── reconnect-store.ts            # NEU: {code,token,playerId} in localStorage (set/get/clear)
    │   ├── socket-client.ts              # ERWEITERT: Event-Typen (reconnect:resume, opponent:*); Auto-Resume bei 'connect'
    │   └── useOnlineGame.ts              # ERWEITERT: opponentDisconnect/selfReconnecting State; Token speichern/räumen; Auto-resume
    ├── src/components/online/
    │   ├── OpponentStatus.tsx            # ERWEITERT: „Gegner getrennt – wartet (xx s)" + Countdown
    │   └── (TurnTimer.tsx)               # Countdown-Logik wiederverwendet/ggf. extrahiert für Gegner-Countdown
    └── tests/component/                  # + reconnect-Flows: Token überlebt Reload, Auto-resume, Gegner-Countdown
```

**Structure Decision**: Drei-Schichten-Monorepo gemäß Verfassung — `engine` (framework-frei,
**unverändert**) ← `server` (autoritative Laufzeit + WS-Transport) und `web` (Anzeige/Eingabe). Die
neue Reconnect-Logik wird in **reine, framework-/Redis-unabhängige Funktionen** (`reconnect-state`,
`reconnect-token`) gekapselt, die ohne Nest/Socket/Redis mit Vitest testbar sind; Gateway,
Repository und der per-Seat `GraceTimerService` bilden die dünne I/O-/Zeit-Naht und werden per
`socket.io-client`-Integrationstests gegen App + Redis (mit injiziertem `now()`) geprüft. Engine
bleibt einzige Regelquelle; Redis reiner Live-State/Transport; Postgres reine End-Persistenz
(unverändert wiederverwendet).

## Complexity Tracking

> Keine Verfassungs-*Verstöße* und **keine** über die Spec hinausgehenden Mehraufwände. Das Feature
> ist rein additiv: keine neue Abhängigkeit, keine neue Infrastruktur, **keine** Prisma-Migration,
> kein neuer Enum-Wert. Daher ist diese Tabelle leer.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| — | — | — |
