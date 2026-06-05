// Gemeinsame KI-Helfer. Die KI sieht ausschließlich die Fog-of-War-Perspektive (Prinzip I).

import { coordKey } from '../coords';
import type { Coord, GameState, PlayerId, ShotOutcome } from '../types';
import { viewFor } from '../view';

export interface AiKnowledge {
  /** Outcome je beschossenem Feld (Sicht der schießenden Seite). */
  readonly shotOutcome: Map<string, ShotOutcome>;
  /** Versenkte Schiffe nach Länge → Anzahl. */
  readonly sunkByLength: Map<number, number>;
}

export function knowledgeFor(state: GameState, by: PlayerId): AiKnowledge {
  const view = viewFor(state, by);
  const shotOutcome = new Map<string, ShotOutcome>();
  // Ein versenktes Schiff der Länge L liefert L 'sunk'-Zellen in der Sicht. Wir zählen daher
  // zuerst die 'sunk'-Zellen je Länge und teilen durch die Länge → Anzahl versenkter Schiffe.
  const sunkCellsByLength = new Map<number, number>();
  for (const s of view.opponent.shots) {
    shotOutcome.set(coordKey(s.coord), s.outcome);
    if (s.outcome === 'sunk' && s.sunkShip) {
      sunkCellsByLength.set(s.sunkShip.length, (sunkCellsByLength.get(s.sunkShip.length) ?? 0) + 1);
    }
  }
  const sunkByLength = new Map<number, number>();
  for (const [length, cells] of sunkCellsByLength) {
    sunkByLength.set(length, Math.floor(cells / length));
  }
  return { shotOutcome, sunkByLength };
}

export function unshotCells(state: GameState, knowledge: AiKnowledge): Coord[] {
  const size = state.config.board;
  const res: Coord[] = [];
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      if (!knowledge.shotOutcome.has(`${x},${y}`)) res.push({ x, y });
    }
  }
  return res;
}

/** Offene Treffer: getroffene, aber noch nicht versenkte Felder. */
export function openHits(knowledge: AiKnowledge): Coord[] {
  const res: Coord[] = [];
  for (const [key, outcome] of knowledge.shotOutcome) {
    if (outcome === 'hit') {
      const comma = key.indexOf(',');
      res.push({ x: Number(key.slice(0, comma)), y: Number(key.slice(comma + 1)) });
    }
  }
  return res;
}

/** Noch lebende Schiffslängen = Flotte minus versenkte (Längen aus FR-031). */
export function livingShipLengths(state: GameState, knowledge: AiKnowledge): number[] {
  const living: number[] = [];
  for (const { length, count } of state.config.fleet.ships) {
    const sunk = knowledge.sunkByLength.get(length) ?? 0;
    for (let i = 0; i < count - sunk; i++) living.push(length);
  }
  return living;
}

/** Deterministische Auswahl: sortiert die Kandidaten stabil und wählt via injizierter RNG. */
export function sortCoords(coords: Coord[]): Coord[] {
  return [...coords].sort((a, b) => a.y - b.y || a.x - b.x);
}

export function dedupeCoords(coords: Coord[]): Coord[] {
  const seen = new Set<string>();
  const res: Coord[] = [];
  for (const c of coords) {
    const k = coordKey(c);
    if (!seen.has(k)) {
      seen.add(k);
      res.push(c);
    }
  }
  return res;
}
