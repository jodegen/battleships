import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/config';
import { generateFleet } from '../../src/generate';
import { allSunk, resolveShot } from '../../src/shot';
import { selectMove } from '../../src/ai/index';
import { createRng } from '../../src/rng';
import type { AiLevel, Board, GameState } from '../../src/types';

/** Misst, wie viele Schüsse eine KI-Stufe braucht, um ein festes Gegnerboard leerzuräumen. */
function shotsToClear(target: Board, level: AiLevel, seed: number): number {
  let board = target;
  const rng = createRng(seed);
  const cap = DEFAULT_CONFIG.board.width * DEFAULT_CONFIG.board.height;
  let count = 0;
  while (!allSunk(board) && count <= cap) {
    const state: GameState = {
      config: DEFAULT_CONFIG,
      boards: {
        A: { size: DEFAULT_CONFIG.board, ships: [], shotsReceived: [] },
        B: board,
      },
      turn: 'A',
      status: 'in-progress',
      winner: null,
    };
    const decision = selectMove(state, 'A', level, rng);
    if ('noMove' in decision) break;
    board = resolveShot(board, decision.move).board;
    count++;
  }
  return count;
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

describe('Integration: KI-Spielstärke (SC-006)', () => {
  it('density < hunt-target < random in Ø-Schüssen, mit ≥10 % Marge', () => {
    const SAMPLE = 20;
    const targets: Board[] = [];
    for (let seed = 1; seed <= SAMPLE; seed++) {
      const gen = generateFleet(DEFAULT_CONFIG, createRng(1000 + seed));
      expect(gen.ok).toBe(true);
      if (gen.ok) {
        targets.push({
          size: DEFAULT_CONFIG.board,
          ships: gen.ships.map((s) => ({ length: s.length, origin: s.origin, orientation: s.orientation })),
          shotsReceived: [],
        });
      }
    }

    const avgRandom = average(targets.map((t, i) => shotsToClear(t, 'random', i)));
    const avgHunt = average(targets.map((t, i) => shotsToClear(t, 'hunt-target', i)));
    const avgDensity = average(targets.map((t, i) => shotsToClear(t, 'density', i)));

    // Strikte Ordnung …
    expect(avgDensity).toBeLessThan(avgHunt);
    expect(avgHunt).toBeLessThan(avgRandom);
    // … und jeweils mindestens 10 % besser (SC-006).
    expect(avgHunt).toBeLessThanOrEqual(avgRandom * 0.9);
    expect(avgDensity).toBeLessThanOrEqual(avgHunt * 0.9);
  });

  it('ist reproduzierbar (gleicher Seed → gleiche Schussanzahl)', () => {
    const gen = generateFleet(DEFAULT_CONFIG, createRng(4242));
    expect(gen.ok).toBe(true);
    if (!gen.ok) return;
    const board: Board = {
      size: DEFAULT_CONFIG.board,
      ships: gen.ships.map((s) => ({ length: s.length, origin: s.origin, orientation: s.orientation })),
      shotsReceived: [],
    };
    expect(shotsToClear(board, 'density', 5)).toBe(shotsToClear(board, 'density', 5));
  });
});
