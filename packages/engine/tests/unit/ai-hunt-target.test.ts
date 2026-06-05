import { describe, expect, it } from 'vitest';
import { selectMove } from '../../src/ai/index';
import { createRng } from '../../src/rng';
import { defineConfig } from '../../src/config';
import { stateWithOpponent } from '../helpers';
import type { ShipPlacement } from '../../src/types';

// 6×6-Feld, ein langes Schiff für klare Achsen.
const cfg = defineConfig({
  board: { width: 6, height: 6 },
  fleet: { ships: [{ length: 4, count: 1 }] },
  allowTouching: true,
});
const oppShip: ShipPlacement[] = [{ length: 4, origin: { x: 1, y: 2 }, orientation: 'horizontal' }];
// Schiffszellen: (1,2)(2,2)(3,2)(4,2)

describe('KI – Stufe Hunt & Target', () => {
  it('zielt nach einem einzelnen Treffer auf orthogonale Nachbarn', () => {
    const state = stateWithOpponent(cfg, oppShip, [{ x: 2, y: 2 }]); // ein Treffer
    const neighbors = new Set(['1,2', '3,2', '2,1', '2,3']);
    for (let seed = 0; seed < 30; seed++) {
      const d = selectMove(state, 'A', 'hunt-target', createRng(seed));
      expect('move' in d).toBe(true);
      if ('move' in d) expect(neighbors.has(`${d.move.x},${d.move.y}`)).toBe(true);
    }
  });

  it('verfolgt bei zwei Treffern in einer Linie die Achse (Enden)', () => {
    const state = stateWithOpponent(cfg, oppShip, [
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ]); // zwei Treffer in einer Zeile
    const lineEnds = new Set(['0,2', '3,2']); // Enden der erkannten horizontalen Achse
    for (let seed = 0; seed < 30; seed++) {
      const d = selectMove(state, 'A', 'hunt-target', createRng(seed));
      expect('move' in d).toBe(true);
      if ('move' in d) expect(lineEnds.has(`${d.move.x},${d.move.y}`)).toBe(true);
    }
  });

  it('ohne offene Treffer wählt es ein beliebiges unbeschossenes Feld (Hunt)', () => {
    const state = stateWithOpponent(cfg, oppShip, [{ x: 0, y: 0 }]); // Fehlschuss
    const d = selectMove(state, 'A', 'hunt-target', createRng(3));
    expect('move' in d).toBe(true);
    if ('move' in d) expect(`${d.move.x},${d.move.y}`).not.toBe('0,0');
  });
});
