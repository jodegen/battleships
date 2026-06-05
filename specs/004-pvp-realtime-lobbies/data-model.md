# Phase 1 — Data Model: PvP-Lobbys & Echtzeit-Online-Partie

Zwei Speicherorte mit klarer Verantwortung:

- **Redis** — flüchtiger Live-Zustand (Lobby, Spiel, Presence, Idempotenz, Timer-Deadline).
  Die **Spielregel-Wahrheit** ist der eingebettete Engine-`GameState`; Redis fügt nur
  Transport-/Lebenszyklus-Metadaten hinzu.
- **PostgreSQL/Prisma** — dauerhafte End-Persistenz beendeter Partien (`Match`, `MatchMove`) und
  fortgeschriebene Aggregate (`Stat`, idempotent über bestehenden `MatchResult`-Ledger).

Engine-Typen (`GameState`, `Board`, `ShipPlacement`, `PlayerView`, `ShotResult`, `PlayerId`, …)
werden **konsumiert**, nicht reimplementiert (Prinzip III).

---

## 1. Lobby-Zustandsmaschine (reine Logik `lobby-state.ts`)

Zustände und erlaubte Übergänge (FR-007–011a):

```text
            zweiter Spieler tritt bei                  beide Flotten gültig bestätigt
  waiting ───────────────────────────► placing ──────────────────────────────► in_progress
     │                                    │                                          │
     │ 10 min ohne Beitritt (FR-011)      │ Host verlässt (FR-011a)                  │ alle Schiffe versenkt
     │ ODER Host verlässt (FR-011a)       │ → Lobby schließt                         │ ODER Verbindungsverlust/
     ▼                                    │ zweiter Spieler verlässt                 │ Verlassen (FR-010a)
  (closed)                               │ → Sitz frei, zurück zu waiting           ▼
                                          ▼                                      finished ──► (persistiert, dann aufgeräumt)
                                     (waiting | closed)
```

**Invarianten**:
- Eine Lobby hat **genau zwei** Seats; ein dritter Beitritt wird abgelehnt (FR-004).
- `placing` erfordert zwei anwesende Spieler; fällt einer weg, gelten die `waiting`-Regeln (FR-011a).
- `in_progress` erfordert zwei **gültige** Flotten und eine Seat→PlayerId-Abbildung.
- `finished` ist terminal; danach folgt Persistenz und Redis-Aufräumen.
- Übergänge sind serverseitig erzwungen; Client-Events sind nur Auslöser.

---

## 2. Redis-Live-Modell

### 2.1 `LobbyRecord` (Key `lobby:{code}`, JSON, mit TTL)

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `code` | `string` | Lobby-Code (Crockford-base32, lesbar). Eindeutig = Key. |
| `status` | `'waiting' \| 'placing' \| 'in_progress' \| 'finished'` | Lobby-Lebenszyklus (FR-007). |
| `hostUserId` | `string` | Ersteller (immer eingeloggt, FR-001). |
| `settings` | `LobbySettings` | Berührung, Timer-Sekunden\|null, Extrazug (FR-005). |
| `seats` | `[Seat, Seat?]` | Seat 0 = Host→`A`, Seat 1 = Beitretender→`B`. |
| `turnDeadline` | `number \| null` | Absoluter Zeitstempel (ms) der laufenden Zug-Deadline; `null` bei Timer „aus" (FR-020/023). |
| `processedMoveIds` | `string[]` | Verarbeitete `moveId`s für Idempotenz (FR-017). |
| `game` | `GameState \| null` | Eingebetteter Engine-Zustand ab `in_progress` (beide Boards). |
| `placement` | `{ A?: ShipPlacement[]; B?: ShipPlacement[] }` | Während `placing` eingereichte Flotten je Seat. |
| `matchKey` | `string` | Stabiler Schlüssel zur Persistenz-Idempotenz (Match-Dedup). |
| `createdAt` | `number` | Erstellzeit (für 10-min-Timeout, FR-011). |

```ts
interface LobbySettings {
  readonly allowTouching: boolean;          // Berührung erlaubt/verboten
  readonly turnTimerSeconds: 15 | 30 | 60 | null; // null = „aus"; Default 30
  readonly extraTurnOnHit: boolean;         // Treffer = Extrazug
}

interface Seat {
  readonly playerId: 'A' | 'B';             // Engine-Zuordnung
  readonly identity:                        // aufgelöst beim Beitritt
    | { kind: 'user'; userId: string; displayName: string }
    | { kind: 'guest'; displayName: string };
  readonly connected: boolean;              // Presence (FR-019)
  readonly placed: boolean;                 // „Schiffe platziert"-Status (FR-018/019)
}
```

**Ableitung in `GameConfig`**: `settings` → Engine-`GameConfig`
(`board = DEFAULT_BOARD`, `fleet = CLASSIC_FLEET`, `allowTouching`, `extraTurnOnHit`). Die
Timer-Dauer ist **kein** Engine-Begriff (rein serverseitig).

### 2.2 Hilfs-Keys

| Key | Typ | Zweck | TTL |
|-----|-----|-------|-----|
| `lobby:{code}` | JSON-String | `LobbyRecord` (s. o.) | waiting 10 min · in_progress sliding ~2 h · finished kurz |
| `join-fails:{identity}` | Counter | Beitritts-Drosselung gegen Code-Erraten (FR-006a) | kurzes Sliding-Window |
| `open-lobbies:{userId}` | Set/Counter | Obergrenze offener Lobbys pro Nutzer (FR-006b) | bis Lobby-Ende |
| Socket.IO-Adapter-Keys | (Adapter-intern) | Pub/Sub-Backplane | Adapter-verwaltet |

**Atomarität**: Mutationen an `lobby:{code}` (Beitritt, Platzierung, Schuss+Dedup, Zugwechsel,
Statuswechsel) laufen über `WATCH/MULTI/EXEC` bzw. ein Lua-Script, um Lost-Updates und das
Doppel-Apply-Fenster zu vermeiden (research.md §4/§7).

---

## 3. Prisma-Modelle (neu) — Spec §9

Ergänzt das bestehende Schema (`User`, `Session`, `Stat`, `MatchResult` bleiben unverändert). Gäste
haben weiterhin **keinen** `User`-Eintrag → in `Match` als nullable Seite + Anzeigename abgebildet.

```prisma
enum MatchMode {
  PVP
  // PVAI später; dieses Feature schreibt nur PVP.
}

enum MatchStatus {
  FINISHED        // regulär: alle Schiffe versenkt
  FORFEITED       // Aufgabe durch Verbindungsverlust/Verlassen (FR-010a)
}

enum MoveResult {
  MISS
  HIT
  SUNK
}

model Match {
  id          String      @id @default(cuid())
  matchKey    String      @unique            // Idempotenz: ein finish ⇒ ein Match
  lobbyCode   String
  mode        MatchMode    @default(PVP)
  status      MatchStatus

  // Seat A
  playerAId       String?                    // null, wenn Gast
  playerA         User?    @relation("MatchPlayerA", fields: [playerAId], references: [id])
  playerADisplay  String                     // Anzeigename (auch für Gast persistiert)

  // Seat B
  playerBId       String?                    // null, wenn Gast
  playerB         User?    @relation("MatchPlayerB", fields: [playerBId], references: [id])
  playerBDisplay  String

  winnerSeat  String                         // 'A' | 'B'
  settings    Json                           // LobbySettings-Snapshot (Berührung/Timer/Extrazug)

  startedAt   DateTime
  endedAt     DateTime    @default(now())

  moves       MatchMove[]

  @@index([playerAId])
  @@index([playerBId])
}

model MatchMove {
  id         String     @id @default(cuid())
  matchId    String
  match      Match      @relation(fields: [matchId], references: [id], onDelete: Cascade)
  turnIndex  Int                              // 0-basiert, Reihenfolge der Schüsse
  byPlayer   String                           // 'A' | 'B'
  x          Int
  y          Int
  result     MoveResult

  @@unique([matchId, turnIndex])
  @@index([matchId])
}
```

**User-Relationen** (Rückseite, additiv in `model User`):
```prisma
  matchesAsA  Match[]  @relation("MatchPlayerA")
  matchesAsB  Match[]  @relation("MatchPlayerB")
```

**Validierungs-/Konsistenzregeln**:
- `matchKey` eindeutig → erneutes „finished" erzeugt kein zweites `Match` (FR-026/SC-008).
- `MatchMove.turnIndex` lückenlos aufsteigend pro Match; `@@unique([matchId, turnIndex])` sichert
  Idempotenz beim Batch-Insert.
- `winnerSeat` ∈ {`A`,`B`}; bei `FORFEITED` ist der verbleibende Spieler der Sieger (FR-010a).
- Stats-Fortschreibung nur für Seats mit `playerXId != null` (eingeloggt; FR-024/025) über
  `StatsService.recordResult(userId, resultId = match.id, outcome)`.

---

## 4. Reine Ableitungs-Funktion `pvp-result.ts`

`(game: GameState, seats, matchKey, lobbyCode, settings, status) → MatchWritePayload`:

| Output | Inhalt |
|--------|--------|
| `match` | Felder für `Match` (Seats→Identitäten/Display, `winnerSeat`, `settings`, Zeiten, `status`). |
| `moves` | `MatchMove[]` aus dem Engine-Zug-Verlauf (Reihenfolge, Seat, Koordinate, Ergebnis). |
| `statWrites` | Liste `{ userId, outcome: 'win' \| 'loss' }` nur für eingeloggte Seats. |

Rein und ohne DB → TDD-fähig. Quelle der Zugfolge: der über die Partie mitgeführte Move-Ledger
(siehe Redis `processedMoveIds`/Engine-Ergebnisse) bzw. die aus dem Endzustand rekonstruierbaren
`shotsReceived`. (Genaue Move-Ledger-Form ist Implementierungsdetail; der Payload-Vertrag steht.)

---

## 5. Bezug zu Spec-Entitäten

| Spec-Entität (spec.md) | Umsetzung hier |
|------------------------|----------------|
| **Lobby** | `LobbyRecord` in Redis (`code`, `status`, `hostUserId`, `settings`, `createdAt`). |
| **Lobby-Teilnehmer / Spielersitz** | `Seat` (Identität user\|guest, `connected`, `placed`, `playerId`, am Zug = `game.turn`). |
| **Partie-/Spielzustand** | eingebetteter Engine-`GameState` (+ `turnDeadline`); SSoT = Engine. |
| **Schuss/Zug** | `shot:fire`-Intent mit `moveId` → `applyShot` → `ShotResult`; `MatchMove` bei Ende. |
| **Partieergebnis (Statistik)** | `pvp-result` → `Match`/`MatchMove` + idempotente `Stat`-Fortschreibung. |
