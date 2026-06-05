import { describe, expect, it } from 'vitest';
import { allCells, coordKey, inBounds, neighbors4, neighbors8, shipCells } from '../../src/coords';

const size = { width: 5, height: 5 };

describe('Geometrie', () => {
  it('inBounds erkennt Felder innerhalb/außerhalb', () => {
    expect(inBounds({ x: 0, y: 0 }, size)).toBe(true);
    expect(inBounds({ x: 4, y: 4 }, size)).toBe(true);
    expect(inBounds({ x: 5, y: 0 }, size)).toBe(false);
    expect(inBounds({ x: -1, y: 0 }, size)).toBe(false);
  });

  it('shipCells liefert horizontale und vertikale Zellen', () => {
    expect(shipCells({ origin: { x: 1, y: 2 }, orientation: 'horizontal', length: 3 })).toEqual([
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ]);
    expect(shipCells({ origin: { x: 1, y: 2 }, orientation: 'vertical', length: 2 })).toEqual([
      { x: 1, y: 2 },
      { x: 1, y: 3 },
    ]);
  });

  it('neighbors8 reduziert sich an Ecken auf 3 Nachbarn', () => {
    expect(neighbors8({ x: 0, y: 0 }, size)).toHaveLength(3);
    expect(neighbors8({ x: 2, y: 2 }, size)).toHaveLength(8);
  });

  it('neighbors4 liefert nur orthogonale In-Bounds-Nachbarn', () => {
    expect(neighbors4({ x: 0, y: 0 }, size)).toHaveLength(2);
    expect(neighbors4({ x: 2, y: 2 }, size)).toHaveLength(4);
  });

  it('allCells zählt width*height', () => {
    expect(allCells(size)).toHaveLength(25);
  });

  it('coordKey ist eindeutig', () => {
    expect(coordKey({ x: 3, y: 4 })).toBe('3,4');
    expect(coordKey({ x: 3, y: 4 })).not.toBe(coordKey({ x: 4, y: 3 }));
  });
});
