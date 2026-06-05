# Phase 0 Research: Minimal spielbares Frontend gegen die KI

Die zentralen Technologie-Fragen sind durch die Klärungen (Session 2026-06-05) entschieden;
offene `NEEDS CLARIFICATION` bestehen nicht. Dieses Dokument hält die Umsetzungs-Entscheidungen,
ihre Begründung und verworfene Alternativen fest.

## 1. UI-Framework & Rendering-Modell

- **Decision**: Next.js 14 (App Router) + React 18 + TypeScript, **rein clientseitig**. Die
  Spielseite ist eine Client Component (`'use client'`); es gibt keine API-Routen und keinen
  serverseitigen Spielzustand. Statischer Export ist möglich, aber nicht erforderlich.
- **Rationale**: Vom Nutzer geklärt (entspricht dem im Gesamtprojekt vorgesehenen Stack, M3+).
  Kein späterer Logik-Rewrite. Erfüllt FR-018 (offline/clientseitig), da Next.js nur als
  App-Shell dient.
- **Alternatives considered**: Vite + React (leichter, aber abweichend vom Zielstack); Vanilla
  TS (am schlichtesten, aber Wegwerf-UI). Beide vom Nutzer zugunsten Next.js verworfen.

## 2. Einbindung der Engine (`@schiffe/engine`)

- **Decision**: `@schiffe/engine` als Workspace-Dependency (`workspace:*`). Next.js kompiliert
  das Paket über `transpilePackages: ['@schiffe/engine']` direkt aus dem TS-Quellcode — kein
  vorheriger Build-Schritt nötig.
- **Rationale**: Hält den Entwicklungsfluss einfach (keine Build-Reihenfolge-Kopplung) und die
  Abhängigkeitsrichtung sauber (UI → Engine, Prinzip III). Die Engine bleibt unverändert.
- **Alternatives considered**: Konsum aus `dist/` (erfordert Engine-Prebuild vor jedem Web-Build);
  Pfad-Alias auf `src` ohne Transpile (Next.js würde TS aus node_modules nicht transpilieren).
  `transpilePackages` ist der etablierte, einfachste Weg.

## 3. Architektur der UI-Logik: Session-Controller

- **Decision**: Die gesamte nicht-triviale Logik liegt in `src/session/controller.ts` als reine
  Funktionen über einem expliziten `SessionState` (`createSession`, `placeShip`, `rotateShip`,
  `autoPlace`, `startGame`, `playerShoot`, `aiStep`, `restart`). Jede Funktion delegiert
  spiellogische Entscheidungen an die Engine (`validatePlacement`, `generateFleet`, `createGame`,
  `applyShot`, `selectMove`, `viewFor`, `isOver`, `getWinner`). React-Komponenten sind dünn und
  rufen nur Controller-Funktionen auf.
- **Rationale**: Trennt Orchestrierung von Darstellung → mit Vitest ohne React testbar (Prinzip
  II/IV) und garantiert, dass keine Regeln in der UI nachgebaut werden (FR-001). Reine Funktionen
  passen zur unveränderlichen Engine-API.
- **Alternatives considered**: Logik direkt in Komponenten/`useReducer` ohne separierte Schicht —
  schlechter testbar, höheres Risiko, Engine-Regeln „aus Versehen" zu duplizieren.

## 4. KI-Schritte & Pacing (FR-020)

- **Decision**: Der `useGameSession`-Hook spielt KI-Züge zeitgesteuert ab: solange die KI am Zug
  und das Spiel nicht beendet ist, ruft er `aiStep` und wartet ~300–500 ms (via `setTimeout`)
  zwischen aufeinanderfolgenden KI-Schüssen (Extrazug-Serie). `aiStep` selbst ist synchron/rein
  (Controller); das Timing ist eine reine View-/Hook-Verantwortung.
- **Rationale**: Trefferserien werden nachvollziehbar (geklärt). Pures `aiStep` bleibt
  deterministisch und testbar; die Verzögerung ist isoliert im Hook.
- **Alternatives considered**: Sofortige Auflösung (geklärt: verworfen); Schritt-auf-Klick
  (verworfen). Verzögerung als guter Default ohne Aufwand.

## 5. Zufall / Determinismus

- **Decision**: Beim Start einer Partie erzeugt die UI **einen** Seed (z. B. aus
  `Date.now()`/`Math.random()` — in der UI erlaubt, nicht in der Engine) und übergibt
  `createRng(seed)` an Engine-Aufrufe (`generateFleet`, `selectMove`). Der Seed wird im
  `SessionState` gehalten.
- **Rationale**: Die Engine bleibt deterministisch (Verfassung); die UI darf Nicht-Determinismus
  (Seed-Wahl) beitragen. Ein gehaltener Seed macht eine Partie bei Bedarf reproduzierbar/testbar.
- **Alternatives considered**: Fester Seed (langweilig, immer gleiche Partie); Engine-internes
  Random (verboten durch Verfassung).

## 6. Platzierungs-Interaktion (Drag + Drehen)

- **Decision**: Native Pointer-Events (`pointerdown/move/up`) für das Ziehen eines Schiffs auf das
  Raster; Drehen durch Antippen des Schiffs bzw. einen expliziten Dreh-Button (toggelt
  Ausrichtung). Funktioniert mit Maus und Touch. Jede beabsichtigte Position wird vor Übernahme
  per `validatePlacement` (bzw. eine Hilfsprüfung über die Engine) geprüft; nur Gültiges wird
  übernommen, Ungültiges visuell markiert/abgelehnt. Zusätzlich „zufällig platzieren" über
  `generateFleet`.
- **Rationale**: Geklärt (Drag + Tipp/Button). Pointer-Events decken Maus und Touch einheitlich
  ab, ohne DnD-Bibliothek (passt zu „schlicht"). Validierung bleibt in der Engine (FR-006).
- **Alternatives considered**: HTML5-DnD-API (touch-schwach); DnD-Bibliothek (Overhead);
  Klick-zum-Platzieren (geklärt zugunsten Drag verworfen).

## 7. Fog of War in der Darstellung (FR-002)

- **Decision**: Beide Boards werden ausschließlich aus `viewFor(state, player)` gerendert. Das
  eigene Board zeigt eigene Schiffe + erlittene Schüsse; das Gegnerboard zeigt nur die Ergebnisse
  der eigenen Schüsse (miss/hit/sunk) — nie nicht getroffene Gegnerpositionen.
- **Rationale**: Erfüllt FR-002 strukturell: Die Komponente bekommt gar keine verdeckten Daten,
  kann sie also nicht leaken.
- **Alternatives considered**: Direktes Rendern aus `GameState.boards` (würde Gegnerschiffe
  enthalten → Leak-Risiko). Verworfen.

## 8. Test-Stack

- **Decision**: Vitest (Runner, wie im Engine-Paket) + React Testing Library mit `jsdom` für
  Komponenten-Tests. Der Session-Controller wird testgetrieben (reine Funktionen) abgedeckt;
  Komponententests sichern die Kerninteraktionen (Platzieren/Validität, Schuss-Eingabe,
  Fog-of-War, Spielende/Neustart). Playwright-E2E ist optional und einem späteren Meilenstein
  vorbehalten.
- **Rationale**: Konsistent mit dem bestehenden Vitest-Setup; RTL ist der Standard für
  React-Komponententests. Hält den Testaufwand minimal und fokussiert (passt zu „schlicht").
- **Alternatives considered**: Jest (abweichend vom Repo-Standard Vitest); reine E2E ohne Unit
  (langsamer, sprödere Tests). Verworfen.

## 9. Styling

- **Decision**: Minimal/ungestylt — schlichtes CSS (z. B. einfache Klassen/`globals.css`) nur zur
  Lesbarkeit von Raster und Zuständen (Wasser/Treffer/versenkt). Keine UI-Bibliothek, kein
  Designsystem.
- **Rationale**: Explizit gefordert (FR-019); das „richtige" Design kommt später.
- **Alternatives considered**: Tailwind/Component-Library — bewusst zurückgestellt.
