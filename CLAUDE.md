<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/005-reconnect-handling/plan.md`

Active feature: **Reconnect-Handling für laufende PvP-Partien (005, Meilenstein 4)** — additiv
über 004. Ein Verbindungsabbruch während `in_progress` beendet die Partie **nicht mehr sofort**
(löst die 004-Übergangsregel FR-010a ab), sondern reserviert den Sitz **60 s**: Disconnect-Zweig im
`GameGateway` markiert den Sitz `connected:false`, setzt eine **Grace-Deadline** im
Redis-`LobbyRecord` und **pausiert den Zug-Timer** (`pausedTurnRemainingMs`, `turnDeadline=null`).
Pro Sitz erzeugt der Server ein **Reconnect-Token** (im Seat, an den Client im create/join-Ack).
Neuer Intent **`reconnect:resume {code,token}`** ordnet den Socket Raum/Sitz wieder zu — autorisiert
per Token **oder** per eingeloggter Identität (FR-003a: konto-weit/jedes Gerät; Gäste nur per Token
aus `localStorage`). Wiederherstellung der sichtbaren Sicht **ausschließlich** über das bestehende
`projectGameView`→`viewFor` (Fog of War strukturell gewahrt). Bei beidseitiger Verbindung läuft der
Zug-Timer mit **Restzeit** weiter. Fenster-Ablauf → **Aufgabe** via per-Seat `GraceTimerService`
über den **bestehenden** `finishAndPersist`-Pfad (`MatchStatus.FORFEITED`, idempotente Stats);
beidseitige Trennung → **erstes Fenster entscheidet** (FR-014a). **Keine Engine-Änderung, keine
Prisma-Migration.** `packages/web`: Token reload-fest in `localStorage`, Auto-Reconnect, Gegner-
Countdown „Gegner getrennt – wartet (xx s)". TDD für `reconnect-state`/`reconnect-token` +
`socket.io-client`-Integration (Timer-Pause, State-Restore ohne Leak, Aufgabe nach 60 s, beide
getrennt; `now()` injiziert).

Vorherige Features: **PvP-Lobbys & Echtzeit-Online-Partie (004, M3)** — `packages/server`/`web`, fertig.
**Identität & Persistenz (003, M2)** — `packages/server`, fertig.
**Minimal spielbares Frontend gegen die KI (002)** — `packages/web`, fertig.
**Spiel-Engine & KI (Meilenstein 1, 001)** — `packages/engine`, fertig.
<!-- SPECKIT END -->
