# Contract: Identitäts-Auflösung, Session-Cookie & Gast-Token

Definiert, wie der Server pro Anfrage die Identität bestimmt (FR-001/002), wie die eingeloggte
Session funktioniert (FR-009/010, SC-010) und wie Gäste ohne DB-Eintrag repräsentiert werden
(FR-012/014/015). Ergänzt `rest-api.md`.

## Identitäts-Typ (Server-intern)

```ts
type Identity =
  | { kind: 'user'; userId: string; displayName: string }   // eingeloggt (DB)
  | { kind: 'guest'; displayName: string }                  // Gast (stateless Token)
  | { kind: 'anonymous' };                                  // keine gültige Identität
```

- Reine Helfer (`identity.ts`, unit-getestet, ohne Nest/HTTP):
  - `isLoggedIn(id): id is {kind:'user'}`
  - `isGuest(id): id is {kind:'guest'}`
  - `requireLoggedIn(id)` → wirft/markiert für `LoggedInGuard`
  - Capability-Check-Muster (z. B. künftiges `canCreateLobby = isLoggedIn`).

## Auflösungsreihenfolge (IdentityGuard)

Pro Anfrage, **erste passende** gewinnt:

1. Gültiges `sid`-Cookie (DB-Session nicht abgelaufen) ⇒ `user`. Session rollierend verlängern.
2. Sonst gültiges, signiertes `guest`-Cookie (Signatur & `exp` ok) ⇒ `guest`.
3. Sonst ⇒ `anonymous`.

> Liegt sowohl `sid` (gültig) als auch `guest` vor, hat **eingeloggt Vorrang**.

## Eingeloggte Session (Cookie `sid`)

| Aspekt | Festlegung |
|--------|-----------|
| Cookie-Name | `sid` |
| Inhalt | zufälliges Roh-Token (≥256 bit, base64url) — **nur** im Cookie |
| Speicherung | DB-Zeile `Session.id = hash(token)`; Klartext-Token nie persistiert |
| Flags | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` (nur Produktion) |
| Lebensdauer | `Max-Age`/`expiresAt` rollierend ~30 Tage; pro Anfrage verlängert (Sliding Window) |
| Erzeugung | bei Register/Login |
| Beendigung | Logout (DB-Zeile löschen + Cookie `Max-Age=0`) **oder** Ablauf |
| Restore | beim App-Start lädt der Client `GET /me`; gültiges Cookie ⇒ weiterhin angemeldet (SC-010) |

- **Sicherheit**: Token-Hash-Speicherung (DB-Leak gibt keine gültigen Tokens preis). `HttpOnly`
  verhindert JS-Zugriff. Kein Token im Response-Body.

## Gast-Token (Cookie `guest`)

| Aspekt | Festlegung |
|--------|-----------|
| Cookie-Name | `guest` |
| Inhalt | signiertes Token (JWT HS256 **oder** `crypto`-HMAC) über `{ typ:'guest', displayName, iat, exp }` |
| Speicherung | **keine** — vollständig stateless (FR-014) |
| Flags | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` (nur Produktion) |
| Lebensdauer | kurz, Default ~24 h (`exp`); kein rollierendes Verlängern |
| Erzeugung | `POST /auth/guest` nach Namensvalidierung |
| Beendigung | Ablauf oder Cookie-Löschung ⇒ **nicht wiederherstellbar** (FR-015, SC-005) |
| Schlüssel | `GUEST_TOKEN_SECRET` (Server-Env) |

- **Warum stateless**: Es gibt nichts serverseitig zu widerrufen; nach Ablauf existiert die
  Identität nirgends (erfüllt FR-015/SC-005 per Konstruktion). Signatur macht den Typ
  vertrauenswürdig bestimmbar (FR-002), ohne dass der Client den Typ fälschen kann.

## Capability-Gate (LoggedInGuard, FR-003)

- Schützt eingeloggt-only-Endpunkte: `GET /me/profile`, `GET /me/stats`,
  `POST /me/match-results`.
- Verhalten: `user` ⇒ Durchlass; `guest` ⇒ `403`; `anonymous` ⇒ `401`.
- **Erweiterungsnaht (M3)**: die spätere Lobby-Erstellung („nur eingeloggte Spieler", §3.2)
  verwendet **denselben** Guard. In diesem Feature nicht implementiert (FR-022), aber als
  testbare Beispiel-Capability über die geschützten Endpunkte nachgewiesen (US4-2/3).

## Bezug zu Erfolgskriterien

- **SC-007** (Typ eindeutig): IdentityGuard + signiertes Gast-Token + DB-Session.
- **SC-010** (angemeldet nach Browser-Neustart): persistentes `sid`-Cookie + DB-Session + `GET /me`.
- **SC-005** (Gast nicht wiederherstellbar): stateless Token ohne Persistenz.
- **FR-008** (keine Enumeration): Login-Fehler stets `401` einheitlich (siehe `rest-api.md`).
