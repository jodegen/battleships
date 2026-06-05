# Contract: REST-API (Identität & Persistenz)

Basis: NestJS-Service unter `packages/server`. Alle Bodies sind JSON. Auth über `HttpOnly`-
Cookies (siehe `identity-session.md`); Clients senden `credentials: 'include'`. Im Dev werden die
Endpunkte vom Web über `/api/*` proxyt (Same-Origin). Fehlerantworten folgen dem Nest-Standard
`{ statusCode, message, error }`.

## Gemeinsame Typen (Response-Shapes)

```ts
// Identität (GET /me)
type Identity =
  | { kind: 'user'; displayName: string }
  | { kind: 'guest'; displayName: string }
  | { kind: 'anonymous' };

// Statistik (abgeleitete Felder inklusive)
interface StatsView {
  gamesPlayed: number;   // = wins + losses (abgeleitet)
  wins: number;
  losses: number;
  winRate: number;       // 0..1 (oder als %); 0 wenn gamesPlayed === 0
}

// Profil (eingeloggt)
interface ProfileView {
  displayName: string;
  stats: StatsView;
}
```

`passwordHash`, `email` und interne IDs erscheinen **nie** in Responses (Ausnahme: E-Mail darf im
eigenen Profil zurückgegeben werden — hier bewusst weggelassen, da Spec nur Anzeigename+Stats
fordert, FR-011).

---

## Auth

### POST /auth/register  (FR-004/005/006/023, SC-001/SC-008/SC-009)

- **Body**: `{ email: string; password: string; displayName: string }`
- **Validierung**: `email` gültig; `password` ≥ 8 (keine Kompositionspflicht); `displayName` 3–20
  + Inhaltsfilter.
- **Erfolg `201`**: legt `User` + `Stat` (Nullwerte) an, erzeugt Session, setzt `sid`-Cookie.
  Body: `ProfileView`.
- **Fehler**:
  - `409 Conflict` — E-Mail bereits vergeben (FR-005).
  - `400 Bad Request` — Validierung (Passwort < 8, ungültige E-Mail, ungültiger Name).
- **Akzeptanz**: US1-1, US1-2.

### POST /auth/login  (FR-007/008)

- **Body**: `{ email: string; password: string }`
- **Erfolg `200`**: verifiziert argon2id-Hash, erzeugt Session, setzt `sid`-Cookie. Body:
  `ProfileView`.
- **Fehler**:
  - `401 Unauthorized` — **einheitlich** „ungültige Zugangsdaten", unabhängig davon, ob E-Mail
    existiert oder Passwort falsch (FR-008, keine Account-Enumeration).
- **Akzeptanz**: US1-3, US1-4.

### POST /auth/logout  (FR-010)

- **Auth**: eingeloggt (sonst `204` idempotent — nichts zu tun).
- **Erfolg `204`**: löscht Session-Zeile, entfernt `sid`-Cookie (Max-Age 0).
- **Akzeptanz**: US1-6.

### POST /auth/guest  (FR-012/013/014/015)

- **Body**: `{ displayName: string }`
- **Validierung**: `displayName` 3–20 + Inhaltsfilter (FR-013).
- **Erfolg `201`**: erzeugt signiertes Gast-Token (kein DB-Eintrag), setzt `guest`-Cookie. Body:
  `{ kind: 'guest'; displayName }`.
- **Fehler**: `400` — ungültiger Name.
- **Akzeptanz**: US3-1, US3-2.

---

## Identität & Profil

### GET /me  (FR-001/002, SC-007, SC-010)

- **Auth**: optional. Liest `sid` (Vorrang) bzw. `guest`-Cookie.
- **Erfolg `200`**: `Identity`. Eingeloggt ⇒ `{kind:'user',...}` (verlängert rollierend die
  Session); gültiges Gast-Token ⇒ `{kind:'guest',...}`; sonst `{kind:'anonymous'}`.
- **Zweck**: Session-Restore beim App-Start (SC-010) und Typ-Bestimmung (SC-007).
- **Akzeptanz**: US1-5, US4-1.

### GET /me/profile  (FR-011, FR-003)

- **Auth**: **nur eingeloggt** (`LoggedInGuard`).
- **Erfolg `200`**: `ProfileView` (Anzeigename + `StatsView`).
- **Fehler**: `403` für Gäste (FR-003/US4-4), `401` für anonym.
- **Akzeptanz**: US2-3, US2-5, US4-2/3/4.

### GET /me/stats  (FR-016/018/021)

- **Auth**: **nur eingeloggt**.
- **Erfolg `200`**: `StatsView`. Bei 0 Partien: `{gamesPlayed:0,wins:0,losses:0,winRate:0}`
  (SC-003, US2-5).
- **Fehler**: `403` Gast, `401` anonym.

---

## Stats-Schreibpfad (KI-Ergebnis)

### POST /me/match-results  (FR-017/019/020/025, SC-002/SC-006)

- **Auth**: **nur eingeloggt**. (Gäste: `403` — keine Persistenz, FR-014/US3-3.)
- **Body**: `{ resultId: string; outcome: 'win' | 'loss' }`
  - `resultId`: client-erzeugte, **partie-stabile** UUID (gleiche Partie ⇒ gleiche ID).
  - `outcome`: aus Sicht des eingeloggten Spielers; nur `win`|`loss` (kein Unentschieden).
- **Verhalten (idempotent, eine Transaktion)**:
  - Neuer `resultId` ⇒ `MatchResult` einfügen + `Stat.wins|losses += 1`.
  - Bekannter `resultId` ⇒ **No-Op** (Unique-Konflikt abgefangen), Stats unverändert.
- **Erfolg `200`**: aktualisierte `StatsView` (bei Replay: unveränderte Werte → identische
  Antwort).
- **Fehler**:
  - `400` — fehlender/ungültiger `resultId` oder ungültiges `outcome`.
  - `401` anonym, `403` Gast.
- **Nicht erfasst**: unbeendete/abgebrochene Partien (Client meldet nur bei „finished", FR-020).
  Keine Züge/Boards/History (FR-025).
- **Akzeptanz**: US2-1, US2-2, US2-6.

---

## Status-Code-Konventionen

| Situation | Code |
|-----------|------|
| Erstellt (Register/Guest) | 201 |
| OK mit Body | 200 |
| OK ohne Body (Logout) | 204 |
| Validierungsfehler | 400 |
| Nicht angemeldet (anonym, Endpoint braucht Identität) | 401 |
| Falsche Login-Zugangsdaten (einheitlich) | 401 |
| Angemeldet/Gast, aber Capability fehlt (Gast auf eingeloggt-only) | 403 |
| E-Mail bereits vergeben | 409 |

## Capability-Gating (FR-003) — Referenz für M3

`LoggedInGuard` schützt `/me/profile`, `/me/stats`, `/me/match-results`. Die spätere
**Lobby-Erstellung** (M3, „nur eingeloggte Spieler") hängt am **selben** Guard — in diesem Feature
nicht implementiert (FR-022), aber als Naht etabliert (US4-2/3).
