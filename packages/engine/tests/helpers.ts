// Gemeinsame Test-Fixtures (kein Test-File, wird importiert).

import { defineConfig } from '../src/config';
import type { Board, GameConfig, GameState, PlayerId, ShipPlacement } from '../src/types';

/** Kleines Feld + kleine Flotte für schnelle, manuell konstruierbare Platzierungstests. */
export const tinyConfig: GameConfig = defineConfig({
  board: { width: 5, height: 5 },
  fleet: { ships: [{ length: 3, count: 1 }, { length: 2, count: 1 }] },
  allowTouching: true,
});

export const tinyConfigNoTouch: GameConfig = defineConfig({
  board: { width: 5, height: 5 },
  fleet: { ships: [{ length: 3, count: 1 }, { length: 2, count: 1 }] },
  allowTouching: false,
});

export const fleetA: ShipPlacement[] = [
  { length: 3, origin: { x: 0, y: 0 }, orientation: 'horizontal' },
  { length: 2, origin: { x: 0, y: 2 }, orientation: 'vertical' },
];

export const fleetB: ShipPlacement[] = [
  { length: 3, origin: { x: 2, y: 4 }, orientation: 'horizontal' },
  { length: 2, origin: { x: 4, y: 0 }, orientation: 'vertical' },
];

/** Konstruiert einen Spielzustand für KI-Tests: B = Gegner, A passiv, A am Zug. */
export function stateWithOpponent(
  config: GameConfig,
  opponentShips: ShipPlacement[],
  shotsOnOpponent: { x: number; y: number }[] = [],
): GameState {
  const oppBoard: Board = {
    size: config.board,
    ships: opponentShips.map((s) => ({ length: s.length, origin: s.origin, orientation: s.orientation })),
    shotsReceived: shotsOnOpponent,
  };
  return {
    config,
    boards: {
      A: { size: config.board, ships: [], shotsReceived: [] },
      B: oppBoard,
    },
    turn: 'A' as PlayerId,
    status: 'in-progress',
    winner: null,
  };
}
