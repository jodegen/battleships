# Implementation Plan: Quick Play – öffentliches Matchmaking

**Branch**: `006-quick-play-matchmaking` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-quick-play-matchmaking/spec.md`

## Summary

Additives Feature über 004/005: Eingeloggte Spieler finden ohne Code-Austausch einen Gegner. Ein
**Redis-Matchmaking-Modul** (`packages/server/src/matchmaking/`) verwaltet eine FIFO-Warteschlange
(ZSET, Member = `userId`, Score = Beitrittszeit). Drei neue WS-Nachrichten ergänzen den **bestehenden**
typisierten Vertrag: Intents `queue:join` / `queue:leave` (mit Ack) und der Server→Client-Push
`queue:matched`. **Gäste werden serverseitig abgelehnt** (`identity.kind !== 'user'` → `forbidden`),
analog zu `lobby:create`.

Die Paarung erfolgt **atomar in Redis** über ein kleines **Lua-Skript** (`claim-or-enqueue`): pro
`queue:join` entweder den frühesten anderen Wartenden atomar herausnehmen **oder** sich selbst
einreihen — in einer einzigen serverseitig-serialisierten Operation, sodass zwei gleichzeitige Sucher
nie doppelt gematcht werden und niemand mit sich selbst gepaart wird (FR-012). Beim Match wird über die
**bestehende** Lobby-Erzeugung (`LobbyService.createLobby` + `LobbyService.joinLobby`) eine reguläre
Lobby mit **Standard-Einstellungen** (`{ allowTouching: true, turnTimerSeconds: 30, extraTurnOnHit:
true }`) erzeugt; beide Sockets werden in den Lobby-Raum überführt (`socket.join(code)`,
`socket.data.lobby` gesetzt) und erhalten je `queue:matched { code, you, lobby, reconnectToken }`. Ab
da ist es **derselbe** Pfad wie eine Code-Lobby: `placing` → `fleet:place` → `in_progress` → `shot:fire`
→ `finishAndPersist`, inklusive Zug-Timer, Reconnect (005) und Statistik — **kein paralleler
Spielpfad** (FR-007).

Ein Spieler kann **nur einen** Warteplatz belegen (ZSET-Member-Dedup, FR-011) und wird bei
**Disconnect/Leave** still aus der Queue entfernt (FR-013: keine Partie, kein Statistik-Eintrag — es
existiert noch keine Lobby). Ein **gleichzeitiges** In-Queue-und-in-Partie wird verhindert (FR-015):
`queue:join` prüft (a) `socket.data.lobby` (dieser Socket bereits in einer Lobby) und (b) einen
**konto-weiten** Aktiv-Index `game-of-user:{userId}` (zentral in `LobbyService` beim Sitz-Bezug
gepflegt, deckt Host **und** Beitretenden, Code- **und** Quick-Play-Lobby ab). Ein **120-s-Timeout**
(per-User `GraceTimerService`-Wiederverwendung) entfernt einen allein Wartenden und meldet „kein Match
gefunden" (FR-016). `packages/web` ergänzt einen schlichten **„Match suchen"**-Einstieg neben
`LobbyPanel` (nur für Eingeloggte) mit Wartestatus + Abbrechen; bei `queue:matched` übernimmt der
**bestehende** Platzierungs-/Spielbildschirm nahtlos (gleicher `game.lobby`-Zustand wie create/join).
**Keine Engine-Änderung, keine Prisma-Migration.** Die nicht-triviale Logik wird testgetrieben
entwickelt (Vitest-Unit für reine Guard-/Settings-Helfer + `socket.io-client`-Integration für die vier
geforderten Fälle, mit injiziertem `now()`).

## Technical Context

**Language/Version**: TypeScript 5.x (`strict`, kein `any`) über alle Pakete. Node 20 (CI).

**Primary Dependencies**: Keine neuen. Server: bestehender NestJS-/Socket.IO-/`ioredis`-Stack (004/005);
Redis **Lua/`EVAL`** über den vorhandenen `RedisService.client` (ioredis unterstützt `eval`/`evalsha`
out of the box — keine neue Abhängigkeit). Wiederverwendet: `LobbyService.createLobby`/`joinLobby`,
`LobbyRepository`, `GraceTimerService` (für den 120-s-Wartetimeout), `GameGateway`-Downstream
(`placing`→`in_progress`→`finishAndPersist`). Geteilt: `@schiffe/engine` **unverändert**. Web:
bestehender `socket.io-client`, `useOnlineGame`-Hook, `reconnect-store`.

**Storage**: **Redis** (bestehend) — neue, vom Lobby-State **getrennte** Keys: `quickplay:queue` (ZSET,
FIFO + Dedup + atomarer Claim), `quickplay:conn:{userId}` (String → `socketId`, TTL, Single-Instance-Auflösung
des wartenden Sockets) und der konto-weite Aktiv-Index `game-of-user:{userId}` (String → `code`, TTL =
ACTIVE_TTL). **Kein** neues Feld im `LobbyRecord`. **PostgreSQL/Prisma** (bestehend) — **unverändert**;
Quick-Play-Partien persistieren über den identischen `MatchService.persistFinished`-Pfad
(`MatchStatus.FINISHED`/`FORFEITED`, idempotente Stats für eingeloggte Spieler — beide Seiten sind
per Definition eingeloggt).

**Testing**: Vitest. **TDD** für reine Logik: `canEnterQueue(...)`-Guard-Prädikat und
`QUICK_PLAY_SETTINGS`. Integration via `socket.io-client` gegen die gebootstrappte Nest-App + Test-Redis
(`setup-ws.ts`-Harness) mit **injiziertem `now()`** für die vier vom Nutzer geforderten Fälle: (1) nur
Eingeloggte werden zugelassen (Gast → `forbidden`), (2) **atomare** Paarung ohne Doppel-Match bei
gleichzeitigen Suchern (`Promise.all` zweier `queue:join`), (3) Entfernen aus der Queue bei Disconnect
(kein Match, kein Stat), (4) eine gematchte Partie verläuft **identisch** zur Code-Lobby-Partie
(zu Ende spielen, Persistenz+Stats prüfen). Web: Komponententests mit `FakeSocket`-Muster für
„Match suchen"/Wartestatus/Abbrechen und nahtlosen Übergang bei `queue:matched`.

**Target Platform**: Node-20-Service (NestJS + Socket.IO) hinter HTTP/WS; Browser-Client (Next.js).
**Einzelinstanz-Lastziel** wie 004/005 (Queue-Timeout als In-Process-Watcher; das atomare Pairing liegt
in Redis und ist re-derivierbar). Multi-Instanz-Matchmaking (Transfer eines auf einer anderen Instanz
verbundenen Wartesockets) ist **out of scope** und in research.md als spätere Erweiterung dokumentiert.

**Performance Goals**: Paarung < 2 s wenn zwei warten (SC-001); Abbruch entfernt < 1 s (SC-005);
Wartetimeout 120 s ± Toleranz (SC-008).

**Constraints**:
- **Server-autoritativ** (Prinzip I): Der Client sendet nur die Intents `queue:join`/`queue:leave`;
  Lobby-Erzeugung, Sitzzuteilung und Standard-Einstellungen entscheidet der Server.
- **Kein paralleler Spielpfad** (Nutzervorgabe, FR-007): Matchmaking endet in der **bestehenden**
  `createLobby`+`joinLobby`-Logik; ab `placing` gibt es keinen Quick-Play-spezifischen Code.
- **Atomare Paarung** (FR-012): genau ein Redis-`EVAL` entscheidet claim-or-enqueue; kein
  TOCTOU-Fenster zwischen „niemand wartet" und „mich einreihen".
- **Nur Eingeloggte** (FR-001): serverseitige Identitätsprüfung; Gäste/Anonyme abgelehnt.
- **Fog of War / Engine als SSoT**: unverändert — Matchmaking berührt keine Spielregel-/Projektionslogik.
- **Kein neues Design** (Nutzervorgabe): bestehende Online-Screens nur um den Sucheinstieg ergänzen.

**Scale/Scope**: Ein neues Server-Modul (`matchmaking.service.ts` + `matchmaking.repository.ts` + ein
Lua-Skript + reines `queue-guard.ts`), zwei neue Client→Server-Intents und ein Server→Client-Event
(additiv in `events.ts`), drei Gateway-Handler (`onQueueJoin`/`onQueueLeave` + `queue:matched`-Emit) plus
Disconnect-Hook-Erweiterung, ein konto-weiter Aktiv-Index zentral in `LobbyService`, ein
Config-Wert (`matchmakingTimeoutMs`, Default 120 000), sowie Client-Hook-/UI-Ergänzung. Keine neue
Infrastruktur, keine Migration.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Bewertung gegen `.specify/memory/constitution.md` v1.0.0:

| Prinzip | Status | Begründung |
|---------|--------|------------|
| I. Server-autoritative Spiellogik (NON-NEGOTIABLE) | ✅ PASS | Der Client sendet ausschließlich `queue:join`/`queue:leave` (Intents). Der Server entscheidet Zulassung (Auth), Paarung (atomares Redis-`EVAL`), Lobby-Erzeugung und Standard-Einstellungen autoritativ. Es entstehen **keine** neuen regelrelevanten Entscheidungen am Client; die Partie selbst läuft über den unveränderten autoritativen Pfad. |
| II. Test-First / TDD (Engine) (NON-NEGOTIABLE) | ✅ PASS | **Keine** Engine-Änderung → Engine-TDD-Gebot unberührt. Die neue nicht-triviale **Server**-Logik (Guard-Prädikat, atomares Pairing, Queue-Lebenszyklus) wird testgetrieben entwickelt; die vier vom Nutzer geforderten Integrationsfälle sind explizit eingeplant und werden vor der Implementierung als (rote) Tests formuliert. |
| III. Geteilte, framework-unabhängige Engine (SSoT) | ✅ PASS | Kein zweiter Regelpfad: Matchmaking ruft die **bestehende** `LobbyService`-Erzeugung auf und mündet in den **bestehenden** Gateway-Spielfluss. Redis hält nur Transport-/Warteschlangen-Metadaten und trifft keine Spielregel-Entscheidung. Abhängigkeitsrichtung server/web → engine unverändert. |
| IV. Hohe Codequalität | ✅ PASS | `strict` TS ohne `any`; kleine, zweckbenannte Einheiten (`matchmaking/queue-guard.ts` rein, `matchmaking.repository.ts` als dünne Redis-/Lua-Naht, `matchmaking.service.ts` als Orchestrierung); additive Keys statt Mutation des `LobbyRecord`; ein einziger konto-weiter Index statt verstreuter Ad-hoc-Prüfungen; YAGNI (kein ELO, keine Multi-Instanz-Logik in v1, kein neuer DB-Zustand). |

**Ergebnis (vor Phase 0)**: Alle Gates bestanden, **keine Verstöße**. Der einzige querschnittliche
Eingriff (konto-weiter Aktiv-Index in `LobbyService.createLobby`/`joinLobby` + Aufräumen) ist additiv,
ändert keinen bestehenden Kontrollfluss und ist durch FR-015 (konto-weite Korrektheit) begründet — siehe
research.md §3. Kein Eintrag in *Complexity Tracking* nötig.

**Re-Check nach Phase 1 (Design)**: Unverändert bestanden. data-model.md/contracts führen keine
konkurrierende Regelquelle ein; das atomare Pairing ist auf ein deterministisches Lua-Skript begrenzt;
jede client-gerichtete Sicht entsteht weiterhin ausschließlich über den bestehenden `viewFor`-Pfad;
`reconnectToken` gelangt nur im `queue:matched`-Ack an den Berechtigten (wie zuvor in create/join).

## Project Structure

### Documentation (this feature)

```text
specs/006-quick-play-matchmaking/
├── plan.md              # Diese Datei (/speckit-plan)
├── research.md          # Phase 0 — Entscheidungen (atomares Pairing/Lua, Queue-Datenstruktur, Aktiv-Index, Timeout, Socket-Transfer, Tests)
├── data-model.md        # Phase 1 — Queue-Entitäten, reine Guard-Funktion, Redis-Keys (kein LobbyRecord-Delta, keine Prisma-Migration)
├── quickstart.md        # Phase 1 — Start + 2-Spieler-Quick-Play-Smoke + Testlauf
├── contracts/           # Phase 1
│   ├── websocket-events.md   # Delta: queue:join/leave (Intents+Acks), queue:matched (Push), Fehlercodes
│   └── redis-state.md        # Delta: quickplay:queue (ZSET), quickplay:conn:{userId}, game-of-user:{userId}, Lua-Skript
├── checklists/
│   └── requirements.md  # (aus /speckit-specify)
└── tasks.md             # Phase 2 (/speckit-tasks — NICHT hier erzeugt)
```

### Source Code (repository root)

Additive Erweiterung von `packages/server` und `packages/web`. **Keine** Änderung an
`packages/engine`, an `prisma/schema.prisma` oder an den Migrationen.

```text
packages/
├── engine/                              # UNVERÄNDERT
├── server/
│   ├── src/
│   │   ├── matchmaking/                  # NEU — gekapseltes Quick-Play-Matchmaking
│   │   │   ├── queue-guard.ts            # REIN, TDD: canEnterQueue(identity, {inLobby, hasActiveGame}) → ok | ErrorCode
│   │   │   ├── quick-play-settings.ts    # REIN, TDD: QUICK_PLAY_SETTINGS (Standard: allowTouching/30s/extraTurnOnHit)
│   │   │   ├── matchmaking.repository.ts # NEU: ZSET-Queue + atomares claim-or-enqueue (Lua EVAL), conn-Key, leave (ZREM)
│   │   │   ├── matchmaking.service.ts    # NEU: Orchestrierung join/leave/match; ruft LobbyService.createLobby+joinLobby
│   │   │   └── matchmaking.module.ts     # NEU: DI (importiert LobbyModule, RedisModule); exportiert MatchmakingService
│   │   ├── lobby/
│   │   │   ├── lobby.service.ts          # ERWEITERT: game-of-user:{userId} setzen bei create/join (logged-in), löschen bei finish/leave
│   │   │   └── lobby.repository.ts       # ERWEITERT: setUserGame/getUserGame/clearUserGame (game-of-user-Key)
│   │   ├── realtime/
│   │   │   ├── events.ts                 # ERWEITERT: ClientEvents.queueJoin/queueLeave, ServerEvents.queueMatched; QueueMatchedMsg; Acks; ErrorCode 'already-in-game'
│   │   │   ├── game.gateway.ts           # ERWEITERT: onQueueJoin/onQueueLeave-Handler; queue:matched-Emit an beide Sockets; handleDeparture entfernt Queued-User
│   │   │   └── ws-auth.middleware.ts     # ERWEITERT: SocketData.inQueue?: boolean (Disconnect-Aufräumen)
│   │   ├── config/app-config.ts          # ERWEITERT: matchmakingTimeoutMs (Default 120_000)
│   │   ├── reconnect/grace-timer.service.ts  # UNVERÄNDERT genutzt (per-User Wartetimeout)
│   │   ├── persistence/                  # UNVERÄNDERT genutzt (finishAndPersist)
│   │   └── app.module.ts                 # ERWEITERT: MatchmakingModule registriert
│   └── test/
│       ├── unit/                         # + queue-guard, quick-play-settings
│       └── integration/                  # + quick-play: only-logged-in, atomic-no-double-match, leave-on-disconnect, identical-to-code-lobby
└── web/
    ├── app/online/page.tsx               # ERWEITERT: „Match suchen"-Einstieg (nur Eingeloggte) neben LobbyPanel
    ├── src/realtime/
    │   ├── socket-client.ts              # ERWEITERT: QueueMatchedMsg-Typ; queue:*-Eventnamen
    │   └── useOnlineGame.ts              # ERWEITERT: searching-State, findMatch()/cancelSearch(); queue:matched → lobby+reconnect-store setzen (wie join)
    └── src/components/online/
        └── QuickPlayPanel.tsx            # NEU (schlicht): „Match suchen" / Wartestatus „suche Gegner …" / „Abbrechen" / „kein Match gefunden"
```

**Structure Decision**: Drei-Schichten-Monorepo gemäß Verfassung — `engine` (framework-frei,
**unverändert**) ← `server` (autoritative Laufzeit + WS-Transport) und `web` (Anzeige/Eingabe). Die
neue Matchmaking-Logik wird in **reine, framework-/Redis-unabhängige Funktionen** (`queue-guard`,
`quick-play-settings`) gekapselt (Vitest ohne Infra testbar); `matchmaking.repository` ist die dünne
Redis-/Lua-Naht (atomares Pairing), `matchmaking.service` orchestriert und ruft **ausschließlich** die
bestehende `LobbyService`-Erzeugung auf. Engine bleibt einzige Regelquelle; Redis hält reine
Warteschlangen-/Transport-Metadaten getrennt vom Lobby-State; Postgres reine End-Persistenz
(unverändert wiederverwendet).

## Complexity Tracking

> Keine Verfassungs-*Verstöße*. Das Feature ist rein additiv: keine neue Abhängigkeit (Lua via
> vorhandenem ioredis), keine neue Infrastruktur, **keine** Prisma-Migration, kein `LobbyRecord`-Delta.
> Der einzige querschnittliche Eingriff — der konto-weite `game-of-user`-Index in `LobbyService` — ist
> additiv und durch FR-015 begründet (siehe research.md §3); er ändert keinen bestehenden Kontrollfluss.
> Daher ist diese Tabelle leer.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| — | — | — |
