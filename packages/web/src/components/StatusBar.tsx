import type { GameSession } from '@/hooks/useGameSession';

export function StatusBar({ session }: { session: GameSession }): JSX.Element {
  const { state } = session;

  if (state.phase === 'finished') {
    return (
      <section className="status">
        <strong>{state.outcome === 'won' ? 'Gewonnen! 🎉' : 'Verloren.'}</strong>
        <button type="button" onClick={() => session.restart()}>
          Neues Spiel
        </button>
      </section>
    );
  }

  if (state.phase === 'playing') {
    const youAreUp = state.turn === 'A';
    return (
      <section className="status">
        <span>{youAreUp ? 'Du bist am Zug.' : 'KI ist am Zug …'}</span>
      </section>
    );
  }

  return <section className="status" />;
}
