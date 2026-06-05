# Contract — Redis-Live-State & Pub/Sub

Redis hält **flüchtigen** Lobby-/Spielzustand, Presence, Idempotenz-Daten und die Zug-Deadline und
dient als Socket.IO-Pub/Sub-Backplane. Redis ist **nicht** die Regel-Wahrheit (das ist die
eingebettete Engine-`GameState`); es ist Transport-/Lebenszyklus-Speicher.

## Keys & Werte

| Key | Typ | Wert | TTL |
|-----|-----|------|-----|
| `lobby:{code}` | String (JSON) | `LobbyRecord` (siehe data-model.md §2.1) | `waiting` 10 min · `in_progress` sliding ~2 h · `finished` kurz, dann Delete |
| `join-fails:{identityKey}` | String (Counter) | fehlgeschlagene `lobby:join`-Versuche | kurzes Sliding-Window (z. B. 60 s) |
| `open-lobbies:{userId}` | Set | offene (nicht-`finished`) Lobby-Codes des Nutzers | Eintrag entfernt bei Lobby-Ende |
| `socket.io#...` | (Adapter) | Pub/Sub-Kanäle des Redis-Adapters | Adapter-verwaltet |

`identityKey` = `user:{userId}` bzw. `guest:{hashedToken}` bzw. `ip:{addr}` (Implementierungswahl).

## Serialisierung

- `LobbyRecord` ist reines JSON. Der eingebettete Engine-`GameState` ist bereits ein
  serialisierbares Werteobjekt (`readonly`-Strukturen, keine Klassen/Funktionen) →
  `JSON.stringify`/`JSON.parse` ist verlustfrei.
- Beim Lesen wird der `GameState` **unverändert** an die Engine-Funktionen
  (`applyShot`, `viewFor`, `isOver`, `getWinner`) übergeben; der Server interpretiert die
  Spielregeln nicht selbst.

## Atomarität (Pflicht)

Jede zustandsändernde Operation auf `lobby:{code}` ist atomar (Vermeidung von Lost-Updates &
Doppel-Apply):

- **Lesen-Ändern-Schreiben** via `WATCH key` → `MULTI` → `SET key newValue` → `EXEC`; bei
  Konflikt (EXEC = null) begrenzter Retry. **Oder** ein Lua-Script, das die Mutation server-seitig
  in Redis ausführt.
- Betroffene Operationen: Beitritt (Seat belegen), `fleet:place` (placed-Flag/Flotte),
  `shot:fire` (Dedup-Prüfung + `applyShot` + Deadline + Statuswechsel), Timer-Verfall
  (Zugwechsel), Verlassen/Disconnect.
- **moveId-Idempotenz**: `processedMoveIds` wird **innerhalb** derselben Transaktion geprüft und
  fortgeschrieben wie der `applyShot`-Effekt — so kann ein Duplikat nie zweimal wirken
  (FR-017/SC-008).

## Presence

- Bei Socket-`connect` (nach Auth) → Seat als `connected: true` markieren, Broadcast `lobby:state`.
- Bei `disconnect`/`lobby:leave` → Behandlung gemäß websocket-events.md (Status-abhängig: schließen /
  Sitz frei / Forfeit).

## Timer-Deadline

- `turnDeadline` (absoluter ms-Zeitstempel) ist Teil von `LobbyRecord`; gesetzt bei Zugbeginn und
  nach Treffer-mit-Extrazug; `null` bei Timer „aus".
- Die raum-besitzende Instanz hält einen In-Process-Watcher; bei Ablauf **atomar** gegen
  `turnDeadline` re-prüfen, dann Zugverfall ausführen. (Mehr-Instanz-Ownership: research.md §5,
  außerhalb des Lastziels.)

## Pub/Sub-Adapter

- `@socket.io/redis-adapter` mit zwei `ioredis`-Clients (pub/sub), gesetzt am `IoAdapter` beim
  Bootstrap. Broadcasts an `io.to(code)` sind dadurch instanzübergreifend zustellbar.
- **Capability, kein Lastziel**: gemessenes Ziel bleibt Einzelinstanz/Dutzende Partien (SC-009).

## Aufräumen

- `waiting` ohne zweiten Beitritt nach **10 min** → Lobby löschen + `open-lobbies`-Eintrag entfernen
  (FR-011).
- `finished` → nach Persistenz (Match/MatchMove + Stats) Lobby-Key mit kurzer Rest-TTL entfernen.
- Closed/aufgegeben → sofort entfernen.
