import { describe, expect, it } from 'vitest';
import { selectMove } from '../../src/ai/index';
import { createRng } from '../../src/rng';
import { defineConfig, DEFAULT_CONFIG } from '../../src/config';
import { inBounds, neighbors8, coordKey } from '../../src/coords';
import { stateWithOpponent } from '../helpers';
import type { ShipPlacement } from '../../src/types';

describe('KI – Stufe Wahrscheinlichkeitsdichte', () => {
  it('wählt im Suchmodus ein paritätskonformes Feld (Schachbrett)', () => {
    // Klassische Flotte → kleinste lebende Länge 2 → Parität (x+y) % 2 === 0.
    const state = stateWithOpponent(DEFAULT_CONFIG, [
      { length: 5, origin: { x: 0, y: 0 }, orientation: 'horizontal' },
      { length: 4, origin: { x: 0, y: 2 }, orientation: 'horizontal' },
      { length: 3, origin: { x: 0, y: 4 }, orientation: 'horizontal' },
      { length: 3, origin: { x: 0, y: 6 }, orientation: 'horizontal' },
      { length: 3, origin: { x: 0, y: 8 }, orientation: 'horizontal' },
      { length: 2, origin: { x: 7, y: 0 }, orientation: 'vertical' },
    ], [{ x: 5, y: 5 }]); // ein Fehlschuss, keine offenen Treffer
    for (const seed of [1, 2, 3, 4, 5]) {
      const d = selectMove(state, 'A', 'density', createRng(seed));
      expect('move' in d).toBe(true);
      if ('move' in d) expect((d.move.x + d.move.y) % 2).toBe(0);
    }
  });

  it('konzentriert sich nach einem Treffer auf dessen Zeile/Spalte', () => {
    const cfg = defineConfig({
      board: { width: 6, height: 6 },
      fleet: { ships: [{ length: 4, count: 1 }] },
      allowTouching: true,
    });
    const ship: ShipPlacement[] = [{ length: 4, origin: { x: 1, y: 2 }, orientation: 'horizontal' }];
    const state = stateWithOpponent(cfg, ship, [{ x: 2, y: 2 }]); // offener Treffer
    for (const seed of [0, 1, 2, 3]) {
      const d = selectMove(state, 'A', 'density', createRng(seed));
      expect('move' in d).toBe(true);
      if ('move' in d) expect(d.move.x === 2 || d.move.y === 2).toBe(true);
    }
  });

  it('meidet bei verbotener Berührung Felder rund um versenkte Schiffe (FR-033)', () => {
    const cfg = defineConfig({
      board: { width: 8, height: 8 },
      fleet: { ships: [{ length: 3, count: 1 }, { length: 2, count: 1 }] },
      allowTouching: false,
    });
    const ships: ShipPlacement[] = [
      { length: 3, origin: { x: 4, y: 4 }, orientation: 'horizontal' },
      { length: 2, origin: { x: 0, y: 0 }, orientation: 'horizontal' }, // wird versenkt
    ];
    const state = stateWithOpponent(cfg, ships, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]); // 2er-Schiff versenkt
    const sunkCells = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    const forbidden = new Set<string>();
    for (const c of sunkCells) for (const n of neighbors8(c, cfg.board)) forbidden.add(coordKey(n));
    for (let seed = 0; seed < 20; seed++) {
      const d = selectMove(state, 'A', 'density', createRng(seed));
      expect('move' in d).toBe(true);
      if ('move' in d) {
        expect(inBounds(d.move, cfg.board)).toBe(true);
        expect(forbidden.has(coordKey(d.move))).toBe(false);
      }
    }
  });

  it('liefert noMove, wenn kein Feld mehr frei ist', () => {
    const cfg = defineConfig({
      board: { width: 4, height: 4 },
      fleet: { ships: [{ length: 2, count: 1 }] },
      allowTouching: true,
    });
    const shots = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) shots.push({ x, y });
    const state = stateWithOpponent(cfg, [{ length: 2, origin: { x: 0, y: 0 }, orientation: 'horizontal' }], shots);
    expect(selectMove(state, 'A', 'density', createRng(1))).toEqual({ noMove: true });
  });
});
