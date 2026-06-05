// KI-Dispatcher (FR-022, FR-023, FR-027). Sieht intern nur die Fog-of-War-Perspektive.

import type { Rng } from '../rng';
import type { AiDecision, AiLevel, GameState, PlayerId } from '../types';
import { densityMove } from './density';
import { huntTargetMove } from './hunt-target';
import { randomMove } from './random';

export function selectMove(
  state: GameState,
  by: PlayerId,
  level: AiLevel,
  rng: Rng,
): AiDecision {
  switch (level) {
    case 'random':
      return randomMove(state, by, rng);
    case 'hunt-target':
      return huntTargetMove(state, by, rng);
    case 'density':
      return densityMove(state, by, rng);
  }
}
