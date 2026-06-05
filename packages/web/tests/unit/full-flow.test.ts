import { coordKey, createRng, shipCells } from '@schiffe/engine';
import { describe, expect, it } from 'vitest';
import {
  autoPlace,
  chooseDifficulty,
  createSession,
  playerShoot,
  startGame,
} from '@/session/controller';
import { DIFFICULTIES } from '@/session/types';

describe('Integration: vollständiger Ablauf je Stufe (SC-003/005)', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`Stufe "${difficulty}" lässt sich deterministisch bis zum Sieg durchspielen`, () => {
      let s = chooseDifficulty(createSession(11), difficulty);
      s = autoPlace(s, createRng(11));
      s = startGame(s, createRng(12));
      expect(s.phase).toBe('playing');

      const cells = s.game!.boards.B.ships.flatMap((sh) => shipCells(sh));
      const seen = new Set<string>();
      for (const c of cells) {
        if (seen.has(coordKey(c))) continue;
        seen.add(coordKey(c));
        const r = playerShoot(s, c);
        if (r.accepted) s = r.next;
      }

      expect(s.phase).toBe('finished');
      expect(s.outcome).toBe('won');
    });
  }
});
