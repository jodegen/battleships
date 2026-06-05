// Reine Statistik-Ableitung (FR-018, SC-003). Quelle der Wahrheit: wins/losses.
// gamesPlayed und winRate werden abgeleitet, nicht gespeichert.

export interface StatCounters {
  readonly wins: number;
  readonly losses: number;
}

export interface StatsView {
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly losses: number;
  /** Anteil 0..1; 0 wenn keine Partien gespielt wurden. */
  readonly winRate: number;
}

export function gamesPlayed(s: StatCounters): number {
  return s.wins + s.losses;
}

export function winRate(s: StatCounters): number {
  const total = gamesPlayed(s);
  return total === 0 ? 0 : s.wins / total;
}

export function buildStatsView(s: StatCounters): StatsView {
  return {
    gamesPlayed: gamesPlayed(s),
    wins: s.wins,
    losses: s.losses,
    winRate: winRate(s),
  };
}
