// Injizierbarer, deterministischer Zufall (FR-028). Kein Math.random, kein globaler Zustand.

export interface Rng {
  /** Gleichverteilt in [0, 1). */
  next(): number;
  /** Ganzzahl in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  /** Wählt ein Element aus einem nicht-leeren Array. */
  pick<T>(arr: ReadonlyArray<T>): T;
}

/**
 * Seed-basierte, reine PRNG-Implementierung (mulberry32). Math.imul ist eine reine,
 * deterministische Operation und unterliegt nicht dem Determinismus-Verbot.
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const nextInt = (maxExclusive: number): number => {
    if (maxExclusive <= 0) throw new Error('nextInt requires maxExclusive > 0');
    return Math.floor(next() * maxExclusive);
  };

  const pick = <T>(arr: ReadonlyArray<T>): T => {
    if (arr.length === 0) throw new Error('pick requires a non-empty array');
    return arr[nextInt(arr.length)] as T;
  };

  return { next, nextInt, pick };
}
