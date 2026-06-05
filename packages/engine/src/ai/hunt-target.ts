// Stufe „Hunt & Target" (FR-025): Suche bis Treffer, dann gezielt; Achsenverfolgung bei Linie.
// Berührungsregel-agnostisch.

import { coordKey, inBounds, neighbors4 } from '../coords';
import type { Rng } from '../rng';
import type { AiDecision, Coord, GameState, PlayerId, ShotOutcome } from '../types';
import { dedupeCoords, knowledgeFor, openHits, sortCoords, unshotCells } from './util';

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Läuft von `start` entlang (dx,dy) über zusammenhängende Treffer und liefert das erste Feld danach. */
function extensionPoint(
  start: Coord,
  dx: number,
  dy: number,
  outcomes: Map<string, ShotOutcome>,
  size: GameState['config']['board'],
): Coord | null {
  let c = { x: start.x, y: start.y };
  while (outcomes.get(coordKey(c)) === 'hit') c = { x: c.x + dx, y: c.y + dy };
  return inBounds(c, size) ? c : null;
}

export function huntTargetMove(state: GameState, by: PlayerId, rng: Rng): AiDecision {
  const size = state.config.board;
  const knowledge = knowledgeFor(state, by);
  const unshot = unshotCells(state, knowledge);
  if (unshot.length === 0) return { noMove: true };

  const hits = openHits(knowledge);
  const isUnshot = (c: Coord): boolean => inBounds(c, size) && !knowledge.shotOutcome.has(coordKey(c));

  // Kein offener Treffer → Hunt-Modus (zufällig).
  if (hits.length === 0) {
    return { move: rng.pick(sortCoords(unshot)) };
  }

  // Achsenverfolgung: zwei benachbarte offene Treffer definieren eine Achse → an den Enden zielen.
  const axisTargets: Coord[] = [];
  for (const h of hits) {
    for (const [dx, dy] of DIRS) {
      const adj = { x: h.x + dx, y: h.y + dy };
      if (knowledge.shotOutcome.get(coordKey(adj)) === 'hit') {
        const fwd = extensionPoint(h, dx, dy, knowledge.shotOutcome, size);
        if (fwd && isUnshot(fwd)) axisTargets.push(fwd);
        const bwd = extensionPoint(h, -dx, -dy, knowledge.shotOutcome, size);
        if (bwd && isUnshot(bwd)) axisTargets.push(bwd);
      }
    }
  }
  if (axisTargets.length > 0) {
    return { move: rng.pick(sortCoords(dedupeCoords(axisTargets))) };
  }

  // Einzelne offene Treffer → orthogonale Nachbarn beschießen.
  const neighborTargets: Coord[] = [];
  for (const h of hits) {
    for (const n of neighbors4(h, size)) {
      if (isUnshot(n)) neighborTargets.push(n);
    }
  }
  if (neighborTargets.length > 0) {
    return { move: rng.pick(sortCoords(dedupeCoords(neighborTargets))) };
  }

  // Fallback (sollte selten eintreten): irgendein unbeschossenes Feld.
  return { move: rng.pick(sortCoords(unshot)) };
}
