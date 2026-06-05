import { describe, expect, it } from 'vitest';
import { applyShot, createGame } from '../../src/game';
import { fleetA, fleetB, tinyConfig } from '../helpers';

describe('applyShot – Ablehnungen (Zustand bleibt unverändert)', () => {
  it('lehnt einen Schuss außerhalb des Felds ab', () => {
    const state = createGame(tinyConfig, { A: fleetA, B: fleetB });
    const res = applyShot(state, 'A', { x: 9, y: 9 });
    expect(res).toEqual({ rejected: true, reason: 'out-of-bounds' });
  });

  it('lehnt einen Schuss der nicht am Zug befindlichen Seite ab', () => {
    const state = createGame(tinyConfig, { A: fleetA, B: fleetB });
    const res = applyShot(state, 'B', { x: 0, y: 0 });
    expect(res).toEqual({ rejected: true, reason: 'not-your-turn' });
  });

  it('lehnt ein bereits beschossenes Feld ab', () => {
    const state = createGame(tinyConfig, { A: fleetA, B: fleetB });
    const r1 = applyShot(state, 'A', { x: 0, y: 4 }); // Wasser → Zug wechselt zu B
    if ('rejected' in r1) throw new Error('unerwartet abgelehnt');
    // B schießt daneben, zurück zu A
    const r2 = applyShot(r1.state, 'B', { x: 1, y: 4 });
    if ('rejected' in r2) throw new Error('unerwartet abgelehnt');
    // A schießt erneut auf dasselbe Feld (0,4)
    const r3 = applyShot(r2.state, 'A', { x: 0, y: 4 });
    expect(r3).toEqual({ rejected: true, reason: 'already-shot' });
  });

  it('lehnt Schüsse nach Spielende ab', () => {
    // A versenkt B komplett (alle Treffer → A bleibt am Zug).
    let state = createGame(tinyConfig, { A: fleetA, B: fleetB });
    const targets = [
      { x: 2, y: 4 },
      { x: 3, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 0 },
      { x: 4, y: 1 },
    ];
    for (const t of targets) {
      const r = applyShot(state, 'A', t);
      if ('rejected' in r) throw new Error('unerwartet abgelehnt');
      state = r.state;
    }
    const res = applyShot(state, 'A', { x: 0, y: 0 });
    expect(res).toEqual({ rejected: true, reason: 'game-over' });
  });
});
