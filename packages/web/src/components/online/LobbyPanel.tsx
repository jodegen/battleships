'use client';

import { useState } from 'react';

import type { LobbySettings, TurnTimerSeconds } from '../../realtime/socket-client';

/** Lobby erstellen (mit Einstellungen) oder per Code beitreten (FR-001/003/005). */
export function LobbyPanel({
  onCreate,
  onJoin,
  isGuest,
  error,
}: {
  onCreate: (settings: LobbySettings) => void;
  onJoin: (code: string, guestName?: string) => void;
  isGuest: boolean;
  error: string | null;
}): JSX.Element {
  const [allowTouching, setAllowTouching] = useState(true);
  const [timer, setTimer] = useState<TurnTimerSeconds>(30);
  const [extraTurn, setExtraTurn] = useState(true);
  const [code, setCode] = useState('');
  const [guestName, setGuestName] = useState('');

  return (
    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
      {!isGuest && (
        <section>
          <h3>Lobby erstellen</h3>
          <label>
            <input type="checkbox" checked={allowTouching} onChange={(e) => setAllowTouching(e.target.checked)} />{' '}
            Berührung erlaubt
          </label>
          <br />
          <label>
            Zug-Timer:{' '}
            <select
              value={String(timer)}
              onChange={(e) => setTimer(e.target.value === 'null' ? null : (Number(e.target.value) as TurnTimerSeconds))}
            >
              <option value="15">15 s</option>
              <option value="30">30 s</option>
              <option value="60">60 s</option>
              <option value="null">aus</option>
            </select>
          </label>
          <br />
          <label>
            <input type="checkbox" checked={extraTurn} onChange={(e) => setExtraTurn(e.target.checked)} /> Treffer =
            Extrazug
          </label>
          <br />
          <button onClick={() => onCreate({ allowTouching, turnTimerSeconds: timer, extraTurnOnHit: extraTurn })}>
            Lobby erstellen
          </button>
        </section>
      )}

      <section>
        <h3>Lobby beitreten</h3>
        <label>
          Code: <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="7K3-Q9X" />
        </label>
        <br />
        {isGuest && (
          <label>
            Gast-Name: <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Dein Name" />
          </label>
        )}
        <br />
        <button onClick={() => onJoin(code, isGuest ? guestName : undefined)} disabled={!code}>
          Beitreten
        </button>
      </section>

      {error && <p style={{ color: '#c33', width: '100%' }}>Fehler: {error}</p>}
    </div>
  );
}
