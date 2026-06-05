# Implementation Plan: Identität und Persistenz

**Branch**: `003-identity-persistence` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-identity-persistence/spec.md`

## Summary

Meilenstein 2 führt **Identität** und **dauerhafte Persistenz** ein. Ein neues
Workspace-Paket `packages/server` (NestJS + TypeScript) stellt eine REST-API bereit:
Registrierung/Login/Logout mit E-Mail + Passwort (Passwort gehasht), ein dauerhaftes,
serverseitiges **Session**-Modell über HTTP-only-Cookies (rollierend ~30 Tage), sowie
**Gast**-Identitäten als kurzlebiges, signiertes Session-Token **ohne** DB-Eintrag. Persistenz
liegt in PostgreSQL via Prisma (`User`, `Session`, `Stat`, plus ein minimales `MatchResult`-
Dedup-Ledger). Nach einer beendeten KI-Partie meldet das `packages/web`-Frontend das Ergebnis an
`POST /me/match-results`; der Server schreibt **idempotent** die aggregierte Statistik fort
(gamesPlayed/wins/losses, winRate abgeleitet). Das Frontend konsumiert die API mit
`credentials: 'include'`; in der lokalen Entwicklung sorgt ein Next.js-Rewrite-Proxy für
Same-Origin-Cookies. Postgres läuft lokal über Docker Compose. Die nicht-triviale Logik
(Passwort-Hashing-Wrapper, winRate, Identitäts-Auflösung, idempotenter Stats-Schreibpfad) wird
testgetrieben (Vitest) entwickelt; Endpunkte werden per supertest-Integrationstests gegen eine
echte Test-Postgres abgesichert.

## Technical Context

**Language/Version**: TypeScript 5.x (`strict`, kein `any`) über alle Pakete. Node 20 (CI).

**Primary Dependencies**:
- Server: NestJS 10 (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`), Prisma 5
  (`@prisma/client`, `prisma` CLI), `argon2` (Passwort-Hashing), `cookie-parser`,
  `class-validator` + `class-transformer` (DTO-Validierung), eine kleine HMAC/JWT-Bibliothek für
  das stateless Gast-Token (`jsonwebtoken` oder Node `crypto` HMAC).
- Web: bestehendes `packages/web` (Next.js 14, React 18) + dünner typed Fetch-API-Client.
- Geteilt: `@schiffe/engine` als Quelle der Outcome-/Typ-Begriffe (nur Konsum, keine
  Regel-Reimplementierung).

**Storage**: PostgreSQL (lokal via Docker Compose) über Prisma ORM. Modelle: `User`, `Session`,
`Stat`, `MatchResult` (Dedup-Ledger). Gäste erzeugen **keinen** DB-Eintrag.

**Testing**: Vitest (einheitlich mit `engine`/`web`). Unit-Tests (TDD) für reine Domänenlogik
ohne DB (Passwort-Hash/Verify-Wrapper, `winRate`, Identitäts-/Capability-Helfer). Integrations-
Tests via `supertest` gegen die gebootstrappte Nest-App + echte Test-Postgres für Auth-Flows,
den idempotenten Stats-Schreibpfad und das Capability-Gating. NestJS-Decorator-Metadaten unter
Vitest via `unplugin-swc` (siehe research.md).

**Target Platform**: Node-20-Service (NestJS/Express) hinter HTTP; Browser-Client (Next.js). Rein
lokal/Single-Instance in diesem Meilenstein (kein Redis, keine Mehr-Instanz-Skalierung).

**Project Type**: Web (Backend-Service `packages/server` + bestehendes Frontend `packages/web`),
beide im npm-Workspace-Monorepo; Abhängigkeitsrichtung ausschließlich Richtung `@schiffe/engine`.

**Performance Goals**: Interaktive REST-Latenzen unkritisch (lokaler Single-User-Betrieb).
Einzige bewusste „Langsamkeit": Passwort-Hashing mit argon2id ist absichtlich rechenintensiv
(OWASP-Parameter) — kein Performance-Ziel, sondern Sicherheitsmerkmal.

**Constraints**:
- Passwörter nie im Klartext speichern/ausgeben (FR-006, SC-008); Mindestlänge 8, keine
  Kompositionspflicht (FR-023, SC-009).
- Session-Cookie strikt `HttpOnly` (kein JS-Zugriff), `SameSite`, `Secure` in Produktion;
  rollierender Ablauf ~30 Tage (FR-009, SC-010).
- Idempotente Ergebniserfassung über eindeutige Ergebnis-Kennung (FR-019, SC-006).
- Keine vollständigen Match-Datensätze/History/Replays (FR-025).
- Kein PvP/Echtzeit/Lobby-Erstellung (FR-022); Auth-Rate-Limiting/Lockout verschoben (FR-024).

**Scale/Scope**: Eine Handvoll REST-Endpunkte, 4 Prisma-Modelle, 3 fachliche Module
(auth/users/stats) plus Prisma-Modul, ein Identitäts-Guard, ein Capability-Guard, minimale
Web-Auth-UI. Single-User-Lokalbetrieb; spätere PvP-Skalierung ist ausdrücklich nicht Teil dieses
Plans.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Bewertung gegen `.specify/memory/constitution.md` v1.0.0:

| Prinzip | Status | Begründung |
|---------|--------|------------|
| I. Server-autoritative Spiellogik (NON-NEGOTIABLE) | ⚠ PASS mit dokumentierter, eng begrenzter Abweichung | Dieses Feature trifft **keine** Spiel-Regelentscheidungen: Es speichert nur Identität und aggregierte Statistik. Die einzige Berührung mit Prinzip I ist, dass das **Ergebnis** einer **offline** ausgetragenen KI-Partie (M1/002 läuft clientseitig) vom Client **gemeldet** statt serverseitig errechnet wird. Da es im KI-Solo-Modus keinen Gegner gibt, ist dies kein Fairness-/Cheating-Risiko zwischen Spielern; das Restrisiko (Selbstmanipulation eigener KI-Statistik) wird akzeptiert und durch Idempotenz (FR-019) gegen versehentliche Doppelzählung abgesichert. Mit PvP (M3) führt der Server die Partie autoritativ und leitet Ergebnisse selbst ab — dann entfällt jede client-gemeldete Wertung für kompetitive Spiele. Siehe Complexity Tracking. |
| II. Test-First / TDD (Engine) (NON-NEGOTIABLE) | ✅ PASS | Es wird **keine** Engine-Logik geändert. Das TDD-Gebot zielt auf die Engine (unverändert, bereits abgedeckt). Über die Verfassungspflicht hinaus wird die nicht-triviale Server-Domänenlogik (Passwort-Wrapper, `winRate`, Identitäts-/Capability-Helfer, idempotenter Schreibpfad) testgetrieben entwickelt (Red→Green→Refactor), ergänzt um supertest-Integrationstests — entspricht der ausdrücklichen Nutzervorgabe „Tests für Auth-Logik und Stats-Schreibpfad". |
| III. Geteilte, framework-unabhängige Engine (SSoT) | ✅ PASS | Der Server **reimplementiert keine Spielregeln**: `winRate` ist Statistik-Aggregation, kein Spielregel-Begriff. Wo Outcome-Begriffe nötig sind, werden `@schiffe/engine`-Typen konsumiert; die Engine hängt von nichts ab. Abhängigkeitsrichtung bleibt server/web → engine. |
| IV. Hohe Codequalität | ✅ PASS | `strict` TS ohne `any`; ESLint/Prettier wie im Monorepo; ein einziger Test-Runner (Vitest) für alle Pakete; kleine, zweckbenannte Module (auth/users/stats), DTO-Validierung statt Ad-hoc-Prüfungen; neuer CI-Job `server` (Lint·Typecheck·Test·Build + Prisma) erweitert das bestehende Quality-Gate. |

**Ergebnis (vor Phase 0)**: Gates bestanden. Eine eng begrenzte, dokumentierte Abweichung von
Prinzip I (client-gemeldetes KI-Offline-Ergebnis) ist in *Complexity Tracking* begründet; kein
weiterer Verstoß.

**Re-Check nach Phase 1 (Design)**: Unverändert bestanden. Das Design hält die Abhängigkeits-
schichtung ein (web/server → engine), trifft keine Spielregelentscheidung serverseitig, kapselt
testbare Domänenlogik in reine Funktionen und führt keine Match-History ein (FR-025). Die
Prinzip-I-Abweichung bleibt auf den client-gemeldeten KI-Ergebnis-Intake begrenzt und wird mit
M3 (server-autoritatives PvP) aufgelöst.

## Project Structure

### Documentation (this feature)

```text
specs/003-identity-persistence/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — Technologie-/Pattern-Entscheidungen
├── data-model.md        # Phase 1 output — Prisma-Modelle, Invarianten, Ableitungen
├── quickstart.md        # Phase 1 output — Docker-Postgres, Migrate, Server+Web starten, Smoke-Flow
├── contracts/           # Phase 1 output
│   ├── rest-api.md            # REST-Endpunkt-Contracts (Request/Response/Status/Fehler)
│   └── identity-session.md    # Identitäts-Auflösung, Session-Cookie & Gast-Token-Contract
├── checklists/
│   └── requirements.md  # (aus /speckit-specify) Spec-Qualitäts-Checkliste
└── tasks.md             # Phase 2 output (/speckit-tasks — NICHT hier erzeugt)
```

### Source Code (repository root)

Neues Workspace-Paket `packages/server` (NestJS) neben bestehendem `packages/engine` und
`packages/web`. Lokale Postgres via `docker-compose.yml` im Repo-Root.

```text
docker-compose.yml                    # NEU: lokaler Postgres-Dienst (Port 5432, Volume)

packages/
├── engine/                           # bestehend (M1) — unverändert konsumiert
├── web/                              # bestehend (002) — erweitert um Auth-UI + API-Client
│   ├── app/
│   │   └── page.tsx                  # integriert AuthPanel/ProfilePanel; meldet KI-Ergebnis
│   ├── src/
│   │   ├── api/client.ts             # NEU: typed Fetch-Wrapper (credentials:'include')
│   │   ├── auth/useIdentity.ts       # NEU: Hook — /me laden, register/login/logout/guest
│   │   ├── session/                  # bestehend: Spiel-Controller (rein) — liefert stabile
│   │   │                             #   resultId + „finished"-Outcome (testbar, ohne Netz)
│   │   └── components/
│   │       ├── AuthPanel.tsx         # NEU: minimale Login/Register/Gast-Formulare
│   │       └── ProfilePanel.tsx      # NEU: Anzeigename + Statistik
│   ├── next.config.mjs               # + Rewrite-Proxy /api/* → server (Same-Origin-Cookies, dev)
│   └── tests/                        # + Tests: Ergebnis-Meldung bei Spielende, Auth-UI
└── server/                           # NEU
    ├── src/
    │   ├── main.ts                   # bootstrap: cookie-parser, CORS(credentials), ValidationPipe
    │   ├── app.module.ts
    │   ├── prisma/
    │   │   ├── prisma.module.ts
    │   │   └── prisma.service.ts      # PrismaClient-Lebenszyklus (onModuleInit/Destroy)
    │   ├── auth/
    │   │   ├── auth.module.ts
    │   │   ├── auth.controller.ts     # POST /auth/{register,login,logout,guest}
    │   │   ├── auth.service.ts        # Orchestrierung Register/Login
    │   │   ├── password.ts            # REIN: hash/verify (argon2id) — TDD
    │   │   ├── session.service.ts     # DB-Session: issue/validate/rotate(rolling)/revoke
    │   │   ├── guest-token.service.ts # stateless signiertes Gast-Token (kein DB-Eintrag)
    │   │   ├── identity.ts            # REIN: Identity-Typen + Capability-Helfer — TDD
    │   │   ├── guards/identity.guard.ts    # löst user|guest|anon auf → request.identity
    │   │   ├── guards/logged-in.guard.ts   # FR-003 Capability-Gate (nur eingeloggt)
    │   │   └── dto/{register,login,guest}.dto.ts   # class-validator (E-Mail, Passwort≥8, Name)
    │   ├── users/
    │   │   ├── users.module.ts
    │   │   ├── users.service.ts       # createUser+Stat (Transaktion), findByEmail
    │   │   └── users.controller.ts    # GET /me, GET /me/profile
    │   └── stats/
    │       ├── stats.module.ts
    │       ├── stats.service.ts       # recordResult (idempotente Tx), getStats — TDD/Integration
    │       ├── win-rate.ts            # REIN: winRate aus wins/losses — TDD
    │       └── stats.controller.ts    # GET /me/stats, POST /me/match-results
    ├── prisma/
    │   ├── schema.prisma              # User, Session, Stat, MatchResult
    │   └── migrations/                # generiert via prisma migrate
    ├── test/
    │   ├── unit/                      # reine Domänenlogik (kein DB): password, win-rate, identity
    │   └── integration/               # supertest + Test-Postgres: auth-flows, stats-write-path,
    │                                  #   idempotenz, capability-gating, session-restore
    ├── .env.example                   # DATABASE_URL, COOKIE_SECRET, GUEST_TOKEN_SECRET, PORT, WEB_ORIGIN
    ├── nest-cli.json
    ├── package.json                   # scripts: dev/build/start/test/lint/typecheck + prisma:*
    ├── tsconfig.json
    ├── tsconfig.build.json
    ├── vitest.config.ts               # unplugin-swc (Decorator-Metadaten)
    └── eslint.config.js

.github/workflows/ci.yml               # + Job `server` (Postgres-Service, prisma migrate, lint/typecheck/test/build)
package.json (root)                    # + server in test/lint/typecheck/build-Aggregaten
```

**Structure Decision**: Drei-Schichten-Monorepo gemäß Verfassung — `engine` (framework-frei,
unverändert) ← `server` (autoritative Laufzeit für Identität/Persistenz, REST-Transport) und
`web` (UI). Der Server folgt der NestJS-Modulstruktur (auth/users/stats + prisma), kapselt aber
die **nicht-triviale Logik in reine, framework-unabhängige Funktionen** (`password.ts`,
`win-rate.ts`, `identity.ts`, der Kern von `recordResult`), die ohne Nest/DB mit Vitest testbar
sind (Prinzip II/IV-Geist). Endpunkte/DB-Naht werden per supertest-Integrationstests gegen eine
echte Test-Postgres geprüft. Same-Origin-Cookies im Dev über Next.js-Rewrite-Proxy; Postgres
lokal via Docker Compose.

## Complexity Tracking

> Nur die folgende, bewusst eng begrenzte Abweichung muss begründet werden.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Prinzip I**: KI-Partie-Ergebnis wird vom Client gemeldet statt serverseitig errechnet | Die KI-Partie läuft in diesem Meilenstein **offline/clientseitig** (M1-Engine im Browser, 002). Ein serverseitig autoritatives KI-Spiel existiert erst mit der PvP-/Server-Laufzeit (M3). Um Meilenstein 2 (Statistik-Persistenz) ohne Vorziehen der gesamten Server-Spiel-Laufzeit zu liefern, nimmt der Server das Ergebnis als gemeldeten Intent entgegen. | Eine **serverseitig autoritative KI-Partie jetzt** würde das komplette M3-Spiel-Gateway (Spielzustand serverseitig, Transport, KI serverseitig) vorziehen — massiver Mehraufwand, der dem schlanken M2-Ziel widerspricht (YAGNI). Risiko ist auf **Solo-vs-KI** beschränkt (kein Gegner → kein Fairness-Schaden); Idempotenz (FR-019) verhindert versehentliche Doppelzählung. Übergangsplan: Mit M3 leitet der Server Ergebnisse autoritativ ab; client-gemeldete Wertungen entfallen für kompetitive Partien. |

**Entscheidung (2026-06-05, akzeptiert für Meilenstein 2):** Die obige Abweichung von Prinzip I
wird für diesen Meilenstein **ausdrücklich akzeptiert**. Begründung: Die KI-Partie ist die
**offline** laufende M1/002-Engine im Browser; eine serverseitig autoritative Auswertung
existiert erst mit der M3-Laufzeit. Es gibt im Solo-vs-KI-Modus keinen Gegner, daher keinen
Fairness-/Cheating-Schaden zwischen Spielern; das Restrisiko (Selbstmanipulation der eigenen
KI-Statistik) ist akzeptiert und durch Idempotenz (FR-019) gegen versehentliche Doppelzählung
abgesichert. **Bedingung/Resolution**: Mit M3 (server-autoritatives PvP) errechnet der Server
Ergebnisse selbst; client-gemeldete Wertungen entfallen dann für kompetitive Partien. Diese
Entscheidung ist auf M2 begrenzt und bei Bedarf widerrufbar (würde das Vorziehen der
server-autoritativen KI-Laufzeit bedeuten).
