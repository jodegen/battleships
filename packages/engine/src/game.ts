// Spielzustand, Zugrecht (Extrazug-Regel), Siegerkennung (FR-016/017/019/020, FR-034).

import { inBounds } from './coords';
import { validatePlacement } from './placement';
import { allSunk, resolveShot } from './shot';
import type { Board, Coord, GameConfig, GameState, PlayerId, ShipPlacement, ShotRejection, ShotResult } from './types';

function opponentOf(p: PlayerId): PlayerId {
  return p === 'A' ? 'B' : 'A';
}

function toBoard(config: GameConfig, ships: ReadonlyArray<ShipPlacement>): Board {
  return {
    size: config.board,
    ships: ships.map((s) => ({ length: s.length, origin: s.origin, orientation: s.orientation })),
    shotsReceived: [],
  };
}

/**
 * Erzeugt eine Partie aus zwei gültigen Aufstellungen. Wirft bei ungültiger Flotte.
 * Startspieler ist deterministisch A (FR-034).
 */
export function createGame(
  config: GameConfig,
  fleets: { A: ReadonlyArray<ShipPlacement>; B: ReadonlyArray<ShipPlacement> },
): GameState {
  const va = validatePlacement(config, fleets.A);
  if (!va.ok) throw new Error(`invalid fleet for player A: ${va.reason}`);
  const vb = validatePlacement(config, fleets.B);
  if (!vb.ok) throw new Error(`invalid fleet for player B: ${vb.reason}`);

  return {
    config,
    boards: { A: toBoard(config, fleets.A), B: toBoard(config, fleets.B) },
    turn: 'A',
    status: 'in-progress',
    winner: null,
  };
}

export function currentTurn(state: GameState): PlayerId {
  return state.turn;
}

export function isOver(state: GameState): boolean {
  return state.status === 'finished';
}

export function getWinner(state: GameState): PlayerId | null {
  return state.winner;
}

/**
 * Wendet einen Schuss von `by` auf `target` (Board des Gegners) an. Reine Funktion: die
 * Eingabe bleibt unverändert. Ungültige Schüsse liefern eine `ShotRejection` ohne Wirkung.
 */
export function applyShot(
  state: GameState,
  by: PlayerId,
  target: Coord,
): { state: GameState; result: ShotResult } | ShotRejection {
  if (state.status === 'finished') return { rejected: true, reason: 'game-over' };
  if (state.turn !== by) return { rejected: true, reason: 'not-your-turn' };
  if (!inBounds(target, state.config.board)) return { rejected: true, reason: 'out-of-bounds' };

  const opp = opponentOf(by);
  const targetBoard = state.boards[opp];
  if (targetBoard.shotsReceived.some((c) => c.x === target.x && c.y === target.y)) {
    return { rejected: true, reason: 'already-shot' };
  }

  const { result, board: newOppBoard } = resolveShot(targetBoard, target);
  const boards =
    opp === 'A'
      ? { A: newOppBoard, B: state.boards.B }
      : { A: state.boards.A, B: newOppBoard };

  if (allSunk(newOppBoard)) {
    return {
      state: { ...state, boards, status: 'finished', winner: by },
      result,
    };
  }

  const isHit = result.outcome === 'hit' || result.outcome === 'sunk';
  const stay = state.config.extraTurnOnHit && isHit;
  const turn = stay ? by : opp;

  return { state: { ...state, boards, turn }, result };
}
