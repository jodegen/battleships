<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/006-quick-play-matchmaking/plan.md`

Active feature: **Quick Play – öffentliches Matchmaking (006)** — additiv über 004/005.
Eingeloggte Spieler finden ohne Code-Austausch einen Gegner. Neues Server-Modul
`packages/server/src/matchmaking/` mit einer Redis-FIFO-Warteschlange (`quickplay:queue` ZSET,
Member=`userId`, Score=Beitrittszeit). Neue WS-Intents **`queue:join` / `queue:leave`** (mit Ack) +
Server→Client-Push **`queue:matched`** (additiv in `realtime/events.ts`). **Gäste serverseitig
abgelehnt** (`identity.kind !== 'user'` → `forbidden`). Paarung **atomar in Redis** via Lua-Skript
`claim-or-enqueue` (FR-012, keine Doppel-/Selbst-Paarung). Beim Match erzeugt der Server über die
**bestehende** Logik (`LobbyService.createLobby` + `joinLobby`) eine Lobby mit Standard-Einstellungen
`QUICK_PLAY_SETTINGS = {allowTouching:true, turnTimerSeconds:30, extraTurnOnHit:true}`, überführt
**beide** Sockets in den Raum und sendet je `queue:matched {code,you,lobby,reconnectToken}` — ab
`placing` **kein paralleler Spielpfad** (identisch zur Code-Lobby inkl. Timer/Reconnect/Stats, FR-007).
Disconnect/Leave entfernt den Wartenden **still** (kein Match, kein Stat — es gibt noch keine Lobby,
FR-013). Gleichzeitig-in-Queue-und-Partie verhindert: per-Socket (`socket.data.lobby`) **und**
konto-weiter Aktiv-Index `game-of-user:{userId}` (zentral in `LobbyService` gepflegt, FR-015).
**120-s-Wartetimeout** via Wiederverwendung `GraceTimerService` → „kein Match gefunden" (FR-016).
`packages/web`: schlichter „Match suchen"-Einstieg (`QuickPlayPanel`, nur Eingeloggte) mit
Wartestatus/Abbrechen; `queue:matched` → bestehender Platzierungs-/Spielbildschirm (kein neues Design).
**Keine Engine-Änderung, keine Prisma-Migration.** TDD: reine `queue-guard`/`quick-play-settings` +
`socket.io-client`-Integration (only-logged-in, atomares No-Double-Match, Leave-on-Disconnect,
identisch-zur-Code-Lobby; `now()` injiziert).

Vorherige Features: **Reconnect-Handling für laufende PvP-Partien (005, M4)** — `packages/server`/`web`, fertig.
**PvP-Lobbys & Echtzeit-Online-Partie (004, M3)** — `packages/server`/`web`, fertig.
**Identität & Persistenz (003, M2)** — `packages/server`, fertig.
**Minimal spielbares Frontend gegen die KI (002)** — `packages/web`, fertig.
**Spiel-Engine & KI (Meilenstein 1, 001)** — `packages/engine`, fertig.
<!-- SPECKIT END -->
