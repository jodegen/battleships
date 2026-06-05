import { describe, expect, it } from 'vitest';
import { applyShot, createGame, getWinner, isOver } from '../../src/index';
import { fleetA, fleetB, tinyConfig } from '../helpers';

describe('Integration: vollständige Partie aus festen Aufstellungen', () => {
  it('A versenkt B Zelle für Zelle und gewinnt (Extrazug hält A am Zug)', () => {
    let state = createGame(tinyConfig, { A: fleetA, B: fleetB });

    // Alle Schiffszellen von B in fester Reihenfolge — lauter Treffer.
    const bCells = [
      { x: 2, y: 4 },
      { x: 3, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 0 },
      { x: 4, y: 1 },
    ];

    const outcomes: string[] = [];
    for (const t of bCells) {
      const r = applyShot(state, 'A', t);
      if ('rejected' in r) throw new Error(`Schuss auf ${t.x},${t.y} abgelehnt`);
      outcomes.push(r.result.outcome);
      state = r.state;
      expect(state.turn).toBe('A'); // bleibt durchgehend bei A
    }

    expect(outcomes).toEqual(['hit', 'hit', 'sunk', 'hit', 'sunk']);
    expect(isOver(state)).toBe(true);
    expect(getWinner(state)).toBe('A');
  });
});
