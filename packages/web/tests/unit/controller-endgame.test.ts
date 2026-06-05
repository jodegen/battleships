import { coordKey, createRng, shipCells } from '@schiffe/engine';
import { describe, expect, it } from 'vitest';
import {
  autoPlace,
  chooseDifficulty,
  createSession,
  playerShoot,
  restart,
  startGame,
} from '@/session/controller';
import type { SessionState } from '@/session/types';

/** Spieler beschießt alle B-Schiffszellen (lauter Treffer → Extrazug) und gewinnt. */
function playToWin(seed: number): SessionState {
  let s = startGame(autoPlace(chooseDifficulty(createSession(seed), 'schwer'), createRng(seed)), createRng(seed + 1));
  const cells = s.game!.boards.B.ships.flatMap((sh) => shipCells(sh));
  // nach coordKey deduplizieren (Schiffe überlappen nicht, aber sicher ist sicher)
  const seen = new Set<string>();
  for (const c of cells) {
    if (seen.has(coordKey(c))) continue;
    seen.add(coordKey(c));
    const r = playerShoot(s, c);
    if (r.accepted) s = r.next;
  }
  return s;
}

describe('Spielende & Neustart (US3)', () => {
  it('erkennt den Sieg, wenn alle gegnerischen Schiffe versenkt sind', () => {
    const s = playToWin(5);
    expect(s.phase).toBe('finished');
    expect(s.outcome).toBe('won');
  });

  it('blockiert weitere Schüsse nach Spielende', () => {
    const s = playToWin(5);
    const r = playerShoot(s, { x: 0, y: 0 });
    expect(r.accepted).toBe(false);
    expect(r.next).toBe(s);
  });

  it('restart setzt auf die Schwierigkeitsphase zurück', () => {
    const fresh = restart(123);
    expect(fresh.phase).toBe('difficulty');
    expect(fresh.game).toBeNull();
    expect(fresh.draft.ships).toEqual([]);
  });
});
