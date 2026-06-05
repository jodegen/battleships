import { describe, expect, it } from 'vitest';
import { resolveShot } from '../../src/shot';
import type { Board } from '../../src/types';

const board: Board = {
  size: { width: 5, height: 5 },
  ships: [{ length: 2, origin: { x: 1, y: 1 }, orientation: 'horizontal' }], // (1,1)(2,1)
  shotsReceived: [],
};

describe('resolveShot', () => {
  it('Wasser → miss', () => {
    const { result } = resolveShot(board, { x: 0, y: 0 });
    expect(result.outcome).toBe('miss');
    expect(result.coord).toEqual({ x: 0, y: 0 });
    expect(result.sunkShip).toBeUndefined();
  });

  it('teilweiser Treffer → hit (ohne sunkShip)', () => {
    const { result } = resolveShot(board, { x: 1, y: 1 });
    expect(result.outcome).toBe('hit');
    expect(result.sunkShip).toBeUndefined();
  });

  it('letztes offenes Feld → sunk inkl. Länge (FR-031)', () => {
    const afterFirst = resolveShot(board, { x: 1, y: 1 }).board;
    const { result } = resolveShot(afterFirst, { x: 2, y: 1 });
    expect(result.outcome).toBe('sunk');
    expect(result.sunkShip).toEqual({ length: 2 });
  });

  it('aktualisiert shotsReceived unveränderlich', () => {
    const { board: nb } = resolveShot(board, { x: 0, y: 0 });
    expect(board.shotsReceived).toHaveLength(0);
    expect(nb.shotsReceived).toHaveLength(1);
  });
});
