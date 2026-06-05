import { DEFAULT_CONFIG } from '@schiffe/engine';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatusBar } from '@/components/StatusBar';
import type { GameSession } from '@/hooks/useGameSession';
import type { SessionState } from '@/session/types';

function fakeSession(outcome: 'won' | 'lost', restart = vi.fn()): GameSession {
  const state: SessionState = {
    phase: 'finished',
    config: DEFAULT_CONFIG,
    difficulty: 'schwer',
    seed: 1,
    draft: { ships: [] },
    game: null,
    turn: null,
    outcome,
  };
  // Nur die von StatusBar genutzten Felder sind relevant.
  return { state, restart } as unknown as GameSession;
}

describe('Spielende (Komponente)', () => {
  it('zeigt „Gewonnen" und bietet einen Neustart', () => {
    const restart = vi.fn();
    render(<StatusBar session={fakeSession('won', restart)} />);
    expect(screen.getByText(/Gewonnen/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Neues Spiel' }));
    expect(restart).toHaveBeenCalledOnce();
  });

  it('zeigt „Verloren" bei Niederlage', () => {
    render(<StatusBar session={fakeSession('lost')} />);
    expect(screen.getByText(/Verloren/)).toBeInTheDocument();
  });
});
