import { CLASSIC_FLEET, DEFAULT_BOARD } from '@schiffe/engine';
import { describe, expect, it } from 'vitest';

import { settingsToGameConfig } from '../../src/game/game-config';

describe('settingsToGameConfig (data-model §2.1)', () => {
  it('übernimmt Standardfeld + klassische Flotte und reicht Optionen durch', () => {
    const cfg = settingsToGameConfig({ allowTouching: false, turnTimerSeconds: 15, extraTurnOnHit: false });
    expect(cfg.board).toBe(DEFAULT_BOARD);
    expect(cfg.fleet).toBe(CLASSIC_FLEET);
    expect(cfg.allowTouching).toBe(false);
    expect(cfg.extraTurnOnHit).toBe(false);
  });

  it('Timer-Dauer ist kein Engine-Begriff (taucht in GameConfig nicht auf)', () => {
    const cfg = settingsToGameConfig({ allowTouching: true, turnTimerSeconds: null, extraTurnOnHit: true });
    expect(Object.keys(cfg)).not.toContain('turnTimerSeconds');
  });
});
