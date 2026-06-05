import { coordKey, createRng, shipCells, type Coord } from '@schiffe/engine';
import { describe, expect, it } from 'vitest';
import {
  aiStep,
  autoPlace,
  chooseDifficulty,
  createSession,
  opponentShots,
  playerShoot,
  startGame,
} from '@/session/controller';
import type { SessionState } from '@/session/types';

function startedGame(seed = 1): SessionState {
  return startGame(autoPlace(chooseDifficulty(createSession(seed), 'leicht'), createRng(seed)), createRng(seed + 1));
}

function bShipCellKeys(s: SessionState): Set<string> {
  return new Set(s.game!.boards.B.ships.flatMap((sh) => shipCells(sh).map(coordKey)));
}

function firstWater(s: SessionState): Coord {
  const ships = bShipCellKeys(s);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (!ships.has(`${x},${y}`)) return { x, y };
  throw new Error('kein Wasserfeld');
}

function firstShipCell(s: SessionState): Coord {
  return shipCells(s.game!.boards.B.ships[0]!)[0]!;
}

describe('Spielablauf (US2)', () => {
  it('Treffer hält den Spieler am Zug (Extrazug)', () => {
    const s = startedGame();
    const r = playerShoot(s, firstShipCell(s));
    expect(r.accepted).toBe(true);
    expect(['hit', 'sunk']).toContain(r.next.lastShot?.result.outcome);
    expect(r.next.turn).toBe('A');
  });

  it('Fehlschuss übergibt den Zug an die KI', () => {
    const s = startedGame();
    const r = playerShoot(s, firstWater(s));
    expect(r.accepted).toBe(true);
    expect(r.next.lastShot?.result.outcome).toBe('miss');
    expect(r.next.turn).toBe('B');
  });

  it('lehnt einen Schuss ab, wenn der Spieler nicht am Zug ist', () => {
    const s = startedGame();
    const afterMiss = playerShoot(s, firstWater(s)).next; // turn → B
    const r = playerShoot(afterMiss, firstShipCell(afterMiss));
    expect(r.accepted).toBe(false);
    expect(r.next).toBe(afterMiss);
  });

  it('lehnt einen bereits beschossenen Schuss ab', () => {
    const s = startedGame();
    const cell = firstShipCell(s);
    const afterHit = playerShoot(s, cell).next; // Treffer → bleibt A
    const r = playerShoot(afterHit, cell);
    expect(r.accepted).toBe(false);
  });

  it('aiStep führt genau einen KI-Schuss aus und verändert den Zustand', () => {
    const s = startedGame();
    const afterMiss = playerShoot(s, firstWater(s)).next; // turn → B
    const next = aiStep(afterMiss, createRng(99));
    expect(next).not.toBe(afterMiss);
    expect(next.lastShot?.by).toBe('B');
  });

  it('opponentShots enthält nur beschossene Felder, keine verdeckten Schiffe (FR-002)', () => {
    const s = startedGame();
    const cell = firstShipCell(s);
    const next = playerShoot(s, cell).next;
    const shots = opponentShots(next)!;
    expect(shots).toHaveLength(1);
    expect(shots[0]?.coord).toEqual(cell);
    // Anzahl bekannter Felder << Gesamtfelder → keine Offenlegung der Flotte.
    expect(shots.length).toBeLessThan(5);
  });
});
