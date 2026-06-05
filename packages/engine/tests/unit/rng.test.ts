import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/rng';

describe('createRng', () => {
  it('liefert bei gleichem Seed die gleiche Folge (Determinismus)', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('liefert bei unterschiedlichem Seed unterschiedliche Folgen', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('next() liegt in [0, 1)', () => {
    const rng = createRng(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt(n) liegt in [0, n)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });

  it('nextInt(0) wirft', () => {
    const rng = createRng(1);
    expect(() => rng.nextInt(0)).toThrow();
  });

  it('pick wählt ein Element und wirft bei leerem Array', () => {
    const rng = createRng(9);
    expect([1, 2, 3]).toContain(rng.pick([1, 2, 3]));
    expect(() => rng.pick([])).toThrow();
  });
});
