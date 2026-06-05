import { describe, expect, it } from 'vitest';
import { selectMove } from '../../src/ai/index';
import { createRng } from '../../src/rng';
import { DEFAULT_CONFIG } from '../../src/config';
import { stateWithOpponent, fleetB, tinyConfig } from '../helpers';
import type { AiLevel } from '../../src/types';

const levels: AiLevel[] = ['random', 'hunt-target', 'density'];

describe('KI – Determinismus & Erschöpfung', () => {
  it('gleicher State + gleicher Seed → gleicher Zug (alle Stufen, SC-007)', () => {
    const state = stateWithOpponent(DEFAULT_CONFIG, [
      { length: 5, origin: { x: 0, y: 0 }, orientation: 'horizontal' },
      { length: 4, origin: { x: 0, y: 2 }, orientation: 'horizontal' },
      { length: 3, origin: { x: 0, y: 4 }, orientation: 'horizontal' },
      { length: 3, origin: { x: 0, y: 6 }, orientation: 'horizontal' },
      { length: 3, origin: { x: 0, y: 8 }, orientation: 'horizontal' },
      { length: 2, origin: { x: 7, y: 0 }, orientation: 'vertical' },
    ], [{ x: 3, y: 3 }, { x: 1, y: 0 }]);
    for (const level of levels) {
      const d1 = selectMove(state, 'A', level, createRng(2024));
      const d2 = selectMove(state, 'A', level, createRng(2024));
      expect(d1).toEqual(d2);
    }
  });

  it('vollständig beschossenes Brett → alle Stufen liefern noMove (FR-027)', () => {
    const allShots = [];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) allShots.push({ x, y });
    const state = stateWithOpponent(tinyConfig, fleetB, allShots);
    for (const level of levels) {
      expect(selectMove(state, 'A', level, createRng(7))).toEqual({ noMove: true });
    }
  });
});
