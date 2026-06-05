// Domänentypen der Engine (data-model.md). Reine Typdeklarationen, keine Logik.

export type PlayerId = 'A' | 'B';
export type Orientation = 'horizontal' | 'vertical';

export interface Coord {
  readonly x: number;
  readonly y: number;
}

export interface BoardSize {
  readonly width: number;
  readonly height: number;
}

export interface FleetSpec {
  readonly ships: ReadonlyArray<{ readonly length: number; readonly count: number }>;
}

export interface GameConfig {
  readonly board: BoardSize;
  readonly fleet: FleetSpec;
  readonly allowTouching: boolean;
  readonly extraTurnOnHit: boolean;
}

export interface ShipPlacement {
  readonly length: number;
  readonly origin: Coord;
  readonly orientation: Orientation;
}

export type PlacementError =
  | 'out-of-bounds'
  | 'overlap'
  | 'touching-forbidden'
  | 'fleet-mismatch'
  | 'invalid-orientation';

export type PlacementResult = { readonly ok: true } | { readonly ok: false; readonly reason: PlacementError };

export type ShotOutcome = 'miss' | 'hit' | 'sunk';

export interface ShotResult {
  readonly outcome: ShotOutcome;
  readonly coord: Coord;
  readonly sunkShip?: { readonly length: number };
}

export type ShotRejectionReason = 'already-shot' | 'out-of-bounds' | 'not-your-turn' | 'game-over';

export interface ShotRejection {
  readonly rejected: true;
  readonly reason: ShotRejectionReason;
}

export type GameStatus = 'placing' | 'in-progress' | 'finished';

/** Ein platziertes Schiff auf einem Board (Position ist Teil des kanonischen Zustands). */
export interface Ship {
  readonly length: number;
  readonly origin: Coord;
  readonly orientation: Orientation;
}

/** Das Board einer Partei: eigene Schiffe + die darauf abgegebenen Schüsse des Gegners. */
export interface Board {
  readonly size: BoardSize;
  readonly ships: ReadonlyArray<Ship>;
  readonly shotsReceived: ReadonlyArray<Coord>;
}

export interface GameState {
  readonly config: GameConfig;
  readonly boards: { readonly A: Board; readonly B: Board };
  readonly turn: PlayerId;
  readonly status: GameStatus;
  readonly winner: PlayerId | null;
}

/** Ein für die schießende Seite sichtbares Schussergebnis auf dem Gegnerboard (Fog of War). */
export interface OpponentShotView {
  readonly coord: Coord;
  readonly outcome: ShotOutcome;
  readonly sunkShip?: { readonly length: number };
}

export interface PlayerView {
  /** Vollständige eigene Sicht (eigene Schiffe + erlittene Schüsse). */
  readonly own: Board;
  /** Nur die Ergebnisse der eigenen Schüsse auf den Gegner — keine verdeckten Positionen. */
  readonly opponent: { readonly shots: ReadonlyArray<OpponentShotView> };
}

export type AiLevel = 'random' | 'hunt-target' | 'density';

export type AiDecision = { readonly move: Coord } | { readonly noMove: true };
