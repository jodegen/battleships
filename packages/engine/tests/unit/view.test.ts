import { describe, expect, it } from 'vitest';
import { coordKey } from '../../src/coords';
import { applyShot, createGame } from '../../src/game';
import { shipCells } from '../../src/coords';
import { viewFor } from '../../src/view';
import { fleetA, fleetB, tinyConfig } from '../helpers';

describe('viewFor – Fog of War (FR-021)', () => {
  it('zeigt eigene Schiffe vollständig', () => {
    const state = createGame(tinyConfig, { A: fleetA, B: fleetB });
    const view = viewFor(state, 'A');
    expect(view.own.ships).toHaveLength(2);
  });

  it('zeigt nur Ergebnisse der eigenen Schüsse auf den Gegner, keine verdeckten Positionen', () => {
    let state = createGame(tinyConfig, { A: fleetA, B: fleetB });
    const r1 = applyShot(state, 'A', { x: 2, y: 4 }); // Treffer auf B
    if ('rejected' in r1) throw new Error('x');
    state = r1.state;

    const view = viewFor(state, 'A');
    // Genau ein bekanntes Schussergebnis, und zwar ein Treffer.
    expect(view.opponent.shots).toHaveLength(1);
    expect(view.opponent.shots[0]).toMatchObject({ coord: { x: 2, y: 4 }, outcome: 'hit' });

    // Keine unbeschossene Gegner-Schiffszelle ist über die Sicht rekonstruierbar.
    const revealed = new Set(view.opponent.shots.map((s) => coordKey(s.coord)));
    const hiddenShipCells = fleetB
      .flatMap((s) => shipCells(s))
      .filter((c) => !(c.x === 2 && c.y === 4));
    for (const c of hiddenShipCells) {
      expect(revealed.has(coordKey(c))).toBe(false);
    }
  });

  it('meldet sunk inkl. Länge in der Gegner-Sicht', () => {
    let state = createGame(tinyConfig, { A: fleetA, B: fleetB });
    for (const t of [{ x: 4, y: 0 }, { x: 4, y: 1 }]) {
      const r = applyShot(state, 'A', t);
      if ('rejected' in r) throw new Error('x');
      state = r.state;
    }
    const view = viewFor(state, 'A');
    // Ist ein Schiff versenkt, werden ALLE seine Zellen als 'sunk' ausgewiesen (aktueller Stand);
    // wichtig für die KI, damit versenkte Zellen nicht als offene Treffer gelten.
    const sunkShots = view.opponent.shots.filter((s) => s.outcome === 'sunk');
    expect(sunkShots).toHaveLength(2);
    for (const s of sunkShots) expect(s.sunkShip).toEqual({ length: 2 });
    expect(view.opponent.shots.some((s) => s.outcome === 'hit')).toBe(false);
  });
});
