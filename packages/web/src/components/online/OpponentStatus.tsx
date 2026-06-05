'use client';

import type { LobbyView, PlayerId } from '../../realtime/socket-client';

/** Live-Status beider Spieler (verbunden, platziert, am Zug) — FR-019. */
export function OpponentStatus({ lobby, you }: { lobby: LobbyView; you: PlayerId | null }): JSX.Element {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0' }}>
      {lobby.players.map((p) => {
        const isYou = p.playerId === you;
        const atTurn = lobby.turn === p.playerId;
        return (
          <li key={p.seat}>
            {p.connected ? '🟢' : '⚪'} <strong>{p.displayName}</strong>
            {isYou ? ' (du)' : ''} {p.isGuest ? '· Gast' : ''}
            {' · '}
            {p.placed ? 'Schiffe platziert' : 'platziert noch …'}
            {atTurn ? ' · am Zug' : ''}
          </li>
        );
      })}
    </ul>
  );
}
