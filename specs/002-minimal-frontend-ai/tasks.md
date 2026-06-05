# Tasks: Minimal spielbares Frontend gegen die KI

**Feature**: `002-minimal-frontend-ai` | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

**Tests**: Der **Session-Controller** (die einzige nicht-triviale Logik, UI↔Engine-Naht) wird
testgetrieben mit Vitest entwickelt (Verfassung Prinzip II/IV) — Tests vor Implementierung.
Kerninteraktionen werden mit React Testing Library abgesichert. Die Engine wird unverändert
konsumiert (bereits TDD-abgedeckt), nicht erneut getestet.

**Organisation**: Tasks sind nach User Story gruppiert (unabhängig test- und lieferbar).

## Format: `[ID] [P?] [Story?] Beschreibung mit Dateipfad`

- **[P]** = parallelisierbar (andere Datei, keine offene Abhängigkeit).
- **[USx]** = nur in User-Story-Phasen.
- Pfade relativ zum Repo-Root.

## Path Conventions

Neues Workspace-Paket `packages/web` (Next.js App Router) abhängig von `packages/engine`.
UI-Logik in `packages/web/src/session/`, Komponenten in `packages/web/src/components/`,
Tests in `packages/web/tests/{unit,component}`.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Next.js-Paket scaffolden: `packages/web/package.json` (Name `@schiffe/web`, `type: module`, dep `@schiffe/engine: "*"` als Workspace, Scripts `dev`/`build`/`test`/`lint`/`typecheck`), `packages/web/next.config.mjs` (`transpilePackages: ['@schiffe/engine']`), `packages/web/tsconfig.json` (extends `../../tsconfig.base.json`, JSX react-jsx), `packages/web/app/layout.tsx`, `packages/web/app/page.tsx` (Platzhalter, `'use client'`), `packages/web/app/globals.css` (leer/minimal).
- [x] T002 [P] Vitest + React Testing Library einrichten: `packages/web/vitest.config.ts` (environment `jsdom`, include `tests/**/*.test.{ts,tsx}`), Dev-Deps (`vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `@vitejs/plugin-react`) im Root ergänzen, Test-Setup `packages/web/tests/setup.ts` (RTL matchers/cleanup).
- [x] T003 [P] ESLint/Prettier für `packages/web` konfigurieren (`packages/web/eslint.config.js`, Next/React + `@typescript-eslint`, kein `any`; Prettier erbt Root-Konfig) — Verfassung Prinzip IV.
- [x] T004 Workspace-Installation prüfen: `npm install` löst `@schiffe/engine` als Workspace-Dependency auf und `import { defineConfig } from '@schiffe/engine'` ist in `packages/web` typauflösbar.

**Checkpoint**: `npm --workspace packages/web run dev` startet, `typecheck`/`lint` laufen (ohne echte Spiellogik) fehlerfrei.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: Blockiert alle User Stories. Legt Session-Typen, Grundzustand und die App-Shell.

- [x] T005 [P] Session-Typen in `packages/web/src/session/types.ts`: `Difficulty`, `Phase`, `PlacementDraft`, `SessionState`, `DIFFICULTY_TO_LEVEL` (gemäß contracts/session-controller.md). Engine-Typen nur importieren, nicht duplizieren.
- [x] T006 [P] Tests zuerst: Session-Grundgerüst in `packages/web/tests/unit/session-core.test.ts` (`createSession` → Default-Config/`phase='difficulty'`/Seed gehalten; `chooseDifficulty` → `placing`; `restart` → frischer Zustand; `isAiTurn`). Müssen rot sein.
- [x] T007 Session-Grundfunktionen in `packages/web/src/session/controller.ts` implementieren (`createSession`, `chooseDifficulty`, `restart`, `isAiTurn`, View-Helfer `ownView`/`opponentShots` als Stubs), bis T006 grün — FR-009/017, FR-002.
- [x] T008 App-Shell in `packages/web/app/page.tsx` (Client Component) + `layout.tsx`/`globals.css`: rendert je nach `phase` einen Platzhalter; hält den `SessionState` (vorerst statisch) — Grundgerüst für alle Stories.

**Checkpoint**: Session-Grundgerüst getestet & grün; App rendert phasenabhängig.

---

## Phase 3: User Story 1 - Flotte platzieren (Ziehen & Drehen) (Priority: P1) 🎯 MVP

**Goal**: Eigene Flotte per Drag platzieren und per Tipp/Button drehen; ungültige Platzierungen
werden (engine-validiert) abgelehnt/markiert; vollständige gültige Flotte schaltet Start frei.

**Independent Test**: Schiffe lassen sich ziehen/drehen; gültige Platzierungen werden übernommen,
ungültige abgelehnt; „Spiel starten" ist erst bei vollständiger gültiger Flotte aktiv.

### Tests for User Story 1 (TDD — zuerst, müssen FAIL ergeben) ⚠️

- [x] T009 [P] [US1] Controller-Platzierungstests in `packages/web/tests/unit/controller-placement.test.ts` (`placeShip` lehnt out-of-bounds/Überlappung über die Engine ab; `rotateShip` nur wenn im Raster gültig; `removeShip`; `autoPlace` via `generateFleet`; `canStart`/`startGame`-Gating) — FR-005/006/007/008.
- [x] T010 [P] [US1] Komponententests Platzierung in `packages/web/tests/component/placement.test.tsx` (RTL: Ziehen platziert, Dreh-Button toggelt Ausrichtung, ungültige Platzierung wird markiert/abgelehnt, „Start" gesperrt bis vollständig, „zufällig platzieren" füllt gültig) — FR-003/004/005/006/008.

### Implementation for User Story 1

- [x] T011 [US1] Platzierungs-Controller in `packages/web/src/session/controller.ts` (`placeShip`, `rotateShip`, `removeShip`, `autoPlace`, `canStart`, `startGame` — alle via Engine `validatePlacement`/`generateFleet`/`createGame`), bis T009 grün — FR-005–008.
- [x] T012 [P] [US1] `packages/web/src/components/DifficultyPicker.tsx` (Stufenwahl Leicht/Mittel/Schwer) — FR-009.
- [x] T013 [US1] `packages/web/src/components/PlacementBoard.tsx` + `packages/web/src/components/ShipTray.tsx`: Pointer-Events-Drag, Dreh-Button/Tippen, Gültigkeits-Highlight, „zufällig platzieren", bis T010 grün — FR-003/004/005/006/007.
- [x] T014 [US1] Platzierungsphase in `packages/web/app/page.tsx` verdrahten (difficulty → placing → „Spiel starten" aktiviert sich gemäß `canStart`).

**Checkpoint**: US1 eigenständig nutzbar — Stufe wählen, gültige Flotte platzieren, Start freischalten.

---

## Phase 4: User Story 2 - Gegen wählbare KI-Stufe spielen (Priority: P1)

**Goal**: Abwechselnd schießen (Engine-Auswertung, Extrazug bei Treffer), KI antwortet mit kurzer
Verzögerung, Fog of War; jederzeit erkennbar, wer am Zug ist.

**Independent Test**: Mit gültiger Aufstellung + Stufe lässt sich eine Partie spielen; eigene
Schüsse zeigen korrekte Ergebnisse, Zugrecht folgt der Extrazug-Regel, KI zieht sichtbar,
verdeckte Gegnerpositionen bleiben unsichtbar.

### Tests for User Story 2 (TDD — zuerst, müssen FAIL ergeben) ⚠️

- [x] T015 [P] [US2] Controller-Spieltests in `packages/web/tests/unit/controller-play.test.ts` (`playerShoot` akzeptiert gültigen Zug/lehnt bereits-beschossen & nicht-am-Zug ab; Extrazug bleibt/wechselt gemäß Engine; `aiStep` nutzt `selectMove` mit der gemappten Stufe; `ownView`/`opponentShots` enthalten keine verdeckten Gegnerschiffe) — FR-001/002/010/011/012/013.
- [x] T016 [P] [US2] Hook-/Pacing-Test in `packages/web/tests/unit/use-game-session.test.ts` (fake timers: zwischen aufeinanderfolgenden KI-Schüssen liegt eine Verzögerung; KI-Serie wird schrittweise abgespielt) — FR-020.
- [x] T017 [P] [US2] Komponententests Spiel in `packages/web/tests/component/play.test.tsx` (RTL: Klick auf Gegnerzelle zeigt miss/hit/sunk; bereits beschossenes Feld ignoriert; Gegnerschiffe werden nicht gerendert; „am Zug"-Anzeige) — FR-002/010/013/014.

### Implementation for User Story 2

- [x] T018 [US2] Spiel-Controller in `packages/web/src/session/controller.ts` (`playerShoot`, `aiStep`, finalisierte `ownView`/`opponentShots` via `viewFor`), bis T015 grün — FR-010/011/012/013, FR-002.
- [x] T019 [US2] `packages/web/src/hooks/useGameSession.ts`: hält `SessionState`, spielt KI-Schüsse zeitgesteuert ab (~300–500 ms zwischen Schüssen), bis T016 grün — FR-020.
- [x] T020 [P] [US2] `packages/web/src/components/TargetBoard.tsx` (Fog of War, Schuss-Eingabe) + `packages/web/src/components/OwnBoard.tsx` (eigene Schiffe + KI-Treffer) — FR-002/010/012.
- [x] T021 [US2] `packages/web/src/components/StatusBar.tsx` („am Zug") und Spielphase in `packages/web/app/page.tsx` verdrahten (Hook + Boards), bis T017 grün — FR-012/014.

**Checkpoint**: US1+US2 ergeben eine vollständig spielbare Partie gegen die KI.

---

## Phase 5: User Story 3 - Spielende erkennen & neu starten (Priority: P2)

**Goal**: Sieg/Niederlage erkennen und klar anzeigen, weitere Eingaben sperren, Neustart ohne
Seitenreload.

**Independent Test**: Eine zu Ende gespielte Partie zeigt das korrekte Ergebnis, sperrt Eingaben
und erlaubt per „Neues Spiel" eine frische Partie ohne Neuladen.

### Tests for User Story 3 (TDD — zuerst, müssen FAIL ergeben) ⚠️

- [x] T022 [P] [US3] Controller-Endspieltests in `packages/web/tests/unit/controller-endgame.test.ts` (`outcome` = won/lost aus `getWinner`; nach `finished` verändern Schüsse den Zustand nicht; `restart` → `phase='difficulty'`, frischer Draft) — FR-015/016/017.
- [x] T023 [P] [US3] Komponententest Endspiel in `packages/web/tests/component/endgame.test.tsx` (RTL: Ergebnis sichtbar, Board gesperrt, „Neues Spiel" setzt ohne Reload zurück) — FR-015/016/017.

### Implementation for User Story 3

- [x] T024 [US3] Endspiel-Logik im Controller sicherstellen (`outcome` setzen, Eingaben in `finished` blocken; `restart` vollständig), bis T022 grün — FR-015/016/017.
- [x] T025 [US3] Ergebnis-Anzeige + „Neues Spiel" in `packages/web/src/components/StatusBar.tsx` und `packages/web/app/page.tsx`, bis T023 grün — FR-015/016/017.

**Checkpoint**: Vollständige, wiederholbare Spielrunde — Meilenstein-2-UI (minimal) steht.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T026 [P] End-to-End-Smoke (ohne Browser) in `packages/web/tests/unit/full-flow.test.ts`: für **jede der drei Stufen** (leicht/mittel/schwer) ein kompletter Controller-Durchlauf createSession→chooseDifficulty→autoPlace→startGame→Schüsse/aiStep bis `finished` mit gültigem `outcome` (deterministisch via Seed) — SC-003/005.
- [x] T027 [P] Minimales Styling in `packages/web/app/globals.css` (lesbare Rasterzellen: Wasser/Treffer/versenkt/„am Zug"), bewusst schlicht — FR-019.
- [x] T028 [P] „Offline"-Nachweis: Test/Lint-Regel oder dokumentierte Prüfung, dass der Spielablauf keine Netzwerkanfragen (`fetch`/externe Requests) auslöst — FR-018/SC-006.
- [x] T029 `packages/web/README.md` (Start/Test-Befehle, Verweis auf quickstart.md & Engine-SSoT).
- [x] T030 Gesamtdurchlauf grün: `test` + `lint` + `typecheck` + `build` für `packages/web` (CI-Gate) — Verfassung Prinzip IV.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: keine Abhängigkeiten — zuerst.
- **Foundational (Phase 2)**: nach Setup — **BLOCKIERT alle User Stories**.
- **User Stories (Phase 3–5)**: nach Foundational. US2 baut auf US1 (eine gestartete Partie
  braucht eine platzierte Flotte); US3 baut auf US2 (Spielende setzt eine laufende Partie voraus).
  Reihenfolge: US1 → US2 → US3.
- **Polish (Phase 6)**: nach den gewünschten User Stories.

### Story-Abhängigkeiten

- **US1 (P1)**: nur Foundational. Eigenständig lieferbar (MVP-Kandidat: Platzieren + Start).
- **US2 (P1)**: Foundational + nutzt `startGame`/Draft aus US1.
- **US3 (P2)**: Foundational + US2 (Spielzustand & Sieger).

### Innerhalb jeder Story

- Controller-Tests (TDD) zuerst und rot → Controller-Implementierung grün → Komponenten/UI →
  Verdrahtung in `page.tsx`.
- `[P]`-Tests einer Story (Unit + Component) können gemeinsam geschrieben werden (verschiedene Dateien).

---

## Parallel Execution Examples

**Setup**: `T002 , T003` parallel (nach T001).
**Foundational**: `T005 , T006` parallel; danach T007, T008.
**US1 Tests**: `T009 , T010` parallel; UI-Teile `T012` parallel zu T011/T013.
**US2 Tests**: `T015 , T016 , T017` parallel.
**US3 Tests**: `T022 , T023` parallel.
**Polish**: `T026 , T027 , T028` parallel; danach T029, T030.

---

## Implementation Strategy

1. **MVP-Schritt 1**: Phase 1 + 2 + **US1** (T001–T014) → Stufe wählen & gültige Flotte platzieren.
2. **Spielbar**: + **US2** (T015–T021) → vollständige Partie gegen die KI (Kern des Features).
3. **Rund**: + **US3** (T022–T025) → Ergebnis & Neustart.
4. **Härtung**: Phase 6 (T026–T030) → Smoke-Flow, Styling, Offline-Nachweis, CI-Gate grün.

Jede Story endet an einem Checkpoint als unabhängig testbares Inkrement.
