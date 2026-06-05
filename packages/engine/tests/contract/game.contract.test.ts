import { describe, expect, it } from 'vitest';
import { applyShot, createGame, currentTurn, getWinner, isOver, viewFor } from '../../src/index';
import { fleetA, fleetB, tinyConfig } from '../helpers';

describe('Contract: Spiel-API', () => {
  it('createGame startet in-progress mit Spieler A am Zug (FR-034)', () => {
    const state = createGame(tinyConfig, { A: fleetA, B: fleetB });
    expect(currentTurn(state)).toBe('A');
    expect(isOver(state)).toBe(false);
    expect(getWinner(state)).toBeNull();
  });

  it('createGame wirft bei ungültiger Flotte', () => {
    expect(() => createGame(tinyConfig, { A: [], B: fleetB })).toThrow();
  });

  it('applyShot liefert entweder {state,result} oder eine ShotRejection', () => {
    const state = createGame(tinyConfig, { A: fleetA, B: fleetB });
    const res = applyShot(state, 'A', { x: 0, y: 4 }); // Wasser
    expect('result' in res || 'rejected' in res).toBe(true);
  });

  it('applyShot mutiert den Eingabezustand nicht (Reinheit)', () => {
    const state = createGame(tinyConfig, { A: fleetA, B: fleetB });
    const snapshot = JSON.stringify(state);
    applyShot(state, 'A', { x: 2, y: 4 });
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('viewFor liefert eigene Sicht + Gegner-Schüsse', () => {
    const state = createGame(tinyConfig, { A: fleetA, B: fleetB });
    const view = viewFor(state, 'A');
    expect(view.own.ships.length).toBe(2);
    expect(view.opponent.shots).toEqual([]);
  });
});
