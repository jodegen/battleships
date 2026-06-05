import { describe, expect, it } from 'vitest';
import { chooseDifficulty, createSession, isAiTurn, restart } from '@/session/controller';

describe('Session-Grundgerüst', () => {
  it('createSession startet in der Schwierigkeitsphase mit Default-Config', () => {
    const s = createSession(123);
    expect(s.phase).toBe('difficulty');
    expect(s.config.board).toEqual({ width: 10, height: 10 });
    expect(s.seed).toBe(123);
    expect(s.draft.ships).toEqual([]);
    expect(s.game).toBeNull();
    expect(isAiTurn(s)).toBe(false);
  });

  it('chooseDifficulty wechselt zu placing und merkt die Stufe', () => {
    const s = chooseDifficulty(createSession(1), 'schwer');
    expect(s.phase).toBe('placing');
    expect(s.difficulty).toBe('schwer');
  });

  it('chooseDifficulty ist außerhalb der difficulty-Phase wirkungslos', () => {
    const placing = chooseDifficulty(createSession(1), 'leicht');
    expect(chooseDifficulty(placing, 'schwer')).toBe(placing);
  });

  it('restart erzeugt eine frische Sitzung', () => {
    const s = restart(7);
    expect(s.phase).toBe('difficulty');
    expect(s.seed).toBe(7);
    expect(s.draft.ships).toEqual([]);
  });
});
