# Implementation Plan: Minimal spielbares Frontend gegen die KI

**Branch**: `002-minimal-frontend-ai` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-minimal-frontend-ai/spec.md`

## Summary

Ein bewusst schlichtes, vollständig clientseitiges Next.js/React-Frontend, mit dem eine Person
eine komplette Partie „Schiffe versenken" gegen die KI spielt: Flotte per Drag platzieren und
per Tipp/Button drehen, eine von drei KI-Stufen wählen, abwechselnd schießen (Extrazug bei
Treffer, KI-Schüsse mit kurzer Verzögerung), Sieg/Niederlage erkennen und neu starten. **Alle**
spiellogischen Entscheidungen kommen aus dem bestehenden Paket `@schiffe/engine` — das Frontend
bildet keine Regeln nach und legt verdeckte Gegnerpositionen nie offen. Die UI-Orchestrierung
liegt in einem framework-unabhängig testbaren „Session-Controller", der ausschließlich
Engine-Funktionen aufruft; React-Komponenten bleiben dünn.

## Technical Context

**Language/Version**: TypeScript 5.x (`strict`), React 18, Next.js 14 (App Router).

**Primary Dependencies**: `@schiffe/engine` (Workspace-Paket, Single Source of Truth der
Spiellogik); React/Next.js als UI-Shell. Keine Spiellogik-Bibliotheken. Drag/Rotate über native
Pointer-Events (kein DnD-Framework nötig).

**Storage**: Keine. Spielzustand lebt nur im Speicher der laufenden Seite (kein
localStorage/Backend); Reload setzt zurück (FR-018, Annahmen).

**Testing**: Vitest + React Testing Library (jsdom) — Unit-Tests für den reinen
Session-Controller (testgetrieben) und Komponenten-Tests für die Kerninteraktionen. Ein
optionaler Playwright-Smoke-Test ist späteren Meilensteinen vorbehalten.

**Target Platform**: Moderne Browser (Desktop & mobil), rein clientseitig gerendert; Next.js
dient nur als App-Shell (keine API-Routen, kein serverseitiger Spielzustand).

**Project Type**: Web-Frontend (Next.js-App als Workspace-Paket `packages/web`), das vom
framework-unabhängigen Engine-Paket abhängt.

**Performance Goals**: KI-Zugauswahl im interaktiven Bereich (Engine: density < 20 ms auf
10×10). Bewusst eingefügte UI-Verzögerung von ~300–500 ms zwischen KI-Schüssen (FR-020) zur
Nachvollziehbarkeit — keine Performance-, sondern eine UX-Vorgabe.

**Constraints**: Vollständig offline/clientseitig, keine Netzwerkanfragen für den Spielablauf
(FR-018). Keine Reimplementierung von Spielregeln (FR-001). Verdeckte Gegnerpositionen nie
sichtbar (FR-002, via `viewFor`). Bewusst ungestylt (FR-019).

**Scale/Scope**: Einzelspieler, ein 10×10-Board, klassische Flotte, drei KI-Stufen. Überschaubar
(~6–10 Komponenten + ein Controller-Modul).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Bewertung gegen `.specify/memory/constitution.md` v1.0.0:

| Prinzip | Status | Begründung |
|---------|--------|------------|
| I. Server-autoritative Spiellogik | ✅ PASS (kontextabhängig) | In diesem Feature gibt es **keinen Server und kein PvP** — es ist ein lokales Einzelspieler-Offline-UI. Die Engine ist die lokale Autorität über den Zustand; die UI trifft keine Regelentscheidungen. Der Geist des Prinzips bleibt gewahrt: verdeckte Informationen werden über die Engine-Sicht (`viewFor`, FR-002) nicht offengelegt, und es gibt keine zweite Regelinstanz. Da dieselbe Engine später serverseitig autoritativ läuft, muss keine UI-Regel-Logik migriert werden. |
| II. Test-First / TDD (Engine) | ✅ PASS | Es wird **keine** Engine-Logik geändert oder hinzugefügt (M1-Engine bereits TDD-abgedeckt). Das Prinzip zielt auf die Engine; dennoch wird der UI-Session-Controller (die einzige nicht-triviale Logik) testgetrieben mit Vitest entwickelt. |
| III. Geteilte, framework-unabhängige Engine (SSoT) | ✅ PASS | Kernanforderung dieses Features (FR-001): die UI **konsumiert** `@schiffe/engine` und bildet keine Regeln nach. Abhängigkeitsrichtung nur UI → Engine; die Engine bleibt framework-frei und unverändert. |
| IV. Hohe Codequalität | ✅ PASS | `strict` TS, ESLint/Prettier, dünne Komponenten + isolierter, getesteter Controller; kein `any`. |

**Ergebnis**: Alle Gates bestanden. Keine Verstöße → `Complexity Tracking` bleibt leer.

## Project Structure

### Documentation (this feature)

```text
specs/002-minimal-frontend-ai/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (UI-Zustandsmodell)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── session-controller.md   # Contract der UI↔Engine-Naht + Phasen-Statemachine
└── tasks.md             # Phase 2 output (/speckit-tasks — NICHT hier erzeugt)
```

### Source Code (repository root)

Neues Workspace-Paket `packages/web` (Next.js App Router), abhängig von `packages/engine`.

```text
packages/
├── engine/                      # bestehend (M1) — unverändert konsumiert
└── web/
    ├── app/                     # Next.js App Router
    │   ├── layout.tsx
    │   ├── page.tsx             # Einstieg: rendert das Spiel (Client Component)
    │   └── globals.css          # minimal/ungestylt
    ├── src/
    │   ├── session/             # framework-unabhängige UI-Logik (testbar ohne React)
    │   │   ├── types.ts         # SessionState, Phase, PlacementDraft, Difficulty, …
    │   │   └── controller.ts    # reine Funktionen: createSession, place/rotate, start,
    │   │                        #   playerShoot, aiStep, restart — delegiert an die Engine
    │   ├── hooks/
    │   │   └── useGameSession.ts # React-Hook: hält SessionState, treibt KI-Schritte (Pacing)
    │   └── components/          # dünne Präsentationskomponenten
    │       ├── DifficultyPicker.tsx
    │       ├── PlacementBoard.tsx   # Drag/Rotate, Gültigkeits-Feedback
    │       ├── ShipTray.tsx
    │       ├── TargetBoard.tsx       # Gegnerfeld (Fog of War), Schuss-Eingabe
    │       ├── OwnBoard.tsx          # eigenes Feld inkl. KI-Treffer
    │       └── StatusBar.tsx         # „am Zug", Ergebnis, Neustart
    ├── tests/
    │   ├── unit/                # Session-Controller (TDD), reine Logik
    │   └── component/           # RTL-Tests der Kerninteraktionen
    ├── next.config.mjs          # transpilePackages: ['@schiffe/engine']
    ├── package.json             # dep: @schiffe/engine ("*" — npm-Workspace, lokal aufgelöst)
    ├── tsconfig.json
    └── vitest.config.ts
```

**Structure Decision**: Next.js-App als Workspace-Paket `packages/web`, das `@schiffe/engine`
als Workspace-Dependency einbindet (Abhängigkeit nur UI → Engine, Verfassungs-Schichtung). Die
gesamte nicht-triviale Logik liegt im framework-unabhängigen **Session-Controller**
(`src/session/`) — reine Funktionen `(SessionState, Eingabe) → SessionState`, die ausschließlich
Engine-Funktionen aufrufen. Das macht die Spiel-Orchestrierung mit Vitest ohne React testbar
(Prinzip II/IV) und hält die React-Schicht dünn. Der `useGameSession`-Hook kapselt die
Zustandsverwaltung und das zeitliche Abspielen der KI-Schüsse (Pacing, FR-020).

## Complexity Tracking

> Keine Verfassungsverstöße — dieser Abschnitt bleibt leer.
