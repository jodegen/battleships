// Ableitung der Darstellungsraster aus der Fog-of-War-Sicht (FR-002). Reine Funktionen.

import {
  coordKey,
  shipCells,
  shipIsSunk,
  type Board,
  type BoardSize,
  type OpponentShotView,
} from '@schiffe/engine';

export type OwnCell = 'water' | 'ship' | 'hit' | 'sunk' | 'miss';
export type TargetCell = 'unknown' | 'miss' | 'hit' | 'sunk';

/** Eigenes Board: zeigt eigene Schiffe + erlittene Schüsse. */
export function ownGrid(board: Board): OwnCell[][] {
  const shots = new Set(board.shotsReceived.map(coordKey));
  const shipCellState = new Map<string, boolean>(); // key -> sunk?
  for (const ship of board.ships) {
    const sunk = shipIsSunk(ship, board.shotsReceived);
    for (const c of shipCells(ship)) shipCellState.set(coordKey(c), sunk);
  }
  const grid: OwnCell[][] = [];
  for (let y = 0; y < board.size.height; y++) {
    const row: OwnCell[] = [];
    for (let x = 0; x < board.size.width; x++) {
      const key = `${x},${y}`;
      const shot = shots.has(key);
      if (shipCellState.has(key)) row.push(shot ? (shipCellState.get(key) ? 'sunk' : 'hit') : 'ship');
      else row.push(shot ? 'miss' : 'water');
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Gegnerboard: ausschließlich die Ergebnisse eigener Schüsse — nie verdeckte Schiffspositionen
 * (FR-002). Nicht beschossene Felder sind 'unknown'.
 */
export function targetGrid(size: BoardSize, shots: ReadonlyArray<OpponentShotView>): TargetCell[][] {
  const map = new Map<string, TargetCell>();
  for (const s of shots) map.set(coordKey(s.coord), s.outcome);
  const grid: TargetCell[][] = [];
  for (let y = 0; y < size.height; y++) {
    const row: TargetCell[] = [];
    for (let x = 0; x < size.width; x++) row.push(map.get(`${x},${y}`) ?? 'unknown');
    grid.push(row);
  }
  return grid;
}
