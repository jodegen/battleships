import { applyShot, createGame, createRng, generateFleet, shipCells } from '@schiffe/engine';
import { describe, expect, it } from 'vitest';

import { settingsToGameConfig } from '../../src/game/game-config';
import { projectGameView } from '../../src/game/fog-of-war';

const cfg = settingsToGameConfig({ allowTouching: true, turnTimerSeconds: 30, extraTurnOnHit: true });

function game() {
  const a = generateFleet(cfg, createRng(7));
  const b = generateFleet(cfg, createRng(99));
  if (!a.ok || !b.ok) throw new Error('Fleet-Generierung fehlgeschlagen');
  return { state: createGame(cfg, { A: a.ships, B: b.ships }), fleetA: a.ships, fleetB: b.ships };
}

describe('Fog of War — projectGameView (FR-013, SC-003)', () => {
  it('zeigt dem Spieler nur seine eigene Flotte; Gegner-Channel ist anfangs leer', () => {
    const { state, fleetA } = game();
    const view = projectGameView('C', state, 'A', 123);
    expect(view.own.ships).toEqual(fleetA);
    expect(view.opponentShots).toEqual([]);
    expect(view.turnDeadline).toBe(123);
    // Strukturell: die Nutzlast hat exakt diese Felder — kein Gegner-Board.
    expect(Object.keys(view).sort()).toEqual(
      ['code', 'opponentShots', 'own', 'turn', 'turnDeadline', 'you'].sort(),
    );
  });

  it('leakt KEINE ungetroffenen gegnerischen Schiffszellen, auch nach Schüssen', () => {
    const { state, fleetB } = game();
    const bCells = fleetB.flatMap((s) => shipCells(s));

    // A trifft zwei Zellen des größten (zuerst platzierten) Schiffes → bleibt am Zug.
    let st = state;
    for (const target of [bCells[0], bCells[1]]) {
      const r = applyShot(st, 'A', target);
      expect('state' in r).toBe(true);
      if ('state' in r) st = r.state;
    }

    const view = projectGameView('C', st, 'A', null);
    const shotKeys = new Set(view.opponentShots.map((s) => `${s.coord.x},${s.coord.y}`));
    const targeted = new Set([bCells[0], bCells[1]].map((c) => `${c.x},${c.y}`));

    // Sichtbar sind ausschließlich die tatsächlich beschossenen Zellen.
    expect([...shotKeys].sort()).toEqual([...targeted].sort());
    // Keine einzige UNgetroffene B-Schiffszelle taucht im Gegner-Channel auf.
    for (const c of bCells.slice(2)) {
      expect(shotKeys.has(`${c.x},${c.y}`)).toBe(false);
    }
  });
});
