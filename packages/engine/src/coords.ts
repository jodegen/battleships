// Board-Geometrie: In-Bounds, Schiffszellen, 8er-Nachbarschaft (FR-004, FR-005).

import type { BoardSize, Coord, Orientation } from './types';

export function inBounds(c: Coord, size: BoardSize): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < size.width && c.y < size.height;
}

export function coordKey(c: Coord): string {
  return `${c.x},${c.y}`;
}

export function keyToCoord(key: string): Coord {
  const comma = key.indexOf(',');
  return { x: Number(key.slice(0, comma)), y: Number(key.slice(comma + 1)) };
}

export function coordEquals(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function shipCells(p: { origin: Coord; orientation: Orientation; length: number }): Coord[] {
  const cells: Coord[] = [];
  for (let i = 0; i < p.length; i++) {
    cells.push(
      p.orientation === 'horizontal'
        ? { x: p.origin.x + i, y: p.origin.y }
        : { x: p.origin.x, y: p.origin.y + i },
    );
  }
  return cells;
}

/** Orthogonale + diagonale Nachbarn innerhalb des Felds (für die Berührungsregel). */
export function neighbors8(c: Coord, size: BoardSize): Coord[] {
  const res: Coord[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const n = { x: c.x + dx, y: c.y + dy };
      if (inBounds(n, size)) res.push(n);
    }
  }
  return res;
}

/** Orthogonale Nachbarn innerhalb des Felds (für Hunt & Target). */
export function neighbors4(c: Coord, size: BoardSize): Coord[] {
  const candidates: Coord[] = [
    { x: c.x + 1, y: c.y },
    { x: c.x - 1, y: c.y },
    { x: c.x, y: c.y + 1 },
    { x: c.x, y: c.y - 1 },
  ];
  return candidates.filter((n) => inBounds(n, size));
}

export function allCells(size: BoardSize): Coord[] {
  const cells: Coord[] = [];
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) cells.push({ x, y });
  }
  return cells;
}
