# Contract — Redis-State: Reconnect-Delta (005)

Erweitert `specs/004-pvp-realtime-lobbies/contracts/redis-state.md`. Redis bleibt **flüchtiger
Live-State/Transport**, **nicht** die Regelquelle (das ist die Engine). Alle Mutationen laufen über
das bestehende atomare `LobbyRepository.update(code, mutator, ttl)` (WATCH/MULTI/EXEC + Retry).

---

## Geänderter Key

### `lobby:{code}` — `LobbyRecord` (JSON), erweitert
Neue Felder (siehe data-model.md §1):
- `seats[].reconnectToken: string` — geheimes Per-Seat-Token (base64url, 32 Byte).
- `seats[].reconnectDeadline: number | null` — absolute ms-Deadline des 60-s-Fensters.
- `pausedTurnRemainingMs: number | null` — festgehaltene Zug-Restzeit während Pause.
- `paused: boolean` (oder abgeleitet) — Zug-Sperre, solange ein Sitz getrennt ist.

TTL unverändert (`in_progress`: wie 004). Während Pause bleibt der Record bestehen; er wird **nicht**
vorzeitig gelöscht.

> **Geheimhaltung**: `reconnectToken` darf **niemals** in client-gerichtete Projektionen
> (`lobby:state`, `game:view`) gelangen. Es verlässt den Server ausschließlich im **Ack** von
> `lobby:create`/`lobby:join` an genau den berechtigten Client.

---

## Neuer Key

### `match-result:{code}` — Terminal-Marker (JSON)
```ts
interface TerminalResult { winner: 'A' | 'B'; reason: 'forfeit'; endedAt: number; }
```
- **Zweck**: Verspäteter `reconnect:resume` (nach Fenster-Ablauf, Lobby bereits gelöscht) erhält das
  Endergebnis (FR-017), ohne Postgres im Hot-Path zu lesen.
- **Geschrieben**: in `finishAndPersist`/Forfeit-Pfad **vor** dem Löschen des `lobby:{code}`.
- **TTL**: ~120 s (kurz; danach `lobby-not-found`).

---

## Timer-Verortung

- **Grace-Timer** (60 s): Deadline in `seats[].reconnectDeadline` (Redis = Quelle der Wahrheit);
  **Auslöser** ist ein In-Process-`GraceTimerService`-Watcher der raum-besitzenden Instanz
  (analog zum bestehenden `TurnTimerService`). Kein eigener Redis-Key.
- **Zug-Timer**: bei Pause via `turnDeadline=null` + `pausedTurnRemainingMs` festgehalten; bei Resume
  re-derivierte Deadline. Konsistent mit der bestehenden deadline-basierten Timer-Architektur.

---

## Atomaritäts-/Idempotenz-Anforderungen

1. `markDisconnected`/`markReconnected`/`resolveAbandon` laufen je als **eine** `repo.update`-Mutation
   (kein Lost-Update bei gleichzeitigem Schuss/Timeout).
2. `resolveAbandon` ist durch den `status === 'in_progress'`-Guard **idempotent**: ein zweiter
   Grace-Trigger oder ein Forfeit/Reconnect-Race ändert nichts mehr.
3. Persistenz-Idempotenz unverändert über `matchKey`-Unique-Constraint (FR-016).
