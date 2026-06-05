import { buildStatsView, type StatCounters, type StatsView } from './win-rate';

export type { StatsView } from './win-rate';

export interface ProfileView {
  readonly displayName: string;
  readonly stats: StatsView;
}

export function toStatsView(counters: StatCounters | null | undefined): StatsView {
  return buildStatsView({ wins: counters?.wins ?? 0, losses: counters?.losses ?? 0 });
}

export function toProfileView(
  displayName: string,
  counters: StatCounters | null | undefined,
): ProfileView {
  return { displayName, stats: toStatsView(counters) };
}
