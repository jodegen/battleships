import { createRng, shipCells, type Coord } from '@schiffe/engine';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useGameSession } from '@/hooks/useGameSession';
import { autoPlace, chooseDifficulty, createSession, startGame } from '@/session/controller';

describe('Session-Controller: resultId (FR-019)', () => {
  it('startGame setzt die injizierte resultId und sie bleibt stabil', () => {
    const s0 = autoPlace(chooseDifficulty(createSession(3), 'leicht'), createRng(3));
    const started = startGame(s0, createRng(4), 'fixed-result-id');
    expect(started.resultId).toBe('fixed-result-id');
    expect(started.phase).toBe('playing');
  });

  it('ohne resultId bleibt das Feld undefiniert (Rückwärtskompatibilität)', () => {
    const s0 = autoPlace(chooseDifficulty(createSession(3), 'leicht'), createRng(3));
    expect(startGame(s0, createRng(4)).resultId).toBeUndefined();
  });
});

describe('useGameSession: Ergebnis-Meldung genau einmal (FR-019/020)', () => {
  it('ruft onGameEnd genau einmal mit der stabilen resultId beim Spielende', () => {
    const onGameEnd = vi.fn();
    const { result } = renderHook(() =>
      useGameSession(9, 400, { onGameEnd, makeResultId: () => 'fixed-result-id' }),
    );

    act(() => result.current.chooseDifficulty('leicht'));
    act(() => result.current.autoPlace());
    act(() => result.current.startGame());

    // Der Mensch (A) trifft ausschließlich gegnerische Schiffsfelder → behält den Zug (Extrazug)
    // und versenkt alle B-Schiffe, ohne dass die KI je dran ist.
    const targets: Coord[] = result.current.state.game!.boards.B.ships.flatMap((ship) =>
      shipCells(ship),
    );
    for (const target of targets) {
      act(() => result.current.shoot(target));
    }

    expect(result.current.state.phase).toBe('finished');
    expect(result.current.state.outcome).toBe('won');
    expect(onGameEnd).toHaveBeenCalledTimes(1);
    expect(onGameEnd).toHaveBeenCalledWith({ resultId: 'fixed-result-id', outcome: 'won' });
  });
});
