# Contract — End-Persistenz & Stats-Naht

Bei Partieende (`status = finished`, regulär **oder** Aufgabe FR-010a) persistiert der Server die
Partie dauerhaft und schreibt die Statistik **eingeloggter** Spieler fort. Alles in einem
idempotenten Pfad; Gäste erhalten keinen Eintrag (FR-024–026).

## Auslöser

- `applyShot` liefert `status: 'finished'` (alle Schiffe versenkt, `reason: 'all-sunk'`), **oder**
- Disconnect/Leave während `in_progress` → server-seitiger Forfeit (`reason: 'forfeit'`, FR-010a).

## Ablauf (`match.service.ts`)

1. Reine Ableitung `pvp-result(game, seats, matchKey, lobbyCode, settings, status)` →
   `{ match, moves, statWrites }` (data-model.md §4).
2. **Transaktion A** — Match schreiben (idempotent über `Match.matchKey @unique`):
   - `prisma.match.create({ data: match, ... })` inkl. `moves` (nested `createMany`).
   - Bei Unique-Konflikt auf `matchKey` (P2002) → **No-Op** (Partie bereits persistiert).
3. **Stats-Naht** — für jeden Eintrag in `statWrites` (`{ userId, outcome }`):
   - `StatsService.recordResult(userId, resultId = match.id, outcome)` — der **bestehende**
     idempotente Schreibpfad (MatchResult-Ledger + Stat-Increment in Transaktion). `resultId =
     match.id` macht erneute Meldungen wirkungslos (FR-026/SC-008).

> Reihenfolge: erst Match (liefert `match.id`), dann Stats mit diesem `id` als `resultId`. Schlägt
> Match-Create als Duplikat fehl, wird `match.id` des bestehenden Datensatzes (per `matchKey`
> gelesen) für die Stats-Naht verwendet — so bleibt auch ein wiederholter Trigger idempotent.

## Idempotenz-Schichten

| Ebene | Mechanismus | FR |
|-------|-------------|----|
| Zug (live) | `processedMoveIds` in Redis, atomar | FR-017 |
| Match-Datensatz | `Match.matchKey @unique` | FR-026 |
| MatchMove-Batch | `@@unique([matchId, turnIndex])` | FR-026 |
| Stat-Aggregat | bestehender `MatchResult @@unique([userId, resultId])` | FR-024/026 |

## Daten (Bezug data-model.md §3)

- `Match`: `matchKey`, `lobbyCode`, `mode=PVP`, `status` (`FINISHED`|`FORFEITED`), Seat-A/B
  (`playerXId` nullable für Gast + `playerXDisplay`), `winnerSeat`, `settings` (Snapshot),
  `startedAt`, `endedAt`.
- `MatchMove[]`: `turnIndex`, `byPlayer` (`A`/`B`), `x`, `y`, `result` (`MISS`/`HIT`/`SUNK`).
- `statWrites`: nur Seats mit `playerXId != null`; Sieger → `win`, Verlierer → `loss`.

## Was NICHT passiert

- Keine Live-/pro-Zug-Persistenz (Batch erst bei Ende).
- Keine Statistik für Gäste (FR-025).
- Keine Replays-/History-API in **diesem** Feature (Daten werden nur abgelegt; Lese-/Replay-
  Endpunkte sind spätere Features). Die `MatchMove`-Ablage ist die Grundlage dafür.
