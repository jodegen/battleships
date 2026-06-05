# Phase 1 — Data Model: Reconnect-Handling

Additive Erweiterung des 004-Live-States in Redis. **Keine** neuen Prisma-Modelle und **keine**
Migration: Die Aufgabe-Wertung nutzt den bestehenden `Match`/`MatchMove`/`Stat`-Pfad mit
`MatchStatus.FORFEITED`. Der kanonische Spielzustand bleibt der eingebettete engine-`GameState`
(SSoT, unverändert).

---

## 1. Erweiterte Live-State-Typen (`packages/server/src/lobby/lobby-types.ts`)

### 1.1 `Seat` (erweitert)

| Feld | Typ | Neu? | Bedeutung |
|------|-----|------|-----------|
| `playerId` | `'A' \| 'B'` | bestehend | Host → A, Beitretender → B |
| `identity` | `SeatIdentity` | bestehend | `user`(+`userId`)/`guest` |
| `connected` | `boolean` | bestehend | aktuell verbunden |
| `placed` | `boolean` | bestehend | Flotte platziert |
| **`reconnectToken`** | `string` | **neu** | geheimes Per-Seat-Token (base64url, 32 Byte); gesetzt bei Sitzbelegung |
| **`reconnectDeadline`** | `number \| null` | **neu** | absolute ms-Deadline des 60-s-Fensters; `null`, solange verbunden |

### 1.2 `LobbyRecord` (erweitert)

| Feld | Typ | Neu? | Bedeutung |
|------|-----|------|-----------|
| … bestehende Felder … | | | unverändert (`code`, `status`, `seats`, `turnDeadline`, `game`, `matchKey`, …) |
| **`pausedTurnRemainingMs`** | `number \| null` | **neu** | bei Pause festgehaltene Zug-Restzeit; `null` wenn kein aktiver Timer oder nicht pausiert |
| **`paused`** | `boolean` | **neu (abgeleitet ok)** | `true`, solange mindestens ein Sitz `connected:false` während `in_progress`; sperrt Züge |

> `paused` kann auch rein abgeleitet werden (`seats.some(s => !s.connected) && status==='in_progress'`).
> Als explizites Feld erleichtert es Guard-Checks und Tests; Implementierung wählt eine Variante,
> Verhalten ist identisch.

### 1.3 Invarianten

- `reconnectToken` ist pro `(code, playerId)` eindeutig und stabil über die Partie-Lebensdauer.
- `reconnectDeadline !== null` ⇔ Seat ist `connected:false` und Partie `in_progress`.
- Wenn `pausedTurnRemainingMs !== null` ⇒ `turnDeadline === null` (Timer gestoppt) und `paused`.
- Beim Resume **beider** Sitze: `turnDeadline = now + pausedTurnRemainingMs`, danach
  `pausedTurnRemainingMs = null`, `paused = false`.

---

## 2. Reine Zustandsübergänge (`packages/server/src/reconnect/reconnect-state.ts`, TDD)

Reine Funktionen über `LobbyRecord` (kein Redis/Socket/Zeit-Global; `now` injiziert):

```text
markDisconnected(record, playerId, now, windowMs=60_000): LobbyRecord
  Vorbedingung: status === 'in_progress', Seat existiert & connected
  Wirkung:
    - Seat.connected = false
    - Seat.reconnectDeadline = now + windowMs
    - pausedTurnRemainingMs = record.turnDeadline === null ? null : max(0, turnDeadline - now)
    - turnDeadline = null
    - paused = true

markReconnected(record, playerId, now): LobbyRecord
  Vorbedingung: Seat existiert
  Wirkung:
    - Seat.connected = true, Seat.reconnectDeadline = null
    - falls jetzt ALLE Sitze connected:
        - turnDeadline = pausedTurnRemainingMs === null ? null : now + pausedTurnRemainingMs
        - pausedTurnRemainingMs = null, paused = false
      sonst: bleibt pausiert (anderer Sitz noch getrennt)

resolveAbandon(record, playerId): { record: LobbyRecord; winner: PlayerId } | null
  Guard: status === 'in_progress' && Seat(playerId).connected === false && game != null
         (sonst null → keine Wertung, Idempotenz/Race-Schutz)
  Wirkung:
    - winner = opponentOf(playerId)
    - status = 'finished', game.status = 'finished', game.winner = winner
```

**„Beide getrennt → erstes Fenster entscheidet" (FR-014a)**: ergibt sich aus zwei unabhängigen
Grace-Timern mit jeweils eigener `reconnectDeadline`; der zuerst feuernde ruft `resolveAbandon` für
seinen `playerId` → der jeweils andere gewinnt. Der `status`-Guard macht den zweiten Trigger zum
No-Op.

---

## 3. Reconnect-Token (`packages/server/src/reconnect/reconnect-token.ts`, TDD)

```text
createReconnectToken(): string                 // 32 zufällige Bytes → base64url
verifyReconnectToken(seat, providedToken): boolean   // konstanter String-Vergleich
authorizeResume(seat, providedToken, identity): boolean
  // true, wenn verifyReconnectToken(seat, providedToken)
  //   ODER (identity.kind==='user' && identity.userId === seat.identity.userId)  // FR-003a
  // Gäste: nur Token-Pfad
```

---

## 4. Redis-Keys (Delta zu 004)

| Key | Typ | Neu? | Inhalt / TTL |
|-----|-----|------|--------------|
| `lobby:{code}` | String(JSON) | erweitert | `LobbyRecord` inkl. neuer Seat-/Record-Felder (TTL wie 004) |
| **`match-result:{code}`** | String(JSON) | **neu** | `{ winner, reason:'forfeit', endedAt }`; TTL ~120 s — für verspäteten Reconnect (FR-017) |

Grace-Deadlines liegen **im** `LobbyRecord` (Seat-Feld); der Auslöser ist ein In-Process-Watcher
(kein eigener Redis-Key nötig). Token liegt im Seat (kein separater Index).

---

## 5. Persistenz (unverändert wiederverwendet)

- `finishAndPersist(record, winner, 'FORFEITED')` → bestehender Pfad:
  - `match.create({ status: FORFEITED, winnerSeat, … , moves })` mit `matchKey`-Idempotenz (FR-016).
  - `stats.recordResult(userId, matchId, outcome)` je eingeloggtem Spieler (Gäste: keine Statistik,
    FR-015).
- **Kein** neues Modell, **kein** neuer Enum-Wert, **keine** Migration.

---

## 6. Zustandsmaschine (Ergänzung)

```text
in_progress ──(disconnect eines Sitzes)──▶ in_progress[paused]   (Seat.connected=false, Grace läuft)
in_progress[paused] ──(reconnect, dann alle verbunden)──▶ in_progress   (Timer mit Restzeit weiter)
in_progress[paused] ──(Grace-Deadline erreicht)──▶ finished            (Aufgabe; Gegner gewinnt)
in_progress ──(letztes Schiff versenkt, regulär)──▶ finished           (Vorrang vor Reconnect, FR-019)
```

`waiting`/`placing`-Übergänge bei Disconnect bleiben unverändert (004): Host weg → Lobby
geschlossen; zweiter Spieler weg → zurück zu `waiting`.
