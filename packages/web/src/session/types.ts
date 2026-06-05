// UI-Zustandstypen (data-model.md). Spiellogik-Typen kommen aus @schiffe/engine.

import type { AiLevel, GameConfig, GameState, PlayerId, ShipPlacement, ShotResult } from '@schiffe/engine';

export type Difficulty = 'leicht' | 'mittel' | 'schwer';
export type Phase = 'difficulty' | 'placing' | 'playing' | 'finished';

export const DIFFICULTY_TO_LEVEL: Record<Difficulty, AiLevel> = {
  leicht: 'random',
  mittel: 'hunt-target',
  schwer: 'density',
};

export const DIFFICULTIES: Difficulty[] = ['leicht', 'mittel', 'schwer'];

export interface PlacementDraft {
  ships: ShipPlacement[];
}

export interface SessionState {
  phase: Phase;
  config: GameConfig;
  difficulty: Difficulty | null;
  seed: number;
  draft: PlacementDraft;
  game: GameState | null;
  turn: PlayerId | null;
  lastShot?: { by: PlayerId; result: ShotResult };
  outcome?: 'won' | 'lost';
}

/** Der menschliche Spieler ist Seite A, die KI ist Seite B. */
export const HUMAN: PlayerId = 'A';
export const AI: PlayerId = 'B';
