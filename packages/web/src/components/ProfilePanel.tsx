'use client';

import type { StatsView } from '@/api/client';

/** Zeigt die Statistik eines eingeloggten Spielers (FR-011/021). */
export function ProfilePanel({ stats }: { stats: StatsView | null }): JSX.Element | null {
  if (!stats) return null;
  const winRatePct = Math.round(stats.winRate * 100);
  return (
    <dl aria-label="Statistik">
      <dt>Gespielte Partien</dt>
      <dd>{stats.gamesPlayed}</dd>
      <dt>Siege</dt>
      <dd>{stats.wins}</dd>
      <dt>Niederlagen</dt>
      <dd>{stats.losses}</dd>
      <dt>Siegquote</dt>
      <dd>{winRatePct}%</dd>
    </dl>
  );
}
