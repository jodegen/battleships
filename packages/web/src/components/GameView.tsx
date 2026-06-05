'use client';

import { useMemo } from 'react';
import type { GameSession } from '@/hooks/useGameSession';
import { ownGrid, targetGrid } from '@/session/board-view';
import { opponentShots, ownView } from '@/session/controller';
import { StatusBar } from './StatusBar';

export function GameView({ session }: { session: GameSession }): JSX.Element {
  const { state } = session;
  const { width } = state.config.board;

  const own = useMemo(() => {
    const board = ownView(state);
    return board ? ownGrid(board) : null;
  }, [state]);

  const target = useMemo(() => {
    const shots = opponentShots(state);
    return shots ? targetGrid(state.config.board, shots) : null;
  }, [state]);

  const youAreUp = state.phase === 'playing' && state.turn === 'A';

  return (
    <section>
      <StatusBar session={session} />

      <div className="boards">
        <div>
          <h2>Gegner</h2>
          <div
            className="board"
            role="grid"
            aria-label="Gegnerfeld"
            style={{ gridTemplateColumns: `repeat(${width}, 1.6rem)` }}
          >
            {target?.flatMap((row, y) =>
              row.map((cell, x) => (
                <button
                  key={`t-${x},${y}`}
                  type="button"
                  role="gridcell"
                  className={`cell ${cell}`}
                  aria-label={`Gegnerfeld ${x},${y}: ${cell}`}
                  disabled={!youAreUp || cell !== 'unknown'}
                  onClick={() => session.shoot({ x, y })}
                />
              )),
            )}
          </div>
        </div>

        <div>
          <h2>Eigenes Feld</h2>
          <div
            className="board"
            role="grid"
            aria-label="Eigenes Feld"
            style={{ gridTemplateColumns: `repeat(${width}, 1.6rem)` }}
          >
            {own?.flatMap((row, y) =>
              row.map((cell, x) => (
                <div
                  key={`o-${x},${y}`}
                  role="gridcell"
                  className={`cell ${cell}`}
                  aria-label={`Eigenes Feld ${x},${y}: ${cell}`}
                />
              )),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
