# Contract Delta — Redis State (Quick Play 006)

Additive, vom Lobby-State **getrennte** Schlüssel. **Kein** Delta am `lobby:{code}`-Record. Keys folgen
der bestehenden Namenskonvention (`lobby:`, `open-lobbies:`, `match-result:` …).

## 1. Schlüssel

| Key | Typ | Inhalt | TTL | Zweck / FR |
|-----|-----|--------|-----|------------|
| `quickplay:queue` | ZSET | Member `userId`, Score `enqueuedAt` | — (Liveness via Leave/Timeout) | FIFO-Warteschlange, Dedup, atomarer Claim (FR-004/011/012) |
| `quickplay:conn:{userId}` | String | `socketId` des Wartesockets | `matchmakingTimeoutMs` + Puffer | wartenden Socket beim Match lokal auflösen (research.md §5) |
| `game-of-user:{userId}` | String | aktiver `code` | `ACTIVE_TTL_MS` (~2 h) | konto-weite FR-015-Prüfung (Host + Seat B) |

> `open-lobbies:{userId}` (bestehend) bleibt unverändert für FR-006b; **nicht** umgewidmet.

## 2. Atomares `claim-or-enqueue` (Lua, FR-012)

Ausgeführt via `redis.client.eval(SCRIPT, 1, 'quickplay:queue', userId, now)`. Redis serialisiert die
Ausführung → kein TOCTOU-Fenster (research.md §1).

```lua
-- KEYS[1] = quickplay:queue        ARGV[1] = userId        ARGV[2] = now (ms)
local earliest = redis.call('ZRANGE', KEYS[1], 0, 0)
if earliest[1] and earliest[1] ~= ARGV[1] then
  -- Es wartet ein ANDERER → diesen atomar herausnehmen und als Gegner zurückgeben.
  redis.call('ZREM', KEYS[1], earliest[1])
  return { 'matched', earliest[1] }
else
  -- Niemand (oder nur ich selbst) wartet → mich (idempotent) einreihen. Kein zweiter Platz (FR-011).
  redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
  return { 'waiting' }
end
```

Rückgabe-Auswertung im Server:
- `['matched', opponentUserId]` → Paarung: `opponentUserId` ist der **früher** Wartende → wird Host
  (Seat A, First-come FR-004); der Beitretende wird Seat B.
- `['waiting']` → einreihen-Quittung; `quickplay:conn` setzen, 120-s-Timer planen.

### Eigenschaften
- **Keine Doppel-Paarung**: zwei gleichzeitige `join` werden serialisiert; der zweite findet den ersten.
- **Keine Selbst-Paarung**: `earliest[1] ~= ARGV[1]` schließt den eigenen (Vor-)Eintrag aus.
- **Dedup**: `ZADD` auf vorhandenem Member überschreibt nur den Score (ein Platz pro Konto, FR-011).

## 3. Entfernen (Cancel / Disconnect / Timeout)

Eine gemeinsame Routine `removeFromQueue(userId)`:
```
ZREM quickplay:queue userId
DEL  quickplay:conn:{userId}
grace.clear(<matchmaking-timer-key des userId>)
```
Aufgerufen aus `queue:leave` (FR-008), `handleDeparture`/Disconnect (FR-013) und beim 120-s-Ablauf
(FR-016). Idempotent: nicht-wartend → No-Op, kein Fehler.

## 4. Aktiv-Index-Pflege (FR-015)

| Zeitpunkt | Operation |
|-----------|-----------|
| `createLobby` (Host eingeloggt) | `SET game-of-user:{hostUserId} = code PX ACTIVE_TTL` |
| `joinLobby` (Seat B eingeloggt) | `SET game-of-user:{userId} = code PX ACTIVE_TTL` |
| `finishAndPersist` (Ende/Aufgabe) | `DEL game-of-user:{userId}` für beide eingeloggten Seats |
| `removeBeforeStart` / `leave` (vor Spielstart) | `DEL game-of-user:{userId}` des Austretenden |

Selbstheilung: Bei verwaisten Keys (Crash) sorgt der TTL für Ablauf; ein abgelaufener Index blockiert
keine spätere Suche.

## 5. Persistenz (unverändert)

Quick-Play-Partien schreiben `Match`/`MatchMove`/`Stat` über den **bestehenden**
`MatchService.persistFinished`-Pfad. **Keine** Prisma-Migration, kein neuer Enum-Wert.
