// Reine Abbildung Lobby-Einstellungen → engine `GameConfig` (data-model.md §2.1).
// Standardvariante: 10×10-Feld + klassische Flotte; Timer ist KEIN Engine-Begriff.

import { CLASSIC_FLEET, DEFAULT_BOARD, type GameConfig } from '@schiffe/engine';

import type { LobbySettings } from '../realtime/events';

export function settingsToGameConfig(settings: LobbySettings): GameConfig {
  return {
    board: DEFAULT_BOARD,
    fleet: CLASSIC_FLEET,
    allowTouching: settings.allowTouching,
    extraTurnOnHit: settings.extraTurnOnHit,
  };
}
