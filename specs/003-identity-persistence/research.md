# Phase 0 Research: Identität und Persistenz

Auflösung der Technologie- und Pattern-Entscheidungen für `packages/server` (NestJS) und die
Anbindung von `packages/web`. Alle offenen Punkte aus dem Technical Context sind unten als
**Decision / Rationale / Alternatives** festgehalten. Keine `NEEDS CLARIFICATION` mehr offen.

## 1. Backend-Framework & Sprache

- **Decision**: NestJS 10 + TypeScript `strict`, Express-Adapter (`@nestjs/platform-express`).
- **Rationale**: Vom Nutzer vorgegeben und mit der Projektspezifikation (§7.1) konsistent.
  Modulare DI-Struktur passt zu auth/users/stats; spätere Erweiterung um ein WebSocket-Gateway
  (M3) ist mit NestJS nativ möglich.
- **Alternatives**: Fastify-Adapter (geringfügig schneller, hier irrelevant); reines Express
  (weniger Struktur). Verworfen zugunsten Konsistenz mit der Projektspezifikation.

## 2. Passwort-Hashing

- **Decision**: **argon2id** via `argon2`-Paket, OWASP-orientierte Parameter (z. B.
  memoryCost ~19 MiB, timeCost 2, parallelism 1; final im Code als benannte Konstante). Gekapselt
  in einer reinen `password.ts` mit `hash(plain)` / `verify(hash, plain)`.
- **Rationale**: argon2id ist die aktuelle OWASP-Empfehlung (resistenter gegen GPU-/Side-Channel-
  Angriffe als bcrypt). Salt wird vom Paket pro Hash erzeugt und im Hash-String kodiert (FR-006).
- **Alternatives**: `bcrypt` (breit etabliert, 72-Byte-Eingabegrenze, schwächere Speicherhärte);
  `scrypt` (Node-nativ, aber umständlichere Parametrisierung). bcrypt bleibt akzeptabler Fallback,
  falls `argon2` (native Bindings) in CI Probleme macht — dann gleiche `password.ts`-Schnittstelle.
- **Test-Hinweis**: TDD gegen die Schnittstelle (hash ≠ Klartext; verify(true/false); zwei Hashes
  desselben Passworts unterscheiden sich durch Salt). In Tests Kostenparameter niedrig halten.

## 3. Session-Modell (eingeloggt) — opake DB-Session + HTTP-only-Cookie

- **Decision**: **Serverseitige, opake Session** in der `Session`-Tabelle. Bei Login/Registrierung
  erzeugt der Server ein kryptografisch zufälliges Token (≥256 bit, base64url), speichert dessen
  **Hash** als Zeilen-ID/Schlüssel und setzt das Roh-Token als `HttpOnly`-Cookie
  (`SameSite=Lax`, `Secure` in Produktion, `Path=/`). `expiresAt` rollierend ~30 Tage; bei jeder
  authentifizierten Anfrage wird `expiresAt` verlängert (Sliding Window). Logout löscht die Zeile
  und das Cookie.
- **Rationale**: Erfüllt FR-009 (übersteht Reload/Browser-Neustart durch persistentes Cookie +
  DB-Zeile), FR-010 (Logout = sofortige serverseitige Invalidierung — Vorteil gegenüber reinem
  JWT), SC-010. Token-Hash-Speicherung verhindert Session-Diebstahl bei DB-Leak.
- **Alternatives**: **Stateless JWT als Session** (kein serverseitiges Logout/Revoke ohne
  Blocklist; widerspricht FR-010-Sofortbeendigung) — verworfen für eingeloggte Sessions.
  `express-session` mit Store (mehr Magie, weniger Kontrolle) — verworfen zugunsten eines kleinen,
  explizit getesteten `session.service`.
- **Cookie-Name**: z. B. `sid`. Rohwert nie im Response-Body.

## 4. Gast-Identität — kurzlebiges, stateless signiertes Token (KEIN DB-Eintrag)

- **Decision**: Gast-Identität als **signiertes, kurzlebiges Token** (JWT mit HS256 **oder**
  `crypto`-HMAC über ein kompaktes Payload `{ typ:'guest', name, iat, exp }`), gesetzt als
  separates `HttpOnly`-Cookie (z. B. `guest`), TTL kurz (Default ~24 h, nicht rollierend).
  **Keine** DB-Zeile (FR-014). Signaturschlüssel aus `GUEST_TOKEN_SECRET`.
- **Rationale**: Erfüllt §3.3/§9 („kurzlebiges Session-Token, kein Account-Eintrag") und FR-014/
  FR-015: Nach Ablauf/Löschen ist die Gast-Identität nicht wiederherstellbar, da nirgends
  persistiert. Stateless ist hier korrekt, weil es nichts serverseitig zu widerrufen gibt.
- **Alternatives**: Gast ebenfalls in `Session`-Tabelle (verstößt gegen „kein DB-Eintrag",
  erzeugt Aufräum-Last) — verworfen. Rein clientseitiger Name ohne Signatur (Server könnte Typ
  nicht vertrauenswürdig bestimmen, FR-002) — verworfen.
- **Abgrenzung**: Liegt ein gültiges `sid` (eingeloggt) vor, hat es Vorrang vor `guest`.

## 5. Identitäts-Auflösung & Capability-Gating (FR-001/002/003)

- **Decision**: Ein **`IdentityGuard`** (global oder per Controller) liest Cookies und setzt
  `request.identity` auf eine diskriminierte Union: `{ kind:'user', userId, displayName }` |
  `{ kind:'guest', displayName }` | `{ kind:'anonymous' }`. Reine Helfer in `identity.ts`
  (`isLoggedIn`, `canCreateLobby`-artige Capability-Checks). Ein **`LoggedInGuard`** schützt
  eingeloggt-only-Endpunkte und liefert `403` für Gäste, `401` für anonym.
- **Rationale**: Zentralisiert die Typ-Bestimmung (FR-002) und macht das Gating testbar und
  wiederverwendbar — exakt die Naht, an der M3 die Lobby-Erstellung „nur eingeloggt" anhängt
  (FR-003). Die reine `identity.ts`-Logik ist ohne Nest/HTTP unit-testbar.
- **Alternatives**: Ad-hoc-Checks je Controller (dupliziert, fehleranfällig) — verworfen.
  Passport.js-Strategien (zusätzliche Abstraktion, hier überdimensioniert) — verworfen.

## 6. ORM & Migrationen

- **Decision**: **Prisma 5**. `schema.prisma` mit `User`, `Session`, `Stat`, `MatchResult`.
  Lokale/CI-Schemaerstellung über `prisma migrate deploy` (CI) bzw. `prisma migrate dev` (lokal);
  Client via `prisma generate`.
- **Rationale**: Vom Nutzer vorgegeben, §7.1-konform; typsichere Queries passen zu Prinzip IV.
  Transaktionen (`$transaction`) für „Stat-Update + Dedup-Insert" in einem atomaren Schritt.
- **Alternatives**: TypeORM (NestJS-üblich, aber schwächere Typsicherheit/Migrations-DX); Kysely/
  Drizzle (leichter, aber Prisma ist projektgesetzt). Verworfen.

## 7. Idempotenz des Stats-Schreibpfads (FR-019, SC-006)

- **Decision**: **Dedup-Ledger `MatchResult`** mit eindeutiger Kennung pro Partie. Der Client
  erzeugt eine stabile `resultId` (UUID v4) je Partie (beim Spielstart, über injizierte
  ID-Factory — analog zur RNG-Injektion der Engine, damit Tests deterministisch sind) und sendet
  sie beim Spielende. Der Server führt in **einer Transaktion** aus: `INSERT` in `MatchResult`
  mit `@@unique([userId, resultId])`; bei Erfolg `Stat`-Counter erhöhen; bei Unique-Konflikt
  (Replay) **No-Op** und unveränderte Stats zurückgeben.
- **Rationale**: Unique-Constraint macht die Operation race-frei idempotent (auch bei parallelem
  Doppel-Submit). Das Ledger speichert nur `{ userId, resultId, outcome, recordedAt }` — **kein**
  Match-Datensatz mit Zügen/Boards, daher kein Verstoß gegen FR-025 (keine History/Replays).
- **Alternatives**: Idempotenz nur im Client (verstößt gegen SC-006 bei Reload/Retry) — verworfen.
  „Upsert by check-then-act" ohne Constraint (race-anfällig) — verworfen.

## 8. Statistik-Ableitung (FR-016/018, SC-003)

- **Decision**: Persistiere **`wins` und `losses`** als Quelle der Wahrheit; **`gamesPlayed` und
  `winRate` werden bei jedem Lesen abgeleitet** (`gamesPlayed = wins + losses`;
  `winRate = gamesPlayed === 0 ? 0 : wins / gamesPlayed`, gerundet zur Anzeige). Reine
  `win-rate.ts`.
- **Rationale**: Vermeidet Denormalisierungs-Drift und Division-durch-null (SC-003); hält
  Invariante `gamesPlayed === wins + losses` automatisch ein. Die §9-Skizze listet `winRate`/
  `gamesPlayed` als Spalten, ist aber ausdrücklich „Skizze" — Ableitung ist die robustere Wahl.
- **Alternatives**: Alle drei Felder speichern (Drift-Risiko, mehr Schreibpfade) — verworfen.

## 9. DTO-Validierung & Eingaberegeln (FR-005/008/013/023)

- **Decision**: `class-validator`/`class-transformer` mit globaler `ValidationPipe`
  (`whitelist:true`, `forbidNonWhitelisted:true`). Regeln: E-Mail `@IsEmail`, beim Speichern
  **lowercased + getrimmt** (Uniqueness case-insensitiv); Passwort `@MinLength(8)` ohne
  Kompositionspflicht (FR-023); Anzeigename Länge (z. B. 3–20) + Inhaltsfilter (Allowlist-Pattern;
  einfache Schimpfwort-Blocklist als Platzhalter, §10). Login-Fehler → einheitlich `401`
  „ungültige Zugangsdaten" ohne Existenz-Unterscheidung (FR-008).
- **Rationale**: Deklarative, testbare Validierung; einheitliche Fehlersemantik schützt vor
  Account-Enumeration.
- **Alternatives**: `zod`-Pipes (möglich, aber class-validator ist NestJS-idiomatisch) — neutral
  verworfen zugunsten Framework-Konvention.
- **Offen für Plan-Detail (nicht blockierend)**: konkrete Namens-Längengrenzen & Filterquelle
  (eigene Liste vs. Bibliothek) — Spec lässt dies bewusst offen; Default oben.

## 10. CORS, Cookies & lokale Entwicklung (SC-010)

- **Decision**: **Dev-Same-Origin via Next.js-Rewrite**: `packages/web/next.config.mjs` proxyt
  `/api/:path*` → `http://localhost:<SERVER_PORT>/:path*`. Der Browser sieht nur den Web-Origin,
  daher funktionieren `HttpOnly`-Cookies ohne Cross-Site-Komplikationen. Zusätzlich aktiviert der
  Server CORS mit `credentials:true` und `origin = WEB_ORIGIN` als Fallback für direkten Zugriff.
  Cookies `SameSite=Lax`, `Secure` nur in Produktion.
- **Rationale**: Vermeidet `SameSite=None; Secure`-Anforderungen und Cross-Site-Cookie-Fallen im
  lokalen Dev; robusteste Variante für SC-010 (Persistenz über Browser-Neustart).
- **Alternatives**: Direkter Cross-Port-Zugriff mit `SameSite=None;Secure` (erfordert HTTPS lokal,
  fragil) — verworfen. Server hinter `/api` im selben Next.js-Prozess (vermischt Schichten) —
  verworfen.

## 11. Test-Runner für NestJS (Prinzip IV: ein Toolchain)

- **Decision**: **Vitest** auch für den Server, konsistent mit `engine`/`web`. NestJS-Decorator-/
  DI-Metadaten benötigen emittierte `reflect-metadata`-Informationen; daher `unplugin-swc` (SWC)
  im `vitest.config.ts` plus `reflect-metadata`-Import in der Test-Setup-Datei. Reine
  Domänenlogik wird ohne Nest getestet; Integrationstests booten `Test.createTestingModule` +
  `supertest`.
- **Rationale**: Ein einziger Test-Runner im Monorepo (weniger Komplexität, einheitliche CI,
  Prinzip IV). SWC liefert die für NestJS nötigen Decorator-Metadaten unter Vitest.
- **Alternatives**: **Jest** (NestJS-Default, Zero-Config für Decorators) — würde einen zweiten
  Test-Runner einführen (Inkonsistenz, doppelte Konfiguration); bewusst verworfen. Falls
  `unplugin-swc` unerwartet Probleme macht, ist Jest der dokumentierte Fallback **nur** für den
  Server.

## 12. Integrationstest-Datenbank

- **Decision**: Integrationstests laufen gegen eine **echte Postgres** (lokal: der Docker-Compose-
  Dienst; CI: `services: postgres`). Vor der Suite `prisma migrate deploy`; Isolation pro Test über
  Truncate/Transaktions-Rollback oder eindeutige Datensätze. Reine Unit-Tests benötigen **keine**
  DB.
- **Rationale**: Der Stats-Schreibpfad hängt am Unique-Constraint/Transaktionsverhalten (FR-019) —
  das ist nur gegen echtes Postgres aussagekräftig. SQLite/Mock würde genau die getestete
  Eigenschaft verfehlen.
- **Alternatives**: Testcontainers (sauberste Isolation, aber zusätzliche Abhängigkeit/Docker-in-
  CI-Overhead) — optional später; jetzt genügt der Compose-/CI-Service. In-Memory-Mock der
  Prisma-Schicht (verfehlt Constraint-Semantik) — verworfen.

## 13. Web-Anbindung (Client)

- **Decision**: Dünner typed Fetch-Client (`src/api/client.ts`, `credentials:'include'`) +
  `useIdentity`-Hook (lädt `GET /me` beim Start → Session-Restore). Spielende meldet via
  `POST /me/match-results` **nur wenn eingeloggt**; Gäste melden nicht. Die stabile `resultId`
  entsteht im reinen Session-Controller (injizierte ID-Factory), sodass „bei Spielende genau eine
  Meldung mit stabiler ID" ohne Netzwerk testbar ist.
- **Rationale**: Hält die Regel-/Orchestrierungslogik framework-unabhängig und testbar (002-Muster)
  und das Netzwerk dünn; erfüllt FR-014 (Gäste ohne Persistenz) am Client mit.
- **Alternatives**: Datenabruf direkt in Komponenten (schwer testbar, verteilt) — verworfen.

## Zusammenfassung der Festlegungen

| Thema | Entscheidung |
|-------|--------------|
| Backend | NestJS 10 (Express), TS strict |
| Passwort | argon2id (reine `password.ts`), bcrypt-Fallback |
| Eingeloggt-Session | opake DB-Session, Token-Hash gespeichert, HttpOnly-Cookie, rollierend ~30 Tage |
| Gast | stateless signiertes Kurzzeit-Token, kein DB-Eintrag |
| Identität/Gating | `IdentityGuard` + `LoggedInGuard`, reine `identity.ts` |
| ORM | Prisma 5 + Migrationen |
| Idempotenz | `MatchResult`-Dedup-Ledger, `@@unique([userId,resultId])`, Tx |
| Stats | `wins`/`losses` gespeichert; `gamesPlayed`/`winRate` abgeleitet |
| Validierung | class-validator + globale ValidationPipe; einheitlicher 401-Login-Fehler |
| CORS/Cookies | Dev-Same-Origin via Next.js-Rewrite; CORS credentials Fallback |
| Test-Runner | Vitest + unplugin-swc (ein Toolchain); supertest-Integration |
| Test-DB | echte Postgres (Compose/CI-Service); Unit-Logik ohne DB |
| Web | typed Fetch-Client + `useIdentity`; resultId im reinen Controller |
