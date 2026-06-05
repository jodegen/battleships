'use client';

import { useCallback } from 'react';

import { api } from '@/api/client';
import { useIdentity } from '@/auth/useIdentity';
import { AuthPanel } from '@/components/AuthPanel';
import { DifficultyPicker } from '@/components/DifficultyPicker';
import { GameView } from '@/components/GameView';
import { PlacementBoard } from '@/components/PlacementBoard';
import { AI_DELAY_MS, useGameSession, type GameEndResult } from '@/hooks/useGameSession';

// Fester Start-Seed; pro Neustart wird in useGameSession ein neuer Seed abgeleitet.
const INITIAL_SEED = 1;

export default function Page(): JSX.Element {
  const identity = useIdentity();
  const isUser = identity.identity.kind === 'user';
  const { refreshStats } = identity;

  // Bei Spielende das Ergebnis melden — nur wenn eingeloggt (Gäste: keine Persistenz, FR-014).
  const onGameEnd = useCallback(
    ({ resultId, outcome }: GameEndResult) => {
      if (!isUser) return;
      void api
        .reportMatchResult(resultId, outcome === 'won' ? 'win' : 'loss')
        .then(() => refreshStats())
        .catch(() => undefined);
    },
    [isUser, refreshStats],
  );

  const session = useGameSession(INITIAL_SEED, AI_DELAY_MS, { onGameEnd });
  const { phase } = session.state;

  return (
    <main>
      <h1>Schiffe versenken — gegen die KI</h1>
      <AuthPanel identity={identity} />
      {phase === 'difficulty' && <DifficultyPicker onChoose={session.chooseDifficulty} />}
      {phase === 'placing' && <PlacementBoard session={session} />}
      {(phase === 'playing' || phase === 'finished') && <GameView session={session} />}
    </main>
  );
}
