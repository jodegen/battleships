'use client';

import { useGameSession } from '@/hooks/useGameSession';
import { DifficultyPicker } from '@/components/DifficultyPicker';
import { PlacementBoard } from '@/components/PlacementBoard';
import { GameView } from '@/components/GameView';

// Fester Start-Seed; pro Neustart wird in useGameSession ein neuer Seed abgeleitet.
const INITIAL_SEED = 1;

export default function Page(): JSX.Element {
  const session = useGameSession(INITIAL_SEED);
  const { phase } = session.state;

  return (
    <main>
      <h1>Schiffe versenken — gegen die KI</h1>
      {phase === 'difficulty' && <DifficultyPicker onChoose={session.chooseDifficulty} />}
      {phase === 'placing' && <PlacementBoard session={session} />}
      {(phase === 'playing' || phase === 'finished') && <GameView session={session} />}
    </main>
  );
}
