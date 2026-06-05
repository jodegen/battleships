// Stufe „Zufall" (FR-024): gleichverteilt unter unbeschossenen Feldern, kein Nachsetzen.

import type { Rng } from '../rng';
import type { AiDecision, GameState, PlayerId } from '../types';
import { knowledgeFor, sortCoords, unshotCells } from './util';

export function randomMove(state: GameState, by: PlayerId, rng: Rng): AiDecision {
  const knowledge = knowledgeFor(state, by);
  const candidates = sortCoords(unshotCells(state, knowledge));
  if (candidates.length === 0) return { noMove: true };
  return { move: rng.pick(candidates) };
}
