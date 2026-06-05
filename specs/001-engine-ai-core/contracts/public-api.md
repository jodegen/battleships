# Contract: Öffentliche Engine-API (`@schiffe/engine`)

Die „Schnittstelle" dieser Library ist ihre öffentliche TypeScript-API: exportierte Typen und
reine Funktionen. Dieser Contract ist verbindlich für Tests (`tests/contract/`) und für spätere
Konsumenten (`server`, `client`). Signaturen sind indikativ; Verhalten und Invarianten sind
verbindlich und auf die FR der Spec rückführbar.

## Typen (Auszug)

```ts
export type PlayerId = 'A' | 'B';
export type Orientation = 'horizontal' | 'vertical';
export interface Coord { x: number; y: number }

export interface BoardSize { width: number; height: number }
export interface FleetSpec { ships: { length: number; count: number }[] }
export interface GameConfig {
  board: BoardSize;
  fleet: FleetSpec;
  allowTouching: boolean;   // default true
  extraTurnOnHit: boolean;  // default true
}

export interface ShipPlacement { length: number; origin: Coord; orientation: Orientation }

export type PlacementError =
  | 'out-of-bounds' | 'overlap' | 'touching-forbidden'
  | 'fleet-mismatch' | 'invalid-orientation';
export type PlacementResult = { ok: true } | { ok: false; reason: PlacementError };

export type ShotOutcome = 'miss' | 'hit' | 'sunk';
export type ShotResult = { outcome: ShotOutcome; coord: Coord; sunkShip?: { length: number } };
export type ShotRejection = {
  rejected: true;
  reason: 'already-shot' | 'out-of-bounds' | 'not-your-turn' | 'game-over';
};

export type GameStatus = 'placing' | 'in-progress' | 'finished';
export interface GameState { /* opaque, immutable; siehe data-model.md */ }

export interface PlayerView { /* own + opponent.shots; siehe data-model.md (FR-021) */ }

export type AiLevel = 'random' | 'hunt-target' | 'density';
export type AiDecision = { move: Coord } | { noMove: true };

// Injizierbarer, deterministischer Zufall (FR-028).
export interface Rng { next(): number; /* [0,1) */ nextInt(maxExclusive: number): number }
export function createRng(seed: number): Rng;
```

## Funktionen & Verträge

### Konfiguration
```ts
export const DEFAULT_CONFIG: GameConfig; // 10×10, klassische Flotte, touching=true, extraTurn=true
export function defineConfig(partial?: Partial<GameConfig>): GameConfig;
```
- Füllt fehlende Felder mit Defaults (FR-001/002/003). Validiert die Konsistenz.

### Platzierung (US1)
```ts
export function validatePlacement(config: GameConfig, ships: ShipPlacement[]): PlacementResult;
export function generateFleet(config: GameConfig, rng: Rng):
  { ok: true; ships: ShipPlacement[] } | { ok: false; reason: 'unplaceable' };
```
- `validatePlacement`:
  - akzeptiert **nur** vollständige, regelkonforme Flotten (FR-006–FR-012);
  - lehnt jede Verletzung mit dem korrekten `reason` ab (FR-011); Reihenfolge der Prüfung darf
    den ersten zutreffenden Grund liefern;
  - bei `allowTouching=false` wird orthogonale **und** diagonale Berührung verboten (FR-009).
- `generateFleet`:
  - liefert eine gültige Aufstellung deterministisch aus `rng` (FR-030); identischer Seed →
    identische Aufstellung (SC-008);
  - signalisiert `'unplaceable'`, statt eine ungültige Aufstellung zu liefern.

### Spiel-Erzeugung & Schussauswertung (US2)
```ts
export function createGame(config: GameConfig,
  fleets: { A: ShipPlacement[]; B: ShipPlacement[] }): GameState; // wirft bei ungültiger Flotte
export function applyShot(state: GameState, by: PlayerId, target: Coord):
  { state: GameState; result: ShotResult } | ShotRejection;
export function isOver(state: GameState): boolean;
export function getWinner(state: GameState): PlayerId | null;
export function currentTurn(state: GameState): PlayerId;
```
- `createGame`: nur mit zwei gültigen Flotten; Startstatus `in-progress`, `turn = 'A'`
  (Startspieler ggf. via Variante/RNG später — hier deterministisch `A`).
- `applyShot`:
  - wertet genau ein `outcome` aus (FR-013); `sunk` setzt `sunkShip.length` (FR-018/FR-031);
  - lehnt bereits beschossene/außerhalb/nicht-am-Zug/beendete Schüsse als `ShotRejection`
    ab, **ohne** Zustandsänderung (FR-014/015);
  - Zugrecht: bei `extraTurnOnHit=true` bleibt `by` nach `hit`/`sunk` am Zug, wechselt nach
    `miss`; bei `extraTurnOnHit=false` wechselt der Zug immer (FR-016/017);
  - setzt `status='finished'` und `winner=by`, wenn damit alle gegnerischen Schiffe versenkt
    sind (FR-019); danach weitere Schüsse → `'game-over'`.
- Eingabe-`state` wird **nicht** mutiert (reine Funktion, FR-028/029).

### Sicht (Fairness, FR-021)
```ts
export function viewFor(state: GameState, player: PlayerId): PlayerView;
```
- Liefert ausschließlich die für `player` zulässigen Informationen; keine verdeckten
  gegnerischen Positionen.

### KI (US3)
```ts
export function selectMove(state: GameState, by: PlayerId, level: AiLevel, rng: Rng): AiDecision;
```
- Sieht intern nur die `viewFor(state, by)`-Perspektive (Prinzip I) (FR-022, FR-023).
- `random` (FR-024): gleichverteilt unter unbeschossenen In-Bounds-Feldern; kein Nachsetzen.
- `hunt-target` (FR-025): Target-Modus über offene Treffer + Achsenverfolgung; ohne offene
  Treffer Hunt-Modus; berührungsregel-agnostisch.
- `density` (FR-026/032/033): reine Wahrscheinlichkeitsdichte über konsistente Platzierungen
  lebender Schiffe; versenkte Schiffe (Längen aus `sunk`) entfernt; bei `allowTouching=false`
  an Schiffe angrenzende Platzierungen ausgeschlossen; Paritätsgewichtung im Suchmodus.
- Determinismus: identische `(state, by, level, rng)` → identische `AiDecision` (SC-007).
- Liefert `{ noMove: true }`, wenn kein gültiger Zug existiert (FR-027).

## Globale Invarianten (contract-tests)
- Keine Funktion verwendet `Math.random`/`Date.now`/globalen Zustand (FR-028).
- Kein Import aus UI-/DOM-/Node-spezifischen Modulen (FR-029); 0 Runtime-Dependencies.
- Alle Eingabeobjekte bleiben unverändert (Immutabilität).
