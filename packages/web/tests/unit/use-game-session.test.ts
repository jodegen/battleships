import { coordKey, shipCells, type Coord } from '@schiffe/engine';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameSession } from '@/hooks/useGameSession';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function firstWater(ships: Set<string>): Coord {
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (!ships.has(`${x},${y}`)) return { x, y };
  throw new Error('kein Wasserfeld');
}

describe('useGameSession – KI-Pacing (FR-020)', () => {
  it('spielt KI-Schüsse erst nach der Verzögerung ab', () => {
    const DELAY = 50;
    const { result } = renderHook(() => useGameSession(1, DELAY));

    act(() => result.current.chooseDifficulty('leicht'));
    act(() => result.current.autoPlace());
    act(() => result.current.startGame());

    const bShips = new Set(result.current.state.game!.boards.B.ships.flatMap((s) => shipCells(s).map(coordKey)));
    act(() => result.current.shoot(firstWater(bShips))); // Fehlschuss → KI am Zug
    expect(result.current.state.turn).toBe('B');

    const gameBefore = result.current.state.game;
    act(() => vi.advanceTimersByTime(DELAY - 10)); // noch nicht
    expect(result.current.state.game).toBe(gameBefore);

    act(() => vi.advanceTimersByTime(20)); // jetzt zieht die KI
    expect(result.current.state.game).not.toBe(gameBefore);
    expect(result.current.state.lastShot?.by).toBe('B');
  });
});
