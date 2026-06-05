# Tasks: Spiel-Engine & KI (Meilenstein 1)

**Feature**: `001-engine-ai-core` | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

**Tests**: VERPFLICHTEND. Die Verfassung (Prinzip II, NON-NEGOTIABLE) schreibt TDD für die
Engine vor — jeder Implementierungs-Task wird durch zuvor geschriebene, zunächst fehlschlagende
Tests abgesichert (Red-Green-Refactor). Dies übersteuert die „tests optional"-Default des
Task-Templates.

**Organisation**: Tasks sind nach User Story gruppiert (unabhängig test- und lieferbar).

## Format: `[ID] [P?] [Story?] Beschreibung mit Dateipfad`

- **[P]** = parallelisierbar (andere Datei, keine offene Abhängigkeit).
- **[USx]** = nur in User-Story-Phasen.
- Pfade sind relativ zum Repo-Root.

## Path Conventions

Monorepo mit Library-Paket `packages/engine` (siehe plan.md → Project Structure). Quellcode in
`packages/engine/src/`, Tests in `packages/engine/tests/{unit,integration,contract}`.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Workspace-Root anlegen: `package.json` (npm workspaces `packages/*`, Typ `module`) und `tsconfig.base.json` (strict, target ES2022, module ESNext, `noImplicitAny`, `exactOptionalPropertyTypes`) im Repo-Root.
- [x] T002 Engine-Paket scaffolden: `packages/engine/package.json` (Name `@schiffe/engine`, ESM, `exports`, 0 Runtime-deps, Scripts: `test`, `test:watch`, `lint`, `typecheck`, `build`), `packages/engine/tsconfig.json` (extends base), `packages/engine/vitest.config.ts`.
- [x] T003 [P] ESLint + Prettier konfigurieren in `packages/engine/.eslintrc.cjs` und `.prettierrc` (Verbot von `any`, Regel gegen `Math.random`/`Date.now`-Nutzung in `src/`, import-Restriktionen gegen DOM/Node-spezifische Module) — erfüllt Verfassung Prinzip IV & FR-029.
- [x] T004 [P] Leeres Public-API-Barrel `packages/engine/src/index.ts` anlegen (wird je Story erweitert) und `packages/engine/README.md` mit Verweis auf quickstart.md.

**Checkpoint**: `npm install`, `npm --workspace packages/engine run typecheck` und `lint` laufen (noch ohne Quellcode) fehlerfrei.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: Keine User-Story-Arbeit beginnt, bevor diese Phase abgeschlossen ist. Diese Bausteine (Typen, RNG, Konfiguration, Geometrie) werden von allen Stories genutzt.

- [x] T005 [P] Domänentypen in `packages/engine/src/types.ts`: `Coord`, `Orientation`, `PlayerId`, `ShotOutcome`, `ShotResult`, `ShotRejection`, `GameStatus`, `AiLevel`, `AiDecision`, `PlacementError`, `PlacementResult` (gemäß data-model.md). Reine Typdeklarationen, keine Logik.
- [x] T006 [P] Tests zuerst: RNG-Determinismus in `packages/engine/tests/unit/rng.test.ts` (gleicher Seed → gleiche Folge; `nextInt(n)` im Bereich; Reinheit). Müssen rot sein.
- [x] T007 RNG-Implementierung in `packages/engine/src/rng.ts` (`createRng(seed)`, mulberry32; `next()`, `nextInt(maxExclusive)`, `pick`) bis T006 grün ist — FR-028.
- [x] T008 [P] Tests zuerst: Konfiguration in `packages/engine/tests/unit/config.test.ts` (`DEFAULT_CONFIG` = 10×10/klassische Flotte/touching+extraTurn; `defineConfig` füllt Defaults & validiert). Rot.
- [x] T009 Konfiguration in `packages/engine/src/config.ts` (`DEFAULT_CONFIG`, `defineConfig`, Flotten-Default) bis T008 grün — FR-001/002/003.
- [x] T010 [P] Tests zuerst: Geometrie in `packages/engine/tests/unit/coords.test.ts` (In-Bounds, Zellen eines Schiffs aus origin/orientation/length, 8er-Nachbarschaft inkl. Randfälle). Rot.
- [x] T011 Geometrie in `packages/engine/src/coords.ts` (`inBounds`, `shipCells`, `neighbors8`, Coord-Gleichheit/-Key) bis T010 grün — FR-004/005.

**Checkpoint**: Foundation getestet & grün; Typen/RNG/Config/Geometrie stehen allen Stories bereit.

---

## Phase 3: User Story 1 - Gültige Flotte platzieren (Priority: P1) 🎯 MVP

**Goal**: Board + regelkonforme Schiffsplatzierung inkl. konfigurierbarer Berührungsregel sowie deterministischer Aufstellungsgenerator.

**Independent Test**: Gültige Aufstellungen werden akzeptiert, jede Regelverletzung (außerhalb/Überlappung/Flotte/Ausrichtung/Berührung) mit korrektem Grund abgelehnt; der Generator erzeugt reproduzierbar gültige Flotten.

### Tests for User Story 1 (TDD — zuerst schreiben, müssen FAIL ergeben) ⚠️

- [x] T012 [P] [US1] Contract-Test der Platzierungs-API in `packages/engine/tests/contract/placement.contract.test.ts` (Signaturen & Invarianten von `validatePlacement`/`generateFleet` gemäß contracts/public-api.md).
- [x] T013 [P] [US1] Unit-Tests `validatePlacement` Basisregeln in `packages/engine/tests/unit/placement.test.ts` (out-of-bounds, overlap, invalid-orientation, fleet-mismatch, vollständige gültige Flotte) — FR-005–FR-008, FR-011, FR-012.
- [x] T014 [P] [US1] Unit-Tests Berührungsregel in `packages/engine/tests/unit/placement-touching.test.ts` (`allowTouching=true` akzeptiert anliegende Schiffe; `false` lehnt orthogonale **und** diagonale Berührung ab; Randfälle) — FR-009/010.
- [x] T015 [P] [US1] Unit-Tests `generateFleet` in `packages/engine/tests/unit/generate.test.ts` (regelkonform inkl. Berührung; gleicher Seed → gleiche Aufstellung; `'unplaceable'`-Signal) — FR-030, SC-008.

### Implementation for User Story 1

- [x] T016 [US1] `validatePlacement` in `packages/engine/src/placement.ts` implementieren (Bounds/Overlap/Orientation/Fleet/Touch via `coords.neighbors8`), bis T012–T014 grün — FR-005–FR-012.
- [x] T017 [US1] `generateFleet` in `packages/engine/src/generate.ts` (deterministische Platzierung über `rng`, nutzt `validatePlacement`, Backtracking/Abbruch → `'unplaceable'`), bis T015 grün — FR-030.
- [x] T018 [US1] US1-API in `packages/engine/src/index.ts` exportieren (`validatePlacement`, `generateFleet`, `DEFAULT_CONFIG`, `defineConfig`, Typen).

**Checkpoint**: US1 vollständig & unabhängig testbar — Aufstellungen können gültig erzeugt/geprüft werden.

---

## Phase 4: User Story 2 - Schüsse, Extrazug & Sieger (Priority: P2)

**Goal**: Schussauswertung (miss/hit/sunk inkl. Länge), Zugrecht mit Extrazug-Regel, Siegerkennung und faire Sicht (Fog of War). Zusammen mit US1 eine komplett durchspielbare Partie.

**Independent Test**: Aus zwei festen Aufstellungen eine Schussfolge abspielen; korrekte Ergebnisse, korrektes Zugrecht (extra-turn an/aus), Sieger genau beim letzten versenkten Schiff; `viewFor` legt keine verdeckten Positionen offen.

### Tests for User Story 2 (TDD — zuerst schreiben, müssen FAIL ergeben) ⚠️

- [x] T019 [P] [US2] Contract-Test Spiel-API in `packages/engine/tests/contract/game.contract.test.ts` (`createGame`/`applyShot`/`isOver`/`getWinner`/`currentTurn`/`viewFor` gemäß contracts/public-api.md).
- [x] T020 [P] [US2] Unit-Tests Schussauswertung in `packages/engine/tests/unit/shot.test.ts` (miss/hit/sunk; `sunkShip.length` bei sunk) — FR-013, FR-018, FR-031.
- [x] T021 [P] [US2] Unit-Tests Ablehnungen in `packages/engine/tests/unit/shot-rejection.test.ts` (already-shot, out-of-bounds, not-your-turn, game-over; Zustand unverändert) — FR-014/015.
- [x] T022 [P] [US2] Unit-Tests Zugrecht in `packages/engine/tests/unit/turn.test.ts` (extra-turn an: bleibt bei hit/sunk, wechselt bei miss; extra-turn aus: wechselt immer) — FR-016/017.
- [x] T023 [P] [US2] Unit-Tests Sieg & Immutabilität in `packages/engine/tests/unit/game.test.ts` (Sieger genau bei letzter versenkter Zelle; Eingabe-State unverändert) — FR-019/020, FR-028.
- [x] T024 [P] [US2] Unit-Tests Fog of War in `packages/engine/tests/unit/view.test.ts` (`viewFor` zeigt eigene Schiffe + eigene Schussergebnisse, niemals verdeckte Gegnerpositionen) — FR-021.
- [x] T025 [P] [US2] Integrationstest komplette Partie in `packages/engine/tests/integration/full-game.test.ts` (zwei feste Flotten, Schussfolge bis Sieg, deterministisch).

### Implementation for User Story 2

- [x] T026 [US2] Schussauswertung in `packages/engine/src/shot.ts` (Treffer/Versenkt-Erkennung über Schiffszellen, `sunkShip.length`), bis T020/T021 grün — FR-013/014/015/018/031.
- [x] T027 [US2] Spielzustand in `packages/engine/src/game.ts` (`createGame`, `applyShot` mit Zugrecht/Extrazug/Status, `isOver`, `getWinner`, `currentTurn`; unveränderlich), bis T019/T022/T023/T025 grün — FR-016/017/019/020.
- [x] T028 [US2] Sicht in `packages/engine/src/view.ts` (`viewFor`), bis T024 grün — FR-021.
- [x] T029 [US2] US2-API in `packages/engine/src/index.ts` exportieren (`createGame`, `applyShot`, `isOver`, `getWinner`, `currentTurn`, `viewFor`).

**Checkpoint**: US1+US2 ergeben eine vollständige, von Anfang bis Ende durchspielbare Partie (SC-001).

---

## Phase 5: User Story 3 - KI in drei Stufen (Priority: P3)

**Goal**: `selectMove` liefert zulässige Züge in den Stufen Zufall, Hunt & Target und Wahrscheinlichkeitsdichte (+Parität), deterministisch und über `viewFor` blickdicht.

**Independent Test**: Für gegebene Spielzustände wählt jede Stufe einen zulässigen Zug mit stufentypischem Verhalten; bei identischem Zufallsstrom reproduzierbar; Selfplay zeigt die Stärkeordnung density < hunt-target < random (Schussanzahl).

### Tests for User Story 3 (TDD — zuerst schreiben, müssen FAIL ergeben) ⚠️

- [x] T030 [P] [US3] Unit-Tests Stufe Zufall in `packages/engine/tests/unit/ai-random.test.ts` (nur unbeschossene In-Bounds-Felder; kein Nachsetzen nach Treffer) — FR-023/024.
- [x] T031 [P] [US3] Unit-Tests Stufe Hunt & Target in `packages/engine/tests/unit/ai-hunt-target.test.ts` (Target auf orthogonale Nachbarn offener Treffer; Achsenverfolgung bei ≥2 Treffern; Hunt ohne offene Treffer; berührungsregel-agnostisch) — FR-025.
- [x] T032 [P] [US3] Unit-Tests Stufe Dichte in `packages/engine/tests/unit/ai-density.test.ts` (höchste Platzierungsdichte konsistent mit Treffern; versenkte Schiffe via Länge entfernt; bei `allowTouching=false` angrenzende Platzierungen ausgeschlossen; Parität im Suchmodus; `noMove` wenn nichts übrig) — FR-026/027/032/033.
- [x] T033 [P] [US3] Unit-Tests Determinismus & Erschöpfung in `packages/engine/tests/unit/ai-determinism.test.ts` (alle Stufen: gleicher State+RNG → gleicher Zug; vollständig beschossenes Brett → alle Stufen liefern `{noMove:true}`) — SC-007, FR-027.
- [x] T034 [P] [US3] Integrationstest Selfplay-Stärke in `packages/engine/tests/integration/ai-selfplay.test.ts` (≥100 Partien über feste Seed-Liste, reproduzierbar; Ø-Schüsse: density ≤ hunt-target − 10 % und hunt-target ≤ random − 10 %) — SC-006.

### Implementation for User Story 3

- [x] T035 [P] [US3] Stufe Zufall in `packages/engine/src/ai/random.ts`, bis T030 grün — FR-024.
- [x] T036 [P] [US3] Stufe Hunt & Target in `packages/engine/src/ai/hunt-target.ts`, bis T031 grün — FR-025.
- [x] T037 [US3] Stufe Dichte in `packages/engine/src/ai/density.ts` (Platzierungs-Enumeration je lebendem Schiff, Konsistenz mit Beobachtungen, Berührungs-Pruning, Parität), bis T032 grün — FR-026/032/033.
- [x] T038 [US3] Dispatcher `selectMove` in `packages/engine/src/ai/index.ts` (sieht nur `viewFor`-Perspektive; `noMove`-Fall), bis T033/T034 grün — FR-022/023/027.
- [x] T039 [US3] US3-API in `packages/engine/src/index.ts` exportieren (`selectMove`, `AiLevel`).

**Checkpoint**: Alle drei User Stories vollständig — komplettes Einzelspieler-Erlebnis aus Meilenstein 1.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T040 [P] Coverage-Schwelle in `packages/engine/vitest.config.ts` setzen und Test ergänzen/aktivieren, der die Abwesenheit von `Math.random`/`Date.now`/globalem Zustand in `src/` prüft — FR-028.
- [x] T041 [P] Quickstart-Beispiel aus `quickstart.md` als ausführbaren Smoke-Test in `packages/engine/tests/integration/quickstart.test.ts` spiegeln (vollständige KI-Partie, deterministisch).
- [x] T042 [P] `packages/engine/README.md` finalisieren (öffentliche API-Übersicht, Verweis auf contracts/public-api.md).
- [x] T043 Build verifizieren: `npm --workspace packages/engine run build` erzeugt `dist/` inkl. `.d.ts`; ESM-Import des Builds in einem Smoke-Check.
- [x] T044 Gesamtdurchlauf grün: `test` + `lint` + `typecheck` für `packages/engine` (CI-Gate, Verfassung Prinzip IV).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: keine Abhängigkeiten — startet sofort.
- **Foundational (Phase 2)**: nach Setup — **BLOCKIERT alle User Stories**.
- **User Stories (Phase 3–5)**: alle nach Foundational. US2 baut praktisch auf US1 (Boards aus Aufstellungen), US3 auf US2 (Spielzustand/Sicht). Priorisierte Reihenfolge: US1 → US2 → US3.
- **Polish (Phase 6)**: nach allen gewünschten User Stories.

### Story-Abhängigkeiten

- **US1 (P1)**: nur Foundational. Eigenständig lieferbar (MVP).
- **US2 (P2)**: Foundational; nutzt Boards/Flotten aus US1-Strukturen (Typen geteilt). Eigenständig testbar mit festen Aufstellungen.
- **US3 (P3)**: Foundational + US2 (KI braucht Spielzustand & `viewFor`). Dichte-Stufe nutzt zusätzlich die Platzierungs-Enumeration aus US1.

### Innerhalb jeder Story

- Tests (TDD) zuerst und müssen fehlschlagen → dann Implementierung bis grün → dann API-Export.
- `[P]`-Tests einer Story können gemeinsam geschrieben werden (verschiedene Dateien).

---

## Parallel Execution Examples

**Phase 2 (Foundational)** — Tests parallel schreiben:
```
T006 (rng.test.ts) , T008 (config.test.ts) , T010 (coords.test.ts)   # alle [P]
```
**US1** — Tests parallel:
```
T012 , T013 , T014 , T015                                            # alle [P], verschiedene Dateien
```
**US2** — Tests parallel:
```
T019 , T020 , T021 , T022 , T023 , T024 , T025                       # alle [P]
```
**US3** — Tests parallel, danach Stufen-Impl teils parallel:
```
T030 , T031 , T032 , T033 , T034   →   dann T035 , T036 [P] (T037 nach Bedarf)
```

---

## Implementation Strategy

1. **MVP zuerst**: Phase 1 + 2 + **US1** (T001–T018). Liefert geprüfte, generierbare Aufstellungen.
2. **Spielbarer Kern**: + **US2** (T019–T029) → vollständige Partie mit festen/generierten Flotten (SC-001).
3. **Einzelspieler komplett**: + **US3** (T030–T039) → drei KI-Stufen.
4. **Härtung**: Phase 6 (T040–T044) → Determinismus-Guard, Build, CI-Gate grün.

Jede Story endet an einem Checkpoint als unabhängig testbares Inkrement.
