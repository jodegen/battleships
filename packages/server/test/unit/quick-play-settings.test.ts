import { describe, expect, it } from 'vitest';

import { QUICK_PLAY_SETTINGS } from '../../src/matchmaking/quick-play-settings';

describe('QUICK_PLAY_SETTINGS (006, FR-005)', () => {
  it('verwendet die Standard-Einstellungen: Berührung erlaubt, 30-s-Timer, Treffer=Extrazug', () => {
    expect(QUICK_PLAY_SETTINGS).toEqual({
      allowTouching: true,
      turnTimerSeconds: 30,
      extraTurnOnHit: true,
    });
  });
});
