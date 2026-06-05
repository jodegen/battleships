'use client';

// Online-PvP-Flow (M3/004), bewusst schlicht: Lobby → Platzierung → Echtzeit-Brett.
// Der Server ist autoritativ; diese Seite zeigt nur an und sendet Intents.

import { CLASSIC_FLEET, createRng, DEFAULT_BOARD, generateFleet } from '@schiffe/engine';
import { useMemo, useState } from 'react';

import { useIdentity } from '../../src/auth/useIdentity';
import { LobbyPanel } from '../../src/components/online/LobbyPanel';
import { OnlineBoards } from '../../src/components/online/OnlineBoards';
import { OpponentStatus } from '../../src/components/online/OpponentStatus';
import { QuickPlayPanel } from '../../src/components/online/QuickPlayPanel';
import { TurnTimer } from '../../src/components/online/TurnTimer';
import { useOnlineGame } from '../../src/realtime/useOnlineGame';
import type { ShipPlacement } from '../../src/realtime/socket-client';

function randomFleet(allowTouching: boolean): ShipPlacement[] {
  const cfg = { board: DEFAULT_BOARD, fleet: CLASSIC_FLEET, allowTouching, extraTurnOnHit: true };
  const seed = Math.floor(Math.random() * 1_000_000) + 1;
  for (let s = seed; s < seed + 50; s++) {
    const f = generateFleet(cfg, createRng(s));
    if (f.ok) return f.ships;
  }
  throw new Error('Konnte keine Aufstellung erzeugen');
}

export default function OnlinePage(): JSX.Element {
  const { identity } = useIdentity();
  const game = useOnlineGame();
  const [placedSent, setPlacedSent] = useState(false);

  const isGuest = identity?.kind === 'guest';
  const isLoggedIn = identity?.kind === 'user';
  const myName = identity && identity.kind !== 'anonymous' ? identity.displayName : null;
  const you = game.view?.you ?? game.lobby?.players.find((p) => p.displayName === myName)?.playerId ?? null;
  const myTurn = Boolean(game.view && game.lobby?.turn === game.view.you);

  const status = game.lobby?.status ?? null;
  const code = game.lobby?.code;

  const headerStatus = useMemo(() => {
    if (!game.connected) return 'Verbinde …';
    if (!game.lobby) return 'Keine Lobby';
    return `Lobby ${game.lobby.code} · ${game.lobby.status}`;
  }, [game.connected, game.lobby]);

  async function submitRandomFleet(): Promise<void> {
    const allowTouching = game.lobby?.settings.allowTouching ?? true;
    const ok = await game.placeFleet(randomFleet(allowTouching));
    if (ok) setPlacedSent(true);
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Online spielen (PvP)</h1>
      <p>{headerStatus}</p>

      {!game.lobby && (
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          {/* Quick Play nur für eingeloggte Spieler (FR-001); Gäste spielen PvP per Code. */}
          {isLoggedIn && (
            <QuickPlayPanel
              searching={game.searching}
              noMatch={game.noMatch}
              onFind={() => void game.findMatch()}
              onCancel={() => game.cancelSearch()}
            />
          )}
          <LobbyPanel
            isGuest={Boolean(isGuest)}
            error={game.error}
            onCreate={(s) => void game.createLobby(s)}
            onJoin={(c, name) => void game.joinLobby(c, name)}
          />
        </div>
      )}

      {game.lobby && (
        <>
          {code && (
            <p>
              Code zum Teilen: <strong>{code}</strong>
            </p>
          )}
          <OpponentStatus
            lobby={game.lobby}
            you={you}
            opponentDisconnect={game.opponentDisconnect}
            selfReconnecting={game.selfReconnecting}
          />
        </>
      )}

      {status === 'placing' && (
        <section>
          <h3>Schiffe platzieren</h3>
          <button onClick={() => void submitRandomFleet()} disabled={placedSent}>
            {placedSent ? 'Warte auf Gegner …' : 'Zufällige Aufstellung bestätigen'}
          </button>
        </section>
      )}

      {(status === 'in_progress' || status === 'finished') && game.view && (
        <section>
          <p>
            {game.over
              ? game.over.winner === game.view.you
                ? `🏆 Du hast gewonnen (${game.over.reason})`
                : `Niederlage (${game.over.reason})`
              : myTurn
                ? 'Du bist am Zug.'
                : 'Gegner ist am Zug.'}{' '}
            {!game.over && <TurnTimer deadline={game.turnDeadline} />}
          </p>
          <OnlineBoards view={game.view} canFire={myTurn && !game.over} onFire={(t) => void game.fireShot(t)} />
        </section>
      )}

      {game.error && <p style={{ color: '#c33' }}>Fehler: {game.error}</p>}
    </main>
  );
}
