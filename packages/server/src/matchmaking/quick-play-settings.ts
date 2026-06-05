// Standard-Einstellungen für Quick-Play-Partien (006, FR-005). Reine Konstante, keine I/O.
// „Berührung erlaubt", Standard-Zug-Timer (30 s), „Treffer = Extrazug".

import type { LobbySettings } from '../realtime/events';

export const QUICK_PLAY_SETTINGS: LobbySettings = {
  allowTouching: true,
  turnTimerSeconds: 30,
  extraTurnOnHit: true,
};
