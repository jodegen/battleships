# Contract: Session-Controller (UI ↔ Engine)

Die „Schnittstelle" dieses Features ist der **Session-Controller** — die einzige Stelle, an der
UI-Zustand und die Engine zusammentreffen. React-Komponenten rufen ausschließlich diese reinen
Funktionen auf; sie selbst rufen ausschließlich `@schiffe/engine`. Signaturen sind indikativ;
Verhalten/Invarianten sind verbindlich und auf die FR der Spec rückführbar.

## Typen (Auszug)

```ts
import type { AiLevel, GameConfig, GameState, PlayerId, ShipPlacement, ShotResult } from '@schiffe/engine';

export type Difficulty = 'leicht' | 'mittel' | 'schwer';
export type Phase = 'difficulty' | 'placing' | 'playing' | 'finished';

export interface PlacementDraft {
  ships: ShipPlacement[];
  selectedIndex?: number;
}

export interface SessionState {
  phase: Phase;
  config: GameConfig;
  difficulty: Difficulty | null;
  seed: number;
  draft: PlacementDraft;
  game: GameState | null;
  turn: PlayerId | null;
  lastShot?: { by: PlayerId; result: ShotResult };
  outcome?: 'won' | 'lost';
}

export const DIFFICULTY_TO_LEVEL: Record<Difficulty, AiLevel>; // leicht→random, mittel→hunt-target, schwer→density
```

## Funktionen & Verträge

### Sitzung & Auswahl
```ts
export function createSession(seed: number): SessionState; // phase='difficulty', config=Engine-Default
export function chooseDifficulty(s: SessionState, d: Difficulty): SessionState; // → phase='placing'
```
- `createSession` initialisiert mit Engine-Default-Config (10×10, klassische Flotte, Berührung
  erlaubt, Extrazug an) und leerem Draft.
- `chooseDifficulty` ist nur in `phase='difficulty'` wirksam; setzt `difficulty` und wechselt zu
  `placing` (FR-009).

### Platzierung (US1)
```ts
export function placeShip(s: SessionState, ship: ShipPlacement): SessionState; // nur wenn Engine die resultierende Aufstellung (Teilmenge) akzeptiert
export function rotateShip(s: SessionState, index: number): SessionState;      // Ausrichtung toggeln, nur wenn im Raster gültig
export function removeShip(s: SessionState, index: number): SessionState;
export function autoPlace(s: SessionState): SessionState;                       // via generateFleet(config, rng)
export function canStart(s: SessionState): boolean;                             // validatePlacement(config, draft.ships).ok
export function startGame(s: SessionState): SessionState;                       // nur wenn canStart; → phase='playing'
```
- Jede Platzierungs-/Dreh-Operation wird **vor** Übernahme über die Engine geprüft
  (`validatePlacement`); Ungültiges verändert den Zustand nicht (FR-006). Out-of-bounds/Overlap/
  (bei Regel) Berührung werden so abgelehnt.
- `autoPlace` nutzt `generateFleet` (FR-007); `startGame` ruft `createGame(config, {A: draft, B: KI-Flotte})`
  und ist nur bei vollständiger gültiger Flotte erlaubt (FR-008). Die KI-Flotte wird per
  `generateFleet` aus dem Seed erzeugt.

### Spielablauf (US2)
```ts
export function playerShoot(s: SessionState, target: Coord):
  { next: SessionState; accepted: boolean };
export function aiStep(s: SessionState): SessionState; // führt genau EINEN KI-Schuss aus
export function isAiTurn(s: SessionState): boolean;
```
- `playerShoot`:
  - nur wirksam, wenn `phase='playing'`, der Mensch am Zug ist und das Feld gültig/unbeschossen
    (sonst `accepted=false`, Zustand unverändert) — FR-010/013;
  - ruft `applyShot(game, 'A', target)`; bei `ShotRejection` → `accepted=false`;
  - aktualisiert `game`, `turn`, `lastShot`; das Zugrecht (Extrazug bei Treffer) folgt der Engine
    (FR-011); bei Spielende → `phase='finished'`, `outcome` aus `getWinner` (FR-015).
- `aiStep`:
  - nur wirksam, wenn `phase='playing'` und die KI am Zug ist;
  - bestimmt den Zug per `selectMove(game, 'B', DIFFICULTY_TO_LEVEL[difficulty], rng)` und wendet
    ihn via `applyShot(game, 'B', move)` an (FR-012);
  - `{ noMove: true }` wird als Sonderfall ohne ungültige Aktion behandelt;
  - das zeitliche Abspielen (Verzögerung ~300–500 ms zwischen mehreren KI-Schüssen, FR-020) ist
    **nicht** Sache des Controllers, sondern des `useGameSession`-Hooks.

### Darstellung (Fog of War)
```ts
export function ownView(s: SessionState): PlayerView['own'] | null;            // aus viewFor(game,'A').own
export function opponentShots(s: SessionState): PlayerView['opponent']['shots'] | null; // aus viewFor(game,'A')
```
- Liefern ausschließlich die für den Menschen zulässige Sicht; nicht getroffene Gegnerschiffe sind
  nicht enthalten (FR-002).

### Spielende & Neustart (US3)
```ts
export function restart(s: SessionState, seed: number): SessionState; // → phase='difficulty', frischer Draft
```
- Setzt eine neue Sitzung auf, ohne Seitenreload (FR-017).

## Phasen-Statemachine

```
difficulty --chooseDifficulty--> placing --startGame(canStart)--> playing --(Engine: Sieger)--> finished
   ^                                                                                                |
   |--------------------------------------- restart ------------------------------------------------|
```

## Globale Invarianten (Tests)
- Der Controller importiert/duplziert **keine** Spielregeln; jede regelrelevante Entscheidung
  stammt aus `@schiffe/engine` (FR-001).
- Eingaben in der falschen Phase oder durch die nicht-am-Zug-Seite verändern den Zustand nicht
  (FR-013/016).
- Aus den Darstellungs-Ableitungen lässt sich keine verdeckte Gegnerposition rekonstruieren
  (FR-002).
- Bei gegebenem Seed sind Partien reproduzierbar (Engine deterministisch).
