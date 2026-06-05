import { describe, expect, it } from 'vitest';
import { applyShot, createGame, getWinner, isOver } from '../../src/game';
import { fleetA, fleetB, tinyConfig } from '../helpers';

describe('Siegerkennung', () => {
  it('erkennt den Sieger genau beim Versenken der letzten gegnerischen Zelle', () => {
    let state = createGame(tinyConfig, { A: fleetA, B: fleetB });
    const targets = [
      { x: 2, y: 4 },
      { x: 3, y: 4 },
      { x: 4, y: 4 }, // 3er-Schiff versenkt
      { x: 4, y: 0 },
    ];
    for (const t of targets) {
      const r = applyShot(state, 'A', t);
      if ('rejected' in r) throw new Error('unerwartet abgelehnt');
      state = r.state;
      expect(isOver(state)).toBe(false); // noch nicht gewonnen
    }
    const final = applyShot(state, 'A', { x: 4, y: 1 }); // letzte Zelle
    if ('rejected' in final) throw new Error('unerwartet abgelehnt');
    expect(final.result.outcome).toBe('sunk');
    expect(isOver(final.state)).toBe(true);
    expect(getWinner(final.state)).toBe('A');
  });

  it('hält Zustand & Sieger nach Spielende stabil', () => {
    let state = createGame(tinyConfig, { A: fleetA, B: fleetB });
    for (const t of [
      { x: 2, y: 4 },
      { x: 3, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 0 },
      { x: 4, y: 1 },
    ]) {
      const r = applyShot(state, 'A', t);
      if ('rejected' in r) throw new Error('x');
      state = r.state;
    }
    expect(getWinner(state)).toBe('A');
    expect(state.turn).toBe('A');
  });
});
