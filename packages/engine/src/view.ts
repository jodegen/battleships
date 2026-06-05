// Fog-of-War-Sicht je Partei (FR-021). Legt niemals verdeckte Gegnerpositionen offen.

import { coordEquals, coordKey, shipCells } from './coords';
import type { GameState, OpponentShotView, PlayerId, PlayerView } from './types';

export function viewFor(state: GameState, player: PlayerId): PlayerView {
  const own = state.boards[player];
  const opp = player === 'A' ? 'B' : 'A';
  const oppBoard = state.boards[opp];

  const shipCellKeys = new Set<string>();
  for (const s of oppBoard.ships) {
    for (const c of shipCells(s)) shipCellKeys.add(coordKey(c));
  }

  const receivedKeys = new Set(oppBoard.shotsReceived.map(coordKey));

  const shots: OpponentShotView[] = oppBoard.shotsReceived.map((coord): OpponentShotView => {
    if (!shipCellKeys.has(coordKey(coord))) {
      return { coord, outcome: 'miss' };
    }
    const ship = oppBoard.ships.find((s) => shipCells(s).some((c) => coordEquals(c, coord)));
    // ship ist hier garantiert vorhanden (coord liegt auf einer Schiffszelle).
    const fullySunk = ship!.length > 0 && shipCells(ship!).every((c) => receivedKeys.has(coordKey(c)));
    return fullySunk
      ? { coord, outcome: 'sunk', sunkShip: { length: ship!.length } }
      : { coord, outcome: 'hit' };
  });

  return { own, opponent: { shots } };
}
