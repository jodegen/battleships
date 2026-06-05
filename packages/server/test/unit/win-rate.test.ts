import { describe, expect, it } from 'vitest';

import { buildStatsView, gamesPlayed, winRate } from '../../src/stats/win-rate';

describe('win-rate / stats derivation (FR-018, SC-003)', () => {
  it('gamesPlayed = wins + losses', () => {
    expect(gamesPlayed({ wins: 3, losses: 2 })).toBe(5);
    expect(gamesPlayed({ wins: 0, losses: 0 })).toBe(0);
  });

  it('winRate ist 0 bei null Partien (keine Division durch null)', () => {
    expect(winRate({ wins: 0, losses: 0 })).toBe(0);
  });

  it('winRate = wins / gamesPlayed', () => {
    expect(winRate({ wins: 1, losses: 1 })).toBeCloseTo(0.5, 5);
    expect(winRate({ wins: 3, losses: 1 })).toBeCloseTo(0.75, 5);
  });

  it('buildStatsView liefert konsistente, abgeleitete Werte', () => {
    expect(buildStatsView({ wins: 3, losses: 1 })).toEqual({
      gamesPlayed: 4,
      wins: 3,
      losses: 1,
      winRate: 0.75,
    });
    expect(buildStatsView({ wins: 0, losses: 0 })).toEqual({
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
    });
  });
});
