'use client';

import { useEffect, useState } from 'react';

import type { LobbyView, PlayerId } from '../../realtime/socket-client';
import type { OpponentDisconnect } from '../../realtime/useOnlineGame';

/** Sekunden-Countdown, clientseitig aus der serverseitig bestimmten Deadline berechnet (FR-007). */
function Countdown({ deadline }: { deadline: number }): JSX.Element {
  const [remaining, setRemaining] = useState<number>(() => Math.max(0, deadline - Date.now()));
  useEffect(() => {
    const tick = (): void => setRemaining(Math.max(0, deadline - Date.now()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);
  return <>{Math.ceil(remaining / 1000)}</>;
}

/** Live-Status beider Spieler + Reconnect-Hinweise (FR-007/019, 005). */
export function OpponentStatus({
  lobby,
  you,
  opponentDisconnect,
  selfReconnecting,
}: {
  lobby: LobbyView;
  you: PlayerId | null;
  opponentDisconnect?: OpponentDisconnect | null;
  selfReconnecting?: boolean;
}): JSX.Element {
  return (
    <div>
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

      {opponentDisconnect && (
        <p role="status" style={{ color: '#c60', margin: '0.25rem 0' }}>
          Gegner getrennt – wartet (<Countdown deadline={opponentDisconnect.graceDeadline} /> s)
        </p>
      )}
      {selfReconnecting && (
        <p role="status" style={{ color: '#c60', margin: '0.25rem 0' }}>
          Verbindung verloren – neu verbinden …
        </p>
      )}
    </div>
  );
}
