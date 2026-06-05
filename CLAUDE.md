<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/004-pvp-realtime-lobbies/plan.md`

Active feature: **PvP-Lobbys & Echtzeit-Online-Partie (004, Meilenstein 3)** — erweitert
`packages/server` (NestJS) um einen **Socket.IO**-WebSocket-Layer (ein Raum pro Lobby) und
**Redis** (aktiver Lobby-/Spielzustand, Presence, Pub/Sub via `@socket.io/redis-adapter` →
mehr-instanz-fähig; Lastziel bleibt Einzelinstanz). Die bestehende **Engine** (`@schiffe/engine`)
ist die **einzige** Spiellogik: `createGame`/`applyShot`/`resolveShot`/`viewFor` laufen
serverseitig (server-autoritativ). **Fog of War** strukturell über `viewFor` — ungetroffene
gegnerische Schiffe verlassen den Server nie. Lobby-Lebenszyklus
`waiting→placing→in_progress→finished` mit Einstellungen (Berührung, Zug-Timer 15/30/60/aus,
Extrazug). Serverseitiger **Zug-Timer** (Deadline im Redis-State). Idempotente Züge über `moveId`.
Beendete Partien → neue Prisma-Modelle **`Match`/`MatchMove`** (Spec §9) + idempotente
**Stats**-Fortschreibung eingeloggter Spieler (Gäste: keine Statistik). `packages/web` erhält
schlichte Online-Screens (Lobby, Platzierung, Online-Brett, Countdown). TDD für reine Serverlogik
(Zustandsmaschine, Fog of War, Timer, Idempotenz) + `socket.io-client`-Integration; Redis lokal
via Docker Compose. **Löst die in M2 dokumentierte Prinzip-I-Abweichung auf.**

Vorherige Features: **Identität & Persistenz (003, M2)** — `packages/server`, fertig.
**Minimal spielbares Frontend gegen die KI (002)** — `packages/web`, fertig.
**Spiel-Engine & KI (Meilenstein 1, 001)** — `packages/engine`, fertig.
<!-- SPECKIT END -->
