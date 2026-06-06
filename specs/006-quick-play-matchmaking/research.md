# Phase 0 — Research & Decisions: Quick Play – öffentliches Matchmaking

Alle „NEEDS CLARIFICATION" aus dem Spec sind bereits über `/speckit-clarify` aufgelöst (Block, 120-s-
Timeout, Disconnect-Stille, atomares Pairing). Dieses Dokument fixiert die **technischen**
Entscheidungen und die verworfenen Alternativen. Grundlinie: additiv über 004/005, **keine**
Engine-Änderung, **keine** Prisma-Migration, **kein paralleler Spielpfad**.

## 1. Atomare Paarung (FR-012, SC-006) — Lua `claim-or-enqueue`

**Decision**: Pro `queue:join` führt der Server **ein** Redis-`EVAL`-Skript gegen den ZSET
`quickplay:queue` aus, das atomar entscheidet:
- Existiert ein **anderer** frühester Wartender (`ZRANGE 0 0`, Member ≠ eigener `userId`) → diesen
  `ZREM` und als Match zurückgeben.
- Sonst → eigene `userId` mit Score `now` `ZADD` (idempotent: re-`join` aktualisiert nur den Score,
  belegt **keinen** zweiten Platz → FR-011) und „waiting" zurückgeben.

Da Redis Skripte **single-threaded und serialisiert** ausführt, gibt es kein TOCTOU-Fenster: Bei zwei
exakt gleichzeitigen Suchern A und B reiht der erste Lauf sich ein, der zweite findet ihn und nimmt ihn
heraus → **genau ein** Match, kein Doppel-Match, keine Selbst-Paarung.

**Rationale**: Erfüllt FR-012 strukturell statt durch Best-Effort-Sperren. `ioredis` unterstützt
`eval`/`evalsha` ohne neue Abhängigkeit. Der ZSET liefert zugleich FIFO (Score = Beitrittszeit, First-
come FR-004) und Member-Dedup (ein Platz pro `userId`, FR-011) und O(log n)-Entfernen per `ZREM` (Cancel/
Disconnect, FR-008/013).

**Alternatives considered**:
- *WATCH/MULTI/EXEC (wie `LobbyRepository.update`)*: funktioniert, aber für „lese frühesten, entscheide,
  schreibe" über zwei Schlüssel hinweg umständlicher und mit Retry-Schleife; das Lua-Skript ist kürzer
  und beweisbar atomar.
- *Redis-Liste (`LPUSH`/`RPOPLPUSH`)*: atomarer Pop vorhanden, aber Dedup pro User und gezieltes
  Entfernen beim Abbruch (`LREM` O(n)) sind schwächer als beim ZSET; keine saubere FIFO-Zeitbasis.
- *In-Memory-Queue im Gateway*: verletzt die Einzelinstanz-Robustheit (Verlust bei Neustart) und ist
  nicht mit dem vorhandenen Redis-State konsistent. Verworfen.

## 2. Wiederverwendung der Lobby-Erzeugung (FR-005/006/007) — kein paralleler Pfad

**Decision**: Beim Match ruft `MatchmakingService` die **bestehende** Logik:
1. `LobbyService.createLobby({ userId, displayName }, QUICK_PLAY_SETTINGS, now)` mit dem **früher**
   Wartenden als Host (Seat A, First-come).
2. `LobbyService.joinLobby(code, { kind:'user', … }, idKey)` mit dem Beitretenden (Seat B) → Record
   wechselt via `joinAsSecond` auf `placing`.

Anschließend überführt das Gateway **beide** Sockets in den Raum (`socket.join(code)`,
`socket.data.lobby = { code, playerId }`), broadcastet `lobby:state` und sendet jedem Socket
`queue:matched { code, you, lobby, reconnectToken }`. Ab hier ist der Ablauf **bit-identisch** zur
Code-Lobby (`fleet:place` → `start` → `shot:fire` → `finishAndPersist`), inkl. Zug-Timer, Reconnect
(005-`reconnectToken` pro Sitz) und Statistik.

**Standard-Einstellungen** = `QUICK_PLAY_SETTINGS = { allowTouching: true, turnTimerSeconds: 30,
extraTurnOnHit: true }`. `turnTimerSeconds: 30` ist der dokumentierte Default (`events.ts`: „Default 30",
`app-config.turnTimerDefaultSeconds = 30`) und entspricht dem Spec-Wortlaut „Standard-Timer".

**Rationale**: Erfüllt FR-007 („identisch zur Code-Lobby") durch **Konstruktion** statt Nachbau.
Reconnect/Stats/Timer funktionieren automatisch, weil sie am bestehenden Pfad hängen.

**Alternatives considered**: *Eigener Quick-Play-Record/Flow* — abgelehnt (Regel-Drift-Risiko, doppelte
Wartung, verletzt „kein paralleler Spielpfad").

## 3. „Nicht gleichzeitig in Queue **und** Partie" (FR-015) — konto-weiter Aktiv-Index

**Decision**: Zweistufige Prüfung in `onQueueJoin`:
- (a) **Per-Socket**: `socket.data.lobby` gesetzt → dieser Socket ist bereits in einer Lobby → ablehnen.
- (b) **Konto-weit**: ein neuer String-Key `game-of-user:{userId}` → `code` (TTL = ACTIVE_TTL ~2 h), den
  `LobbyService` **zentral** pflegt: gesetzt, sobald ein **eingeloggter** Spieler einen Sitz bezieht
  (`createLobby` für Host **und** `joinLobby` für eingeloggten Seat B — deckt Code- und Quick-Play-Lobby
  ab), gelöscht in `finishAndPersist` (Partieende/Aufgabe) und beim Vor-Spielstart-Austritt
  (`removeBeforeStart`/`leave`). `onQueueJoin` lehnt mit `already-in-game` ab, wenn der Key existiert.

**Rationale**: Ein **einziger**, zentral gepflegter Index ist korrekter und wartbarer als verstreute
Ad-hoc-Prüfungen und deckt FR-015 **konto-weit, jedes Gerät, beide Sitze** ab — konsistent mit der
konto-weiten Identitätslogik aus 005 (FR-003a). Das vorhandene `open-lobbies:{userId}` (Set) bleibt für
das Erstell-Limit FR-006b zuständig und erfasst nur Hosts; es allein würde den Beitretenden (Seat B)
**nicht** abdecken — daher der dedizierte Index.

**Alternatives considered**:
- *Nur per-Socket (`socket.data.lobby`)*: einfachste Variante, verfehlt aber den Cross-Device-/Konto-Fall
  (auf Gerät 1 in Partie, auf Gerät 2 in der Queue). Verworfen, da FR-015 konto-weit gemeint ist.
- *`open-lobbies` für Seat B mitnutzen*: würde die Semantik des FR-006b-Erstell-Limits verfälschen
  (Beitretende zählen dann als „offene Lobby"). Verworfen.

## 4. Wartetimeout 120 s (FR-016, SC-008) — Wiederverwendung `GraceTimerService`

**Decision**: Beim Einreihen plant `MatchmakingService` über den bestehenden `GraceTimerService` (per-Key/
per-User In-Process-Watcher, injizierbares `now()`) einen 120-s-Timer (`config.matchmakingTimeoutMs`).
Läuft er ab und ist der User **noch** in der Queue, wird er per `ZREM` entfernt, `quickplay:conn`-Key
gelöscht und dem Socket `queue:timeout` (bzw. `error: 'no-match'`) gesendet → Client zeigt „kein Match
gefunden", erneute Suche möglich. Bei Match/Cancel/Disconnect wird der Timer vorher gecleart.

**Rationale**: `GraceTimerService` kapselt bereits „Deadline + Callback + clear" mit injizierbarem
`now()` (deterministisch testbar) und wird vom Reconnect-Feature analog genutzt — kein neuer Timer-Typ.

**Alternatives considered**: *Redis-Key-TTL + Keyspace-Notifications* — mehr Infrastruktur (Notifications
aktivieren), unnötig bei Einzelinstanz. *Unbegrenztes Warten* — durch Clarify (Q2→B) ausgeschlossen.

## 5. Wartenden Socket beim Match ansprechen — Single-Instance-Auflösung

**Decision**: Beim Einreihen speichert der Server `quickplay:conn:{userId} = socketId` (String, TTL).
Beim Match holt das Gateway den wartenden Socket per `this.server.sockets.sockets.get(socketId)` (lokal)
und führt für ihn `socket.join` + `socket.data.lobby` + `queue:matched`-Emit aus. Ist der Socket lokal
nicht (mehr) auffindbar (z. B. zwischenzeitlich getrennt), wird der Match verworfen und der **andere**
Spieler bleibt/-kehrt in die Queue (re-enqueue) — kein „Geistermatch".

**Rationale**: Einzelinstanz-Lastziel (wie 004/005); die in-process Socket-Registry genügt. Robust gegen
„Partner ist weg" durch Re-Enqueue.

**Alternatives considered**: *Multi-Instanz-Transfer* (Wartesocket auf anderer Node) — erfordert
Cross-Instanz-Signalisierung über den Redis-Adapter/Pub-Sub; **out of scope für v1**, hier dokumentiert
als spätere Erweiterung. Bis dahin gilt die Einzelinstanz-Annahme explizit.

## 6. Disconnect/Leave aus der Queue (FR-013, SC-009) — still, kein Persistenz-Effekt

**Decision**: `SocketData` erhält `inQueue?: boolean`. `onQueueJoin` setzt es; `onQueueLeave` und der
bestehende `handleDeparture`-Pfad (Disconnect/Leave) löschen den User aus der Queue (`ZREM` +
`quickplay:conn`-Key + Timer-clear), **bevor** die übrige Departure-Logik greift. Da für einen rein
Wartenden **keine** Lobby existiert, gibt es nichts zu pausieren und nichts zu persistieren — FR-013/
SC-009 sind durch Konstruktion erfüllt.

**Rationale**: Trennt die Queue-Phase sauber von der Lobby-Phase; der Reconnect-Mechanismus (005) gilt
weiterhin **nur** für laufende Partien, nicht für die Warteschlange.

**Alternatives considered**: *Wartenden bei Reconnect automatisch wieder einreihen* — abgelehnt (Spec:
Reconnect betrifft Partien, nicht die Queue; erneute Suche ist nötig).

## 7. WS-Vertrag-Erweiterung (additiv)

**Decision**: In `realtime/events.ts` additiv:
- `ClientEvents.queueJoin = 'queue:join'`, `ClientEvents.queueLeave = 'queue:leave'`.
- `ServerEvents.queueMatched = 'queue:matched'` (Push). Optional `ServerEvents.queueTimeout =
  'queue:timeout'` ODER Wiederverwendung des bestehenden `error`-Events mit Code `no-match` (Entscheidung
  in contracts/websocket-events.md festgehalten: dedizierter `queue:timeout`-Push für klare Client-UX).
- `QueueMatchedMsg { code, you: PlayerId, lobby: LobbyView, reconnectToken: string }`.
- Acks: `QueueJoinAck = Ack<{ status: 'waiting' | 'matched' }>`, `QueueLeaveAck = Ack<{}>`.
- Neuer `ErrorCode`: `'already-in-game'` (FR-015); Gast/Anonym → bestehende `'forbidden'`/
  `'unauthenticated'` (wie `lobby:create`).

**Rationale**: Konsistent mit dem bestehenden typisierten, versionierten Contract; keine Breaking
Changes, nur Ergänzungen.

## 8. Teststrategie (Nutzervorgabe + Verfassung)

**Decision**:
- **Unit (TDD, rein)**: `queue-guard.ts` (`canEnterQueue(identity, { inLobby, hasActiveGame })` →
  `{ ok:true } | { ok:false, error }` für alle Fälle: Gast, anonym, bereits in Lobby, bereits in Partie,
  zulässig); `quick-play-settings.ts` (Werte fix).
- **Integration (`socket.io-client` + Test-Redis, injiziertes `now()`)** — die vier geforderten Fälle:
  1. **Nur Eingeloggte**: Gast-Cookie → `queue:join` → `forbidden`, keine Queue-Mitgliedschaft.
  2. **Atomare Paarung**: zwei eingeloggte Sockets `Promise.all([join, join])` → genau **ein**
     `queue:matched` je Socket auf **denselben** `code`, beide Seats besetzt, kein dritter Queue-Eintrag.
  3. **Disconnect entfernt**: einreihen, Socket trennen → ZSET leer; danach kein Match, kein
     `Match`/`Stat`-Eintrag in der DB.
  4. **Identisch zur Code-Lobby**: gematchte Partie zu Ende spielen → `game:over` + Persistenz/Stats wie
     im bestehenden `online-game.test.ts`; zusätzlich Reconnect-Smoke (Token aus `queue:matched`).
- **Web (Komponententest, `FakeSocket`)**: „Match suchen" sendet `queue:join`; Wartestatus + „Abbrechen"
  (sendet `queue:leave`); `queue:matched` setzt `game.lobby` → Übergang in Platzierung; `queue:timeout`
  → „kein Match gefunden".

**Rationale**: Deckt exakt die vom Nutzer geforderten Garantien ab; reine Logik ist isoliert und
deterministisch testbar; Infra-abhängige Fälle laufen über das vorhandene Harness (`setup-ws.ts`,
`HAS_INFRA`-Skip).
