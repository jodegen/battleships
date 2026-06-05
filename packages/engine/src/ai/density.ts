// Stufe „Wahrscheinlichkeitsdichte + Parität" (FR-026, FR-032, FR-033). Reine Dichte:
// kein separater Target-Modus — die Konsistenz mit offenen Treffern konzentriert die Dichte.

import { coordKey, neighbors4, neighbors8, shipCells } from '../coords';
import type { Rng } from '../rng';
import type { AiDecision, Coord, GameState, Orientation, PlayerId } from '../types';
import { knowledgeFor, livingShipLengths, openHits, sortCoords, unshotCells } from './util';

const ORIENTATIONS: ReadonlyArray<Orientation> = ['horizontal', 'vertical'];

export function densityMove(state: GameState, by: PlayerId, rng: Rng): AiDecision {
  const size = state.config.board;
  const knowledge = knowledgeFor(state, by);
  const unshot = unshotCells(state, knowledge);
  if (unshot.length === 0) return { noMove: true };

  const living = livingShipLengths(state, knowledge);
  if (living.length === 0) return { move: rng.pick(sortCoords(unshot)) };

  const outcomeOf = (c: Coord): string | undefined => knowledge.shotOutcome.get(coordKey(c));
  const hits = openHits(knowledge);
  const hitKeys = new Set(hits.map(coordKey));
  const haveHits = hitKeys.size > 0;

  // Versenkte Zellen (für Pruning bei verbotener Berührung, FR-033).
  const sunkKeys = new Set<string>();
  for (const [key, outcome] of knowledge.shotOutcome) {
    if (outcome === 'sunk') sunkKeys.add(key);
  }
  const adjacentToSunk = (c: Coord): boolean => {
    if (state.config.allowTouching) return false;
    for (const n of neighbors8(c, size)) {
      if (sunkKeys.has(coordKey(n))) return true;
    }
    return false;
  };

  const density = new Map<string, number>();
  const uniqueLengths = [...new Set(living)];

  for (const length of uniqueLengths) {
    for (const orientation of ORIENTATIONS) {
      const maxX = orientation === 'horizontal' ? size.width - length : size.width - 1;
      const maxY = orientation === 'vertical' ? size.height - length : size.height - 1;
      for (let y = 0; y <= maxY; y++) {
        for (let x = 0; x <= maxX; x++) {
          const cells = shipCells({ origin: { x, y }, orientation, length });
          let valid = true;
          let hitsCovered = 0;
          for (const c of cells) {
            const o = outcomeOf(c);
            if (o === 'miss' || o === 'sunk' || adjacentToSunk(c)) {
              valid = false;
              break;
            }
            if (hitKeys.has(coordKey(c))) hitsCovered++;
          }
          if (!valid) continue;
          // Bei offenen Treffern nur Platzierungen zählen, die mindestens einen abdecken.
          if (haveHits && hitsCovered === 0) continue;
          const weight = haveHits ? hitsCovered : 1;
          for (const c of cells) {
            const k = coordKey(c);
            if (!knowledge.shotOutcome.has(k)) density.set(k, (density.get(k) ?? 0) + weight);
          }
        }
      }
    }
  }

  let candidates = unshot.filter((c) => density.has(coordKey(c)));
  if (candidates.length === 0) candidates = unshot;

  if (haveHits) {
    // Target-Fokus: das partiell getroffene Schiff zuerst fertig versenken. Die Dichte rankt
    // (bevorzugt die Schiffsachse), aber gewählt wird nur eine legale Fortsetzung — ein Feld
    // orthogonal angrenzend an einen offenen Treffer. Verhindert weit entfernte Fehlschüsse.
    const adjacentToHit = new Set<string>();
    for (const h of hits) {
      for (const n of neighbors4(h, size)) adjacentToHit.add(coordKey(n));
    }
    const focused = candidates.filter((c) => adjacentToHit.has(coordKey(c)));
    if (focused.length > 0) candidates = focused;
  } else {
    // Parität nur im Suchmodus (keine offenen Treffer): Schachbrett-/Diagonalmuster.
    const minLen = Math.min(...living);
    const parity = candidates.filter((c) => (c.x + c.y) % minLen === 0);
    if (parity.length > 0) candidates = parity;
  }

  let best = -1;
  let bestCells: Coord[] = [];
  for (const c of candidates) {
    const d = density.get(coordKey(c)) ?? 0;
    if (d > best) {
      best = d;
      bestCells = [c];
    } else if (d === best) {
      bestCells.push(c);
    }
  }

  return { move: rng.pick(sortCoords(bestCells)) };
}
