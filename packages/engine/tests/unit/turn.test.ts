import { describe, expect, it } from 'vitest';
import { defineConfig } from '../../src/config';
import { applyShot, createGame } from '../../src/game';
import { fleetA, fleetB, tinyConfig } from '../helpers';

describe('Zugrecht & Extrazug-Regel', () => {
  it('extraTurnOnHit=true: derselbe Spieler bleibt nach einem Treffer am Zug', () => {
    const state = createGame(tinyConfig, { A: fleetA, B: fleetB });
    const res = applyShot(state, 'A', { x: 2, y: 4 }); // Treffer auf B
    if ('rejected' in res) throw new Error('unerwartet abgelehnt');
    expect(res.result.outcome).toBe('hit');
    expect(res.state.turn).toBe('A');
  });

  it('extraTurnOnHit=true: nach einem Fehlschuss wechselt der Zug', () => {
    const state = createGame(tinyConfig, { A: fleetA, B: fleetB });
    const res = applyShot(state, 'A', { x: 0, y: 4 }); // Wasser
    if ('rejected' in res) throw new Error('unerwartet abgelehnt');
    expect(res.result.outcome).toBe('miss');
    expect(res.state.turn).toBe('B');
  });

  it('extraTurnOnHit=true: bleibt auch nach "sunk" am Zug', () => {
    let state = createGame(tinyConfig, { A: fleetA, B: fleetB });
    const r1 = applyShot(state, 'A', { x: 4, y: 0 });
    if ('rejected' in r1) throw new Error('x');
    state = r1.state;
    const r2 = applyShot(state, 'A', { x: 4, y: 1 }); // versenkt 2er-Schiff von B
    if ('rejected' in r2) throw new Error('x');
    expect(r2.result.outcome).toBe('sunk');
    expect(r2.state.turn).toBe('A');
  });

  it('extraTurnOnHit=false: der Zug wechselt auch nach einem Treffer', () => {
    const cfg = defineConfig({
      board: { width: 5, height: 5 },
      fleet: { ships: [{ length: 3, count: 1 }, { length: 2, count: 1 }] },
      allowTouching: true,
      extraTurnOnHit: false,
    });
    const state = createGame(cfg, { A: fleetA, B: fleetB });
    const res = applyShot(state, 'A', { x: 2, y: 4 }); // Treffer
    if ('rejected' in res) throw new Error('unerwartet abgelehnt');
    expect(res.result.outcome).toBe('hit');
    expect(res.state.turn).toBe('B');
  });
});
