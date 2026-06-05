import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/rng';
import { selectMove } from '../../src/ai/index';
import { inBounds } from '../../src/coords';
import { tinyConfig, stateWithOpponent, fleetB } from '../helpers';

describe('KI – Stufe Zufall', () => {
  it('wählt nur unbeschossene, im Feld liegende Felder', () => {
    const shots = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    const state = stateWithOpponent(tinyConfig, fleetB, shots);
    for (let seed = 0; seed < 50; seed++) {
      const d = selectMove(state, 'A', 'random', createRng(seed));
      expect('move' in d).toBe(true);
      if ('move' in d) {
        expect(inBounds(d.move, tinyConfig.board)).toBe(true);
        expect(shots).not.toContainEqual(d.move);
      }
    }
  });

  it('setzt nach einem Treffer NICHT gezielt nach (kann nicht-angrenzende Felder wählen)', () => {
    // Offener Treffer in der Mitte; reine Zufalls-KI ignoriert ihn.
    const state = stateWithOpponent(tinyConfig, fleetB, [{ x: 2, y: 4 }]);
    const picks = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const d = selectMove(state, 'A', 'random', createRng(seed));
      if ('move' in d) picks.add(`${d.move.x},${d.move.y}`);
    }
    // Mindestens ein gewähltes Feld ist nicht orthogonal zum Treffer (kein Target-Verhalten).
    const adjacent = new Set(['1,4', '3,4', '2,3']); // (2,5) wäre außerhalb
    const hasNonAdjacent = [...picks].some((k) => !adjacent.has(k));
    expect(hasNonAdjacent).toBe(true);
  });

  it('liefert noMove, wenn kein Feld mehr frei ist', () => {
    const allShots = [];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) allShots.push({ x, y });
    const state = stateWithOpponent(tinyConfig, fleetB, allShots);
    const d = selectMove(state, 'A', 'random', createRng(1));
    expect(d).toEqual({ noMove: true });
  });
});
