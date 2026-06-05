# Implementation Plan: Spiel-Engine & KI (Meilenstein 1)

**Branch**: `001-engine-ai-core` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-engine-ai-core/spec.md`

## Summary

Eine framework-unabhängige TypeScript-Engine als Single Source of Truth für „Schiffe
versenken": Board-Geometrie, regelkonforme (inkl. konfigurierbarer Berührungsregel)
Schiffsplatzierung samt deterministischem Aufstellungsgenerator, Schussauswertung mit
Extrazug-Regel, Siegerkennung sowie drei KI-Stufen (Zufall, Hunt & Target,
Wahrscheinlichkeitsdichte+Parität). Umsetzung als reines TypeScript-Paket ohne UI-/Netzwerk-/
Persistenz-Abhängigkeiten, mit ausschließlich reinen, deterministischen Funktionen (injizierter
Zufall), getestet mit Vitest und testgetrieben (TDD) entwickelt — damit ein späterer Server
exakt dieselbe Logik autoritativ zur Validierung nutzen kann.

## Technical Context

**Language/Version**: TypeScript 5.x im `strict`-Modus, kompiliert nach ES2022; Ausgabe als
ESM (zusätzlich CJS optional via Build), Typdeklarationen (`.d.ts`) inklusive.

**Primary Dependencies**: Keine Laufzeitabhängigkeiten (Runtime-deps = 0). Dev-Abhängigkeiten:
Vitest (Test), TypeScript (Compiler), ESLint + `@typescript-eslint`, Prettier.

**Storage**: N/A — die Engine ist zustandsfrei gegenüber externer Persistenz; der Spielzustand
wird als explizites, von außen gehaltenes Datenobjekt durch reine Funktionen transformiert.

**Testing**: Vitest (Unit-, Integration- und Contract-/API-Tests). TDD verpflichtend
(Verfassung Prinzip II): zuerst fehlschlagende Tests, dann Implementierung.

**Target Platform**: Plattformunabhängig — lauffähig in Node.js (späterer autoritativer Server)
und im Browser (Client-Vorhersage/Offline-KI). Keine Node- oder DOM-spezifischen APIs.

**Project Type**: Library (geteiltes, framework-unabhängiges TypeScript-Paket; vorbereitet für
ein Monorepo mit späteren Paketen `server`/`client`).

**Performance Goals**: Auf 10×10 sind Platzierungsvalidierung und Schussauswertung praktisch
sofort (< 1 ms). KI-Zugauswahl: Zufall/Hunt&Target < 1 ms; Wahrscheinlichkeitsdichte < 20 ms
pro Zug (vollständige Neuberechnung). Determinismus hat Vorrang vor Mikro-Optimierung.

**Constraints**: Ausschließlich reine, deterministische Funktionen; jeglicher Zufall wird über
eine injizierte RNG-Abstraktion bezogen — kein `Math.random`, kein `Date.now`, kein globaler
Zustand in der Engine. Kein Zugriff auf UI, Netzwerk, Datei-/Datenbanksystem. Tree-shakebar,
seiteneffektfreie Module.

**Scale/Scope**: Ein konfigurierbares Board (Standard 10×10), klassische Flotte (6 Schiffe, 20
Zellen), Zwei-Parteien-Partie. Überschaubarer Umfang (~1.500–2.500 LOC inkl. Tests).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Bewertung gegen `.specify/memory/constitution.md` v1.0.0:

| Prinzip | Status | Begründung |
|---------|--------|------------|
| I. Server-autoritative Spiellogik | ✅ PASS | Die Engine ist reine, autoritative Regel-/Validierungslogik. Sie trifft alle regelrelevanten Entscheidungen selbst und stellt über eine Fog-of-War-Sicht (FR-021) sicher, dass verdeckte Informationen nicht offengelegt werden müssen. Ein späterer Server nutzt sie unverändert autoritativ. Keine Client-Vertrauensannahme. |
| II. Test-First / TDD | ✅ PASS | Vitest; verbindlicher Red-Green-Refactor. Der Tasks-Plan ordnet Tests vor Implementierung an (übersteuert die „tests optional"-Default des Templates für diese Engine). |
| III. Geteilte, framework-unabhängige Engine (SSoT) | ✅ PASS | Reines TS-Paket, 0 Runtime-deps, keine UI-/Node-/DOM-APIs, deterministische reine Funktionen. Eine einzige Regelquelle für Server und Client. |
| IV. Hohe Codequalität | ✅ PASS | `strict` TS, kein `any`, ESLint + Prettier als CI-Gate, vollständig typisierte öffentliche API. |

**Ergebnis**: Alle Gates bestanden. Keine Verstöße → `Complexity Tracking` bleibt leer.

## Project Structure

### Documentation (this feature)

```text
specs/001-engine-ai-core/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── public-api.md     # Öffentliche Engine-API (Contract der Library)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Monorepo-Layout, das die Verfassungs-Schichtung (`engine` ← `server`/`client`) vorbereitet.
Meilenstein 1 erstellt ausschließlich das Paket `packages/engine`.

```text
packages/
└── engine/
    ├── src/
    │   ├── types.ts          # Domänentypen (Coord, Orientation, ShotResult, GameState, …)
    │   ├── config.ts         # GameConfig, Flotten-Konfiguration, Defaults (10×10, klassische Flotte)
    │   ├── rng.ts            # Injizierbare deterministische RNG-Abstraktion (+ Seed-Impl)
    │   ├── coords.ts         # Board-Geometrie: In-Bounds, Nachbarschaft, Zellen eines Schiffs
    │   ├── placement.ts      # Platzierungs-Validierung inkl. Berührungs-/Abstandsregel
    │   ├── generate.ts       # Deterministischer Aufstellungsgenerator (FR-030)
    │   ├── shot.ts           # Schussauswertung: miss/hit/sunk (FR-013–FR-018, FR-031)
    │   ├── game.ts           # Spielzustand, Zugrecht, Extrazug-Regel, Siegerkennung
    │   ├── view.ts           # Fog-of-War-Sicht je Partei (FR-021)
    │   ├── ai/
    │   │   ├── index.ts      # selectMove(state, level, rng) Dispatcher
    │   │   ├── random.ts     # Stufe „Zufall" (FR-024)
    │   │   ├── hunt-target.ts# Stufe „Hunt & Target" (FR-025)
    │   │   └── density.ts    # Stufe „Wahrscheinlichkeitsdichte + Parität" (FR-026, FR-032/033)
    │   └── index.ts          # Öffentliche API (Barrel)
    ├── tests/
    │   ├── unit/             # placement, shot, coords, rng, ai-Helfer
    │   ├── integration/      # vollständige Partien (US1+US2), KI-Selfplay (US3)
    │   └── contract/         # öffentliche API-Signaturen & -Invarianten
    ├── package.json
    ├── tsconfig.json
    └── vitest.config.ts

package.json                  # Workspace-Root (npm/pnpm workspaces: packages/*)
tsconfig.base.json            # gemeinsame strenge TS-Optionen
```

**Structure Decision**: Library-Paket `packages/engine` in einem Workspace-Monorepo. Die
Verzeichnisse unter `src/` spiegeln die fachlichen Bausteine der Spec (Board, Platzierung,
Schuss, Spiel, KI) und bleiben einzeln test- und tree-shakebar. Tests liegen in `tests/` nach
Vitest-Konvention, getrennt nach unit/integration/contract — passend zu den User Stories
(US1 Platzierung, US2 Spielschleife, US3 KI). Die Monorepo-Wurzel hält nur Workspace-Config;
spätere Pakete `server`/`client` hängen von `engine` ab, niemals umgekehrt.

## Complexity Tracking

> Keine Verfassungsverstöße — dieser Abschnitt bleibt leer.
