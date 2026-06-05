<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/003-identity-persistence/plan.md`

Active feature: **Identität und Persistenz (003, Meilenstein 2)** — neues Workspace-Paket
`packages/server` (NestJS + TS) mit PostgreSQL via Prisma (`User`, `Session`, `Stat`,
`MatchResult`-Dedup-Ledger). E-Mail/Passwort-Auth (argon2id) mit HTTP-only-DB-Session-Cookie
(rollierend ~30 Tage); Gäste als stateless signiertes Token ohne DB-Eintrag. REST:
register/login/logout/guest, `GET /me`, `/me/profile`, `/me/stats`, `POST /me/match-results`
(idempotent über `resultId`). `packages/web` konsumiert die API (`credentials:'include'`,
Dev-Rewrite-Proxy). Reine Domänenlogik (Passwort, winRate, Identität) testgetrieben mit Vitest;
Endpunkte per supertest + Test-Postgres. Lokale DB via Docker Compose. Engine bleibt SSoT und
unverändert; der Server trifft keine Spielregelentscheidung (winRate ist Statistik).

Vorherige Features: **Minimal spielbares Frontend gegen die KI (002)** — `packages/web`, fertig.
**Spiel-Engine & KI (Meilenstein 1, 001)** — `packages/engine`, fertig.
<!-- SPECKIT END -->
