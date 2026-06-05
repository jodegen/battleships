---

description: "Task list for Identität und Persistenz (003)"
---

# Tasks: Identität und Persistenz

**Input**: Design documents from `/specs/003-identity-persistence/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (rest-api.md, identity-session.md), quickstart.md

**Tests**: INCLUDED. Vom Nutzer ausdrücklich verlangt („Tests für Auth-Logik und Stats-Schreibpfad")
und durch Verfassung Prinzip II/IV gestützt. Reine Domänenlogik (`password.ts`, `win-rate.ts`,
`identity.ts`, `guest-token.service`) wird **testgetrieben** entwickelt: Tests zuerst, müssen
fehlschlagen, dann Implementierung. Endpunkte/DB-Naht werden per supertest + Test-Postgres geprüft.

**Organization**: Nach User Story gruppiert. Backend = `packages/server`, Frontend = `packages/web`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelisierbar (andere Datei, keine offene Abhängigkeit)
- **[Story]**: US1–US4 (Setup/Foundational/Polish ohne Story-Label)

## Path Conventions

- Backend: `packages/server/src/...`, Tests `packages/server/test/{unit,integration}/...`
- Frontend: `packages/web/src/...`, Tests `packages/web/tests/...`
- Infra: Repo-Root (`docker-compose.yml`, `.github/workflows/ci.yml`, `package.json`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Workspace-Paket `packages/server` und Toolchain initialisieren

- [X] T001 Workspace-Paket-Gerüst anlegen: `packages/server/package.json` (name `@schiffe/server`, scripts dev/build/start/test/lint/typecheck + `prisma:migrate`/`prisma:generate`), `packages/server/tsconfig.json` (extends `../../tsconfig.base.json`, strict), `packages/server/tsconfig.build.json`, `packages/server/nest-cli.json`
- [X] T002 Server-Abhängigkeiten ergänzen (NestJS 10, `@prisma/client`, `prisma`, `argon2`, `class-validator`, `class-transformer`, `cookie-parser`, JWT/HMAC-lib) und Workspace via `npm install` verknüpfen
- [X] T003 [P] Vitest für Server konfigurieren: `packages/server/vitest.config.ts` mit `unplugin-swc` + `packages/server/test/setup.ts` (Import `reflect-metadata`), getrennte `unit`/`integration`-Projekte (research.md §11/§12)
- [X] T004 [P] `packages/server/eslint.config.js` analog zu `engine`/`web` (strict, kein `any`)
- [X] T005 [P] `docker-compose.yml` im Repo-Root: Dienst `postgres` (User/DB `schiffe`, Port 5432, benanntes Volume) + `packages/server/.env.example` (DATABASE_URL, COOKIE_SECRET, GUEST_TOKEN_SECRET, PORT, WEB_ORIGIN)
- [X] T006 [P] Root-`package.json`-Aggregatskripte erweitern: `test`/`lint`/`typecheck`/`build` schließen `packages/server` (und `packages/web`) ein

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Geteilte Infrastruktur, die ALLE Stories benötigen (DB, App-Bootstrap, Identitäts-Kontrakt)

**⚠️ CRITICAL**: Kein Story-Code vor Abschluss dieser Phase

- [X] T007 Prisma-Schema `packages/server/prisma/schema.prisma` mit `User`, `Session`, `Stat`, `MatchResult` + `enum Outcome { WIN LOSS }` und `@@unique([userId, resultId])` (data-model.md)
- [X] T008 Initiale Migration erzeugen und Client generieren (`prisma migrate dev`, `prisma generate`) → `packages/server/prisma/migrations/` (hängt von T007)
- [X] T009 [P] `PrismaModule` + `PrismaService` mit Lebenszyklus (`onModuleInit`/`onModuleDestroy`) in `packages/server/src/prisma/`
- [X] T010 [P] Konfig-Zugriff (Env: DATABASE_URL, COOKIE_SECRET, GUEST_TOKEN_SECRET, PORT, WEB_ORIGIN) in `packages/server/src/config/`
- [X] T011 NestJS-Bootstrap `packages/server/src/main.ts` + `app.module.ts`: `cookie-parser`, CORS (`credentials:true`, origin=WEB_ORIGIN), globale `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`)
- [X] T012 [P] [TDD] Unit-Tests für `identity.ts` (diskriminierte Union user|guest|anonymous, `isLoggedIn`/`isGuest`/`requireLoggedIn`) in `packages/server/test/unit/identity.test.ts` — müssen zuerst fehlschlagen
- [X] T013 Reine `identity.ts` (Typen + Capability-Helfer) in `packages/server/src/auth/identity.ts` umsetzen → T012 grün (hängt von T012)
- [X] T014 [P] `LoggedInGuard` in `packages/server/src/auth/guards/logged-in.guard.ts` (liest `request.identity`: user→pass, guest→403, anon→401) (hängt von T013). Hinweis: liest nur den Identity-Kontrakt; **zur Laufzeit** funktionsfähig erst, sobald der `IdentityGuard` (T021) `request.identity` befüllt — daher greifen geschützte Routen frühestens ab US1.

**Checkpoint**: DB, App-Shell und Identitäts-/Capability-Kontrakt stehen — Stories können beginnen

---

## Phase 3: User Story 1 - Registrieren, anmelden, Profil haben (Priority: P1) 🎯 MVP

**Goal**: Konto (E-Mail+Passwort) erstellen, anmelden, dauerhafte Session, Profil mit Anzeigenamen;
Logout. Fundament für alle Persistenz.

**Independent Test**: Registrieren → abmelden → mit denselben Daten anmelden; nach Reload weiter
angemeldet; Profil zeigt Anzeigenamen. (Spec US1, contracts/rest-api.md `/auth/*`, `/me`, `/me/profile`)

### Tests for User Story 1 ⚠️ (zuerst schreiben, müssen fehlschlagen)

- [X] T015 [P] [US1] [TDD] Unit-Tests `password.ts` (hash ≠ Klartext; `verify` true/false; zwei Hashes desselben Passworts unterscheiden sich) in `packages/server/test/unit/password.test.ts`
- [X] T016 [P] [US1] Integrationstests Auth-Flow (register 201+`sid`-Cookie; doppelte E-Mail 409; login 200; falsches Passwort 401 einheitlich; logout 204+Cookie gelöscht; `GET /me` Restore via Cookie; `GET /me/profile` 200) in `packages/server/test/integration/auth.test.ts`
- [X] T017 [P] [US1] Web-Komponententest: Login/Register/Logout + Session-Restore über gemockten API-Client in `packages/web/tests/component/auth-panel.test.tsx`

### Implementation for User Story 1

- [X] T018 [US1] `password.ts` (argon2id hash/verify, OWASP-Parameter als Konstanten) in `packages/server/src/auth/password.ts` → T015 grün
- [X] T019 [P] [US1] DTOs `register.dto.ts` (email `@IsEmail`, password `@MinLength(8)` ohne Kompositionspflicht, displayName 3–20) und `login.dto.ts` in `packages/server/src/auth/dto/`
- [X] T020 [US1] `session.service.ts` (Token erzeugen ≥256bit, Hash speichern, validate, rollierend ~30 Tage verlängern, revoke) in `packages/server/src/auth/session.service.ts`
- [X] T021 [US1] `IdentityGuard` in `packages/server/src/auth/guards/identity.guard.ts`: löst `sid`→`{kind:'user'}` via `session.service`, sonst `{kind:'anonymous'}`; setzt `request.identity` (Gast folgt in US3)
- [X] T022 [US1] `users.service.ts`: `createUser`+`Stat` in einer Transaktion, `findByEmail` (lowercased) in `packages/server/src/users/users.service.ts`
- [X] T023 [US1] `auth.service.ts`: Register (Hash, E-Mail-Uniqueness→409) und Login (verify, einheitlicher 401, Session anlegen) in `packages/server/src/auth/auth.service.ts`
- [X] T024 [US1] `auth.controller.ts` + `auth.module.ts`: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` (setzt/löscht `sid`-Cookie HttpOnly/SameSite/Secure)
- [X] T025 [US1] `users.controller.ts` + `users.module.ts`: `GET /me` (Identity) und `GET /me/profile` (LoggedInGuard) mit Mapper, der `passwordHash`/interne IDs ausschließt; `ProfileView`/`StatsView`-Shapes in `packages/server/src/users/`
- [X] T026 [P] [US1] Typed API-Client (Basis-Fetch `credentials:'include'`, Fehler-Mapping) in `packages/web/src/api/client.ts`
- [X] T027 [US1] `next.config.mjs`-Rewrite-Proxy `/api/:path* → http://localhost:<PORT>/:path*` für Same-Origin-Cookies in `packages/web/next.config.mjs`
- [X] T028 [US1] `useIdentity`-Hook (`GET /me` beim Start, `register`/`login`/`logout`) in `packages/web/src/auth/useIdentity.ts`
- [X] T029 [US1] `AuthPanel`-Komponente (minimal: Login/Register/Logout) in `packages/web/src/components/AuthPanel.tsx` und Einbindung in `packages/web/app/page.tsx`

**Checkpoint**: US1 eigenständig funktionsfähig — registrieren/anmelden/Profil/Session/Logout (MVP)

---

## Phase 4: User Story 2 - Statistiken aus KI-Partien sehen (Priority: P1)

**Goal**: Nach beendeter KI-Partie wird das Ergebnis idempotent in die aggregierte Statistik
geschrieben und im Profil angezeigt (gamesPlayed/wins/losses/winRate).

**Independent Test**: Eingeloggt eine KI-Partie zu Ende spielen → genau +1 Partie und +1 Sieg/
Niederlage, winRate konsistent; Wiederholung derselben `resultId` zählt nicht doppelt; Werte
bleiben über Anmeldungen erhalten. (Spec US2, contracts/rest-api.md `POST /me/match-results`,
`GET /me/stats`)

### Tests for User Story 2 ⚠️ (zuerst schreiben, müssen fehlschlagen)

- [X] T030 [P] [US2] [TDD] Unit-Tests `win-rate.ts` (0 Partien → 0, keine Division durch null; `gamesPlayed=wins+losses`; Quote korrekt) in `packages/server/test/unit/win-rate.test.ts`
- [X] T031 [P] [US2] Integrationstests Stats-Schreibpfad (Sieg→`wins`+1; Niederlage→`losses`+1; gleiche `resultId` erneut → keine Doppelzählung; `GET /me/stats`; leere Stats `0/0/0/0`; Gast 403; anon 401) in `packages/server/test/integration/stats.test.ts`
- [X] T032 [P] [US2] Web-Unit-Test: reiner Session-Controller erzeugt **eine** stabile `resultId` pro Partie und meldet bei „finished" genau einmal (injizierte ID-Factory, ohne Netz) in `packages/web/tests/unit/match-result-report.test.ts`

### Implementation for User Story 2

- [X] T033 [P] [US2] Reine `win-rate.ts` (`winRate`, `gamesPlayed` abgeleitet) in `packages/server/src/stats/win-rate.ts` → T030 grün
- [X] T034 [P] [US2] DTO `match-result.dto.ts` (`resultId` non-empty UUID, `outcome` `win|loss`) in `packages/server/src/stats/dto/match-result.dto.ts`
- [X] T035 [US2] `stats.service.ts`: `recordResult` idempotent in **einer** Transaktion (`INSERT MatchResult` mit `@@unique`-Konflikt-Abfang → No-Op; sonst `Stat.wins|losses += 1`) + `getStats` (deriving) in `packages/server/src/stats/stats.service.ts`
- [X] T036 [US2] `stats.view.ts`-Mapper (`StatsView` mit abgeleitetem `gamesPlayed`/`winRate`) in `packages/server/src/stats/stats.view.ts` und Wiederverwendung in `GET /me/profile`
- [X] T037 [US2] `stats.controller.ts` + `stats.module.ts`: `GET /me/stats` und `POST /me/match-results` (LoggedInGuard) in `packages/server/src/stats/`
- [X] T038 [US2] Session-Controller um injizierte ID-Factory erweitern: stabile `resultId` pro Partie + „finished"-Outcome in `packages/web/src/session/controller.ts` (+ `types.ts`)
- [X] T039 [US2] Bei Spielende Ergebnis melden, wenn eingeloggt (`POST /me/match-results`), in `packages/web/src/hooks/useGameSession.ts` (Gäste melden nicht)
- [X] T040 [US2] `ProfilePanel` zeigt `gamesPlayed/wins/losses/winRate` in `packages/web/src/components/ProfilePanel.tsx` + Einbindung in `packages/web/app/page.tsx`

**Checkpoint**: US1+US2 funktionieren unabhängig — Persistenz der KI-Statistik sichtbar

---

## Phase 5: User Story 3 - Als Gast spielen ohne Konto (Priority: P2)

**Goal**: Ohne Registrierung mit temporärem Anzeigenamen als Gast spielen; kein DB-Eintrag, keine
Statistik; nach Sitzungsende nicht wiederherstellbar.

**Independent Test**: Als Gast fortfahren (gültiger Name) → spielbar; ungültiger Name 400; `GET /me`
liefert `guest`; Statistik-Endpunkte 403; nach Cookie-Ablauf/Löschung Identität weg. (Spec US3,
contracts/identity-session.md Gast-Token)

### Tests for User Story 3 ⚠️ (zuerst schreiben, müssen fehlschlagen)

- [X] T041 [P] [US3] [TDD] Unit-Tests `guest-token.service` (sign→verify ok; manipuliertes Token ungültig; abgelaufenes Token ungültig; kein DB-Zugriff) in `packages/server/test/unit/guest-token.test.ts`
- [X] T042 [P] [US3] Integrationstests Gast (`POST /auth/guest` 201 + `guest`-Cookie; ungültiger Name 400; `GET /me` → `guest`; `GET /me/stats` 403; `POST /me/match-results` 403) in `packages/server/test/integration/guest.test.ts`

### Implementation for User Story 3

- [X] T043 [US3] `guest-token.service.ts` (stateless signiertes Token `{typ:'guest',displayName,iat,exp}`, verify; **kein** DB-Eintrag) in `packages/server/src/auth/guest-token.service.ts` → T041 grün
- [X] T044 [P] [US3] DTO `guest.dto.ts` (displayName 3–20 + Inhaltsfilter/§10) in `packages/server/src/auth/dto/guest.dto.ts`
- [X] T045 [US3] `IdentityGuard` erweitern: bei fehlendem/ungültigem `sid` gültiges `guest`-Cookie → `{kind:'guest'}` (Vorrang eingeloggt) in `packages/server/src/auth/guards/identity.guard.ts`
- [X] T046 [US3] `POST /auth/guest` (Name validieren, `guest`-Cookie setzen) in `packages/server/src/auth/auth.controller.ts`
- [X] T047 [US3] Gast-Flow im Web: `guest(displayName)` in `packages/web/src/auth/useIdentity.ts` + Gast-Option in `packages/web/src/components/AuthPanel.tsx`
- [X] T048 [P] [US3] Web-Komponententest: als Gast spielen, keine Statistik-Anzeige/-Meldung in `packages/web/tests/component/guest.test.tsx`

**Checkpoint**: US1–US3 funktionieren unabhängig — Gäste spielen ohne Persistenz

---

## Phase 6: User Story 4 - Klare Trennung von eingeloggt und Gast (Priority: P2)

**Goal**: Eindeutige Typ-Bestimmung und durchgängiges Capability-Gating (nur eingeloggt: Profil/
Stats/Ergebnis-Meldung) als Naht für spätere Lobby-Erstellung (M3).

**Independent Test**: Für anon/guest/user liefert das System eindeutig den Typ; eingeloggt-only-
Fähigkeiten sind für Gast (403)/anon (401) gesperrt, für user (200) verfügbar. (Spec US4, FR-003,
contracts/identity-session.md Capability-Gate)

### Tests for User Story 4 ⚠️ (zuerst schreiben, müssen fehlschlagen)

- [X] T049 [P] [US4] Integrationstests Capability-Matrix (anon→401, guest→403, user→200 auf allen eingeloggt-only-Routen; `GET /me` liefert korrekten `kind` je Identität) in `packages/server/test/integration/capability.test.ts`

### Implementation for User Story 4

- [X] T050 [US4] Sicherstellen, dass `LoggedInGuard` an allen eingeloggt-only-Routen hängt (`/me/profile`, `/me/stats`, `POST /me/match-results`) und `GET /me` die diskriminierte `Identity` für user/guest/anon zurückgibt (Controller in `packages/server/src/{users,stats}/`)
- [X] T051 [P] [US4] Capability-Naht dokumentieren (Kommentar/`packages/server/README.md`): spätere Lobby-Erstellung (M3) nutzt denselben `LoggedInGuard` (FR-003)
- [X] T052 [P] [US4] Web: eingeloggt-only-Affordances für Gast/anon ausblenden (z. B. Profil/Statistik) in `packages/web/src/components/AuthPanel.tsx`/`ProfilePanel.tsx`

**Checkpoint**: Alle vier Stories unabhängig funktionsfähig

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Quality-Gate, CI, Doku, Verifikation

- [X] T053 CI-Job `server` in `.github/workflows/ci.yml` ergänzen: `services: postgres`, `prisma migrate deploy`, dann lint·typecheck·test·build (Verfassung Prinzip IV)
- [X] T054 [P] `packages/server/README.md` (Setup, Env, Endpunkte, Test-Strategie)
- [X] T055 [P] Wurzel-/Web-Doku-Hinweis auf neue API + `docker compose` ergänzen
- [X] T056 Quickstart-Smoke-Flow (`specs/003-identity-persistence/quickstart.md`) manuell durchspielen und Abweichungen beheben
- [X] T057 Vollständiges Quality-Gate lokal grün: `npm run lint && npm run typecheck && npm run test && npm run build` (alle Workspaces); kein `any`, keine Lint-Warnungen

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: keine Abhängigkeiten — sofort startbar
- **Foundational (Phase 2)**: nach Setup — **blockiert alle Stories**
- **User Stories (Phase 3–6)**: nach Foundational
  - US1 (P1) ist MVP-Fundament. **US2 hängt fachlich von US1** (braucht eingeloggten Nutzer + Profil/Stat).
  - US3 (Gast) ist weitgehend unabhängig, erweitert nur den `IdentityGuard` aus US1 (T021→T045).
  - US4 formalisiert/verifiziert das Gating; baut auf US1 (Guard) und berührt US2/US3-Routen.
- **Polish (Phase 7)**: nach den gewünschten Stories

### Within Each User Story

- Tests zuerst schreiben und **fehlschlagen** sehen (TDD für reine Logik), dann implementieren
- Reine Logik (`password`/`win-rate`/`identity`/`guest-token`) vor Services
- Services vor Controllern/Endpunkten; Backend-Endpunkt vor zugehöriger Web-Anbindung

### Critical-Path-Hinweise

- T007→T008 (Schema vor Migration) vor jeder DB-nutzenden Aufgabe
- T012→T013→T014 (Identitäts-Kontrakt + LoggedInGuard) vor geschützten Endpunkten
- T021 (IdentityGuard, user) vor T025/T037 (geschützte Routen); T045 erweitert ihn um Gast
- T020 (session.service) vor T024 (Auth-Controller-Cookies)
- T035 (recordResult idempotent) ist der Kern des Stats-Schreibpfads (FR-019)

### Parallel Opportunities

- Setup: T003, T004, T005, T006 parallel (verschiedene Dateien)
- Foundational: T009, T010 parallel; T012 parallel zu T009/T010
- US1-Tests T015/T016/T017 parallel; danach T019 und T026 parallel zur restlichen Backend-Kette
- US2-Tests T030/T031/T032 parallel; T033/T034 parallel
- US3-Tests T041/T042 parallel; T044 parallel
- Nach Foundational können US1 und US3 grundsätzlich parallel von verschiedenen Personen bearbeitet werden (gemeinsame Datei `identity.guard.ts`: T021 vor T045 koordinieren)

---

## Parallel Example: User Story 1

```bash
# Zuerst die US1-Tests gemeinsam schreiben (müssen fehlschlagen):
Task: "Unit-Tests password.ts in packages/server/test/unit/password.test.ts"          # T015
Task: "Integrationstests Auth-Flow in packages/server/test/integration/auth.test.ts"  # T016
Task: "Web-Komponententest AuthPanel in packages/web/tests/component/auth-panel.test.tsx" # T017

# Dann parallelisierbare Implementierungsbausteine:
Task: "DTOs register/login in packages/server/src/auth/dto/"                           # T019
Task: "API-Client in packages/web/src/api/client.ts"                                   # T026
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 (Setup) → Phase 2 (Foundational) abschließen
2. Phase 3 (US1) umsetzen
3. **STOP & VALIDATE**: Registrieren/Login/Profil/Session/Logout unabhängig testen (T015–T017 grün)
4. Demo-fähig: Identität + Session stehen

### Incremental Delivery

1. Setup + Foundational → Fundament
2. + US1 → Test → Demo (**MVP**: Identität & Session)
3. + US2 → Test → Demo (Statistik-Persistenz — der namensgebende Mehrwert)
4. + US3 → Test → Demo (Gast-Zugang, niedrige Einstiegshürde)
5. + US4 → Test → Demo (sauberes Gating als M3-Naht)
6. Phase 7 → CI/Doku/Quality-Gate

### Notes

- [P] = andere Datei, keine offene Abhängigkeit
- TDD: reine Domänenlogik erst rot, dann grün (Verfassung Prinzip II/IV)
- Engine bleibt unverändert; der Server trifft **keine** Spielregelentscheidung (winRate = Statistik)
- Nach jeder Aufgabe/Logikgruppe committen; an Checkpoints Story isoliert verifizieren
