# @schiffe/server

Identitäts- & Persistenz-API (Meilenstein 2) für „Schiffe versenken" — NestJS + TypeScript +
Prisma/PostgreSQL. Stellt Registrierung/Login/Logout (E-Mail + Passwort, argon2id), eine
dauerhafte HTTP-only-Session, Gast-Identitäten (stateless, ohne DB-Eintrag) und das aggregierte
Statistik-Tracking für beendete KI-Partien bereit.

Spec: [`specs/003-identity-persistence`](../../specs/003-identity-persistence/).
Die Spielregeln liegen unverändert in [`@schiffe/engine`](../engine); der Server trifft **keine**
Spielregelentscheidung (winRate ist Statistik, kein Spielregel-Begriff).

## Lokal starten

```bash
# 1) Postgres (Repo-Root)
docker compose up -d

# 2) Env
cp packages/server/.env.example packages/server/.env   # Werte setzen

# 3) Migrationen anwenden + Prisma-Client erzeugen
npm run -w @schiffe/server prisma:deploy
npm run -w @schiffe/server prisma:generate

# 4) Server (Port 3001) und Frontend (Port 3000, proxyt /api/* → :3001)
npm run -w @schiffe/server dev
npm run -w @schiffe/web dev
```

> Migrationen sind committet (`prisma/migrations/`, beginnend mit `…_init`). `prisma:deploy`
> wendet sie an (CI + lokal). Schemaänderungen während der Entwicklung erzeugen eine neue
> Migration via `npm run -w @schiffe/server prisma:migrate -- --name <beschreibung>`.
> (`prisma:push` bleibt für schnelle, wegwerfbare Experimente erhalten, ist aber nicht der
> reguläre Weg.)

## Umgebungsvariablen

| Variable | Zweck |
|----------|-------|
| `DATABASE_URL` | PostgreSQL-Verbindung (Prisma) |
| `COOKIE_SECRET` | Signatur für `cookie-parser` |
| `GUEST_TOKEN_SECRET` | HMAC-Schlüssel des Gast-Tokens |
| `PORT` | HTTP-Port (Default 3001) |
| `WEB_ORIGIN` | CORS-Origin des Frontends (Default `http://localhost:3000`) |
| `COOKIE_SECURE` | `true` in Produktion (HTTPS) |

## Endpunkte (Kurzreferenz)

Vollständiger Contract: [`contracts/rest-api.md`](../../specs/003-identity-persistence/contracts/rest-api.md).

| Methode | Pfad | Auth | Zweck |
|---------|------|------|-------|
| POST | `/auth/register` | – | Konto anlegen (201), `sid`-Cookie |
| POST | `/auth/login` | – | Anmelden (200), `sid`-Cookie |
| POST | `/auth/logout` | – | Session beenden (204) |
| POST | `/auth/guest` | – | Gast-Identität (201), `guest`-Cookie, kein DB-Eintrag |
| GET | `/me` | optional | aktuelle Identität (`user`/`guest`/`anonymous`) |
| GET | `/me/profile` | **eingeloggt** | Anzeigename + Statistik |
| GET | `/me/stats` | **eingeloggt** | Statistik |
| POST | `/me/match-results` | **eingeloggt** | idempotente Ergebniserfassung |

## Tests

```bash
npm run -w @schiffe/server test       # Unit (immer) + Integration (nur mit DATABASE_URL)
```

- **Unit** (`test/unit`): reine Domänenlogik ohne DB — `password` (argon2id), `win-rate`,
  `identity`, `guest-token`.
- **Integration** (`test/integration`): supertest gegen die gebootstrappte Nest-App + echte
  Postgres. Ohne erreichbare DB (`DATABASE_URL` nicht gesetzt) werden sie automatisch
  übersprungen; CI stellt einen Postgres-Service bereit.

## Identität & Capability-Gating (FR-003)

`IdentityGuard` (global) bestimmt pro Anfrage die Identität (`user` | `guest` | `anonymous`) und
legt sie als `request.identity` ab. `LoggedInGuard` schützt eingeloggt-only-Routen: `user` →
durchlassen, `guest` → 403, `anonymous` → 401.

**Erweiterungsnaht für M3:** Die spätere **Lobby-Erstellung** („nur eingeloggte Spieler", §3.2 der
Projektspezifikation) hängt am **selben** `LoggedInGuard` — in diesem Meilenstein bewusst nicht
implementiert (FR-022), aber als Capability nachgewiesen (US4) und damit ohne Umbau erweiterbar.

## Hinweis zur Server-Autorität (Prinzip I)

KI-Partien laufen in M1/002 **offline im Client**; ihr Ergebnis wird gemeldet, nicht serverseitig
errechnet. Diese eng begrenzte, dokumentierte Abweichung ist im
[Plan](../../specs/003-identity-persistence/plan.md#complexity-tracking) begründet (Idempotenz als
Schutz gegen Doppelzählung) und wird mit M3 (server-autoritatives PvP) aufgelöst.
