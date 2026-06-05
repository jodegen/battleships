// Schussauswertung: miss / hit / sunk inkl. Schiffslänge (FR-013, FR-018, FR-031).

import { coordEquals, coordKey, shipCells } from './coords';
import type { Board, Coord, Ship, ShotResult } from './types';

function shotKeySet(shots: ReadonlyArray<Coord>): Set<string> {
  return new Set(shots.map(coordKey));
}

export function shipIsSunk(ship: Ship, shots: ReadonlyArray<Coord>): boolean {
  const keys = shotKeySet(shots);
  return shipCells(ship).every((c) => keys.has(coordKey(c)));
}

/** Alle Schiffe des Boards versenkt? (FR-019) */
export function allSunk(board: Board): boolean {
  const keys = shotKeySet(board.shotsReceived);
  return board.ships.every((s) => shipCells(s).every((c) => keys.has(coordKey(c))));
}

/**
 * Wertet einen (bereits als gültig geprüften) Schuss auf `target` gegen `board` aus und gibt
 * das Ergebnis sowie das aktualisierte (unveränderliche) Board zurück.
 */
export function resolveShot(board: Board, target: Coord): { result: ShotResult; board: Board } {
  const shotsReceived = [...board.shotsReceived, target];
  const nextBoard: Board = { ...board, shotsReceived };

  const hitShip = board.ships.find((s) => shipCells(s).some((c) => coordEquals(c, target)));
  if (!hitShip) {
    return { result: { outcome: 'miss', coord: target }, board: nextBoard };
  }

  if (shipIsSunk(hitShip, shotsReceived)) {
    return {
      result: { outcome: 'sunk', coord: target, sunkShip: { length: hitShip.length } },
      board: nextBoard,
    };
  }
  return { result: { outcome: 'hit', coord: target }, board: nextBoard };
}
