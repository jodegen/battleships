// Fog of War (FR-013, SC-003): der EINZIGE Pfad vom kanonischen GameState zu einer
// client-gerichteten Brettsicht. Nutzt ausschließlich engine `viewFor` — verdeckte
// gegnerische Schiffe können strukturell nicht durchsickern.

import { type GameState, type PlayerId, viewFor } from '@schiffe/engine';

import type { GameViewMsg } from '../realtime/events';

export function projectGameView(
  code: string,
  state: GameState,
  player: PlayerId,
  turnDeadline: number | null,
): GameViewMsg {
  const view = viewFor(state, player);
  return {
    code,
    you: player,
    own: { ships: view.own.ships, shotsReceived: view.own.shotsReceived },
    opponentShots: view.opponent.shots,
    turn: state.turn,
    turnDeadline,
  };
}
