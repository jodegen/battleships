# Phase 1 Data Model: Identität und Persistenz

Persistenz in PostgreSQL via Prisma. Vier Modelle: `User`, `Session`, `Stat`, `MatchResult`.
**Gäste haben kein Modell** — ihre Identität lebt ausschließlich im signierten Gast-Token
(siehe `contracts/identity-session.md`). Abgeleitete Werte (`gamesPlayed`, `winRate`) werden
**nicht** gespeichert.

## Entity-Relationship (Überblick)

```text
User 1 ──── 1 Stat            (jeder Nutzer genau eine Statistik)
User 1 ──── * Session         (mehrere aktive Geräte/Browser möglich)
User 1 ──── * MatchResult     (Dedup-Ledger der erfassten KI-Ergebnisse)
Gast  : kein DB-Eintrag       (stateless Token)
```

## Modell: User (FR-004/005/006/011)

| Feld | Typ | Constraints | Hinweis |
|------|-----|-------------|---------|
| `id` | String (cuid) | PK | Stabile interne Kennung |
| `email` | String | **UNIQUE**, nicht null | Bei Speicherung lowercased+getrimmt (case-insensitive eindeutig, FR-005) |
| `displayName` | String | nicht null, 3–20 Zeichen | **Nicht** eindeutig (Edge Case „Namens-Kollision") |
| `passwordHash` | String | nicht null | argon2id-Hash inkl. Salt; nie ausgeben (FR-006, SC-008) |
| `createdAt` | DateTime | default now() | §9 |
| `updatedAt` | DateTime | `@updatedAt` | |

- Relationen: `stat Stat?` (1:1), `sessions Session[]`, `matchResults MatchResult[]`.
- Bei Registrierung wird `User` **und** `Stat` in **einer Transaktion** angelegt (Invariante:
  jeder User hat sofort eine Stat mit Nullwerten).
- `passwordHash` ist von jeder API-Ausgabe ausgeschlossen (kein Select in Response-Mappern).

## Modell: Session (FR-009/010, SC-010) — eingeloggte Sitzung

| Feld | Typ | Constraints | Hinweis |
|------|-----|-------------|---------|
| `id` | String | PK | **Hash** des Roh-Tokens (Token selbst nur im Cookie) |
| `userId` | String | FK → User.id, `onDelete: Cascade` | |
| `createdAt` | DateTime | default now() | |
| `expiresAt` | DateTime | nicht null, indexiert | Rollierend ~30 Tage; bei jeder Anfrage verlängert |
| `lastUsedAt` | DateTime | nullable | Optional für Telemetrie/Debug |

- **Issue**: Roh-Token = zufällige ≥256-bit Zeichenkette (base64url) → als `HttpOnly`-Cookie
  `sid`; gespeichert wird nur `hash(token)` als `id`.
- **Validate**: eingehendes Cookie → `hash` → Lookup; ungültig/abgelaufen ⇒ keine Identität.
- **Rotate (rolling)**: bei gültiger Anfrage `expiresAt = now + 30d` (Sliding Window).
- **Revoke**: Logout löscht die Zeile (FR-010, sofortige Invalidierung); abgelaufene Zeilen
  können per Wartung/Lazy-Delete entfernt werden.
- **Zustandsübergänge**: `aktiv → (Logout|Ablauf) → ungültig`. Ungültige Sessions werden nicht
  reaktiviert.

## Modell: Stat (FR-016/017/018/021) — aggregierte Statistik

| Feld | Typ | Constraints | Hinweis |
|------|-----|-------------|---------|
| `id` | String (cuid) | PK | |
| `userId` | String | **UNIQUE**, FK → User.id, `onDelete: Cascade` | 1:1 |
| `wins` | Int | default 0, `>= 0` | **Quelle der Wahrheit** |
| `losses` | Int | default 0, `>= 0` | **Quelle der Wahrheit** |
| `updatedAt` | DateTime | `@updatedAt` | |

- **Abgeleitet (nicht gespeichert)**:
  - `gamesPlayed = wins + losses`
  - `winRate = gamesPlayed === 0 ? 0 : wins / gamesPlayed` (zur Anzeige gerundet, z. B. 2 NK /
    Prozent). Reine Funktion `win-rate.ts`; garantiert keine Division durch null (SC-003).
- **Invariante**: `gamesPlayed === wins + losses` (durch Ableitung automatisch erfüllt).
- **Schreibpfad**: ausschließlich über `recordResult` (siehe `MatchResult`), immer +1 auf genau
  einen von `wins`/`losses` (FR-017); kein direktes Setzen über die API.

## Modell: MatchResult (FR-019, SC-006) — Dedup-Ledger (KEIN Match-Datensatz)

| Feld | Typ | Constraints | Hinweis |
|------|-----|-------------|---------|
| `id` | String (cuid) | PK | |
| `userId` | String | FK → User.id, `onDelete: Cascade` | |
| `resultId` | String | siehe Unique unten | Client-erzeugte, partie-stabile UUID |
| `outcome` | Enum `Outcome { WIN, LOSS }` | nicht null | Aus Sicht des meldenden Spielers |
| `recordedAt` | DateTime | default now() | |

- **Unique**: `@@unique([userId, resultId])` — macht die Erfassung idempotent (FR-019). Eine
  Wiederholung mit bekanntem `resultId` ⇒ Unique-Konflikt ⇒ No-Op.
- **Bewusst NICHT enthalten** (FR-025): keine Züge (`MatchMove`), keine Boards, kein `lobbyCode`,
  kein Gegner, keine KI-Stufe. Dieses Modell ist **nur** ein Idempotenz-/Audit-Ledger, **keine**
  Match-History und keine Replay-Quelle.
- **Transaktion** (`recordResult`): `INSERT MatchResult` → bei Erfolg `Stat.wins|losses += 1`;
  bei Unique-Konflikt Transaktion ohne Stat-Änderung beenden und aktuelle Stats zurückgeben.

## Gast (kein Modell) (FR-012/014/015)

- Keine Tabelle, keine Zeile. Identität = signiertes, kurzlebiges Token mit `{ typ:'guest',
  displayName, iat, exp }` (siehe `contracts/identity-session.md`).
- Konsequenz: nach Ablauf/Löschen nicht wiederherstellbar (FR-015, SC-005); keine Statistik
  (FR-014).

## Prisma-Schema (Skizze)

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum Outcome { WIN LOSS }

model User {
  id           String        @id @default(cuid())
  email        String        @unique
  displayName  String
  passwordHash String
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  stat         Stat?
  sessions     Session[]
  matchResults MatchResult[]
}

model Session {
  id         String   @id            // = hash(rawToken)
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())
  expiresAt  DateTime
  lastUsedAt DateTime?
  @@index([userId])
  @@index([expiresAt])
}

model Stat {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  wins      Int      @default(0)
  losses    Int      @default(0)
  updatedAt DateTime @updatedAt
}

model MatchResult {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  resultId   String
  outcome    Outcome
  recordedAt DateTime @default(now())
  @@unique([userId, resultId])
  @@index([userId])
}
```

## Validierungsregeln (Quelle: FRs)

- `email`: gültiges Format (`@IsEmail`), lowercased+getrimmt, eindeutig (FR-005). Doppelt ⇒ 409.
- `password`: Länge ≥ 8, keine Kompositionspflicht (FR-023, SC-009). Klartext nie speichern
  (FR-006, SC-008).
- `displayName` (User & Gast): 3–20 Zeichen, Inhaltsfilter (Allowlist-Pattern + Blocklist, §10,
  FR-013). Ungültig ⇒ 400.
- `resultId`: nicht leer, UUID-Form; Eindeutigkeit pro `userId` erzwungen (FR-019).
- `outcome`: nur `win`|`loss` — kein Unentschieden (Edge Case „Unentschieden").

## Bezug zu Erfolgskriterien

- SC-002/SC-003: Ableitung `gamesPlayed`/`winRate` + +1-Schreibpfad.
- SC-004: Persistenz in `User`/`Stat`; Session-Restore über `Session`-Cookie.
- SC-005: Gast ohne Modell ⇒ keine Persistenz, nicht wiederherstellbar.
- SC-006: `@@unique([userId, resultId])` ⇒ keine Doppelzählung.
- SC-007: Identitätstyp aus Cookie/Token via `IdentityGuard`.
- SC-008: `passwordHash` (argon2id), nie ausgegeben.
- SC-010: persistentes `HttpOnly`-Cookie + DB-Session, rollierend.
