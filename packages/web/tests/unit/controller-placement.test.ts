import { createRng } from '@schiffe/engine';
import { describe, expect, it } from 'vitest';
import {
  autoPlace,
  canStart,
  chooseDifficulty,
  createSession,
  placeShip,
  removeShip,
  rotateShip,
  startGame,
} from '@/session/controller';

function placing() {
  return chooseDifficulty(createSession(1), 'mittel');
}

describe('Platzierung (US1)', () => {
  it('übernimmt eine gültige Platzierung', () => {
    const s = placeShip(placing(), { length: 5, origin: { x: 0, y: 0 }, orientation: 'horizontal' });
    expect(s.draft.ships).toHaveLength(1);
  });

  it('lehnt eine Platzierung außerhalb des Felds ab (Zustand unverändert)', () => {
    const base = placing();
    const s = placeShip(base, { length: 5, origin: { x: 9, y: 0 }, orientation: 'horizontal' });
    expect(s).toBe(base);
  });

  it('lehnt Überlappung ab', () => {
    let s = placeShip(placing(), { length: 5, origin: { x: 0, y: 0 }, orientation: 'horizontal' });
    const before = s;
    s = placeShip(s, { length: 4, origin: { x: 2, y: 0 }, orientation: 'horizontal' }); // überlappt (2,0)
    expect(s).toBe(before);
  });

  it('lehnt mehr Schiffe einer Länge ab, als die Flotte vorsieht', () => {
    let s = placeShip(placing(), { length: 5, origin: { x: 0, y: 0 }, orientation: 'horizontal' });
    const before = s;
    s = placeShip(s, { length: 5, origin: { x: 0, y: 2 }, orientation: 'horizontal' }); // nur 1×5 erlaubt
    expect(s).toBe(before);
  });

  it('rotateShip dreht ein platziertes Schiff, lehnt aber raus-ragende Drehung ab', () => {
    let s = placeShip(placing(), { length: 5, origin: { x: 0, y: 0 }, orientation: 'horizontal' });
    s = rotateShip(s, 0);
    expect(s.draft.ships[0]?.orientation).toBe('vertical');

    // An den rechten Rand legen, dann Drehung würde aus dem Feld ragen → unverändert.
    let s2 = placeShip(placing(), { length: 4, origin: { x: 0, y: 9 }, orientation: 'horizontal' });
    const before = s2;
    s2 = rotateShip(s2, 0); // vertikal ab y=9 mit Länge 4 → out of bounds
    expect(s2).toBe(before);
  });

  it('erlaubt alle drei Schiffe der Länge 3 (count-Feld der Flotte beachtet)', () => {
    let s = placing();
    s = placeShip(s, { length: 3, origin: { x: 0, y: 0 }, orientation: 'horizontal' });
    s = placeShip(s, { length: 3, origin: { x: 0, y: 2 }, orientation: 'horizontal' });
    s = placeShip(s, { length: 3, origin: { x: 0, y: 4 }, orientation: 'horizontal' });
    expect(s.draft.ships.filter((sh) => sh.length === 3)).toHaveLength(3);
    // ein viertes Längen-3-Schiff übersteigt die Flotte → abgelehnt.
    const before = s;
    s = placeShip(s, { length: 3, origin: { x: 0, y: 6 }, orientation: 'horizontal' });
    expect(s).toBe(before);
  });

  it('removeShip entfernt ein Schiff', () => {
    let s = placeShip(placing(), { length: 5, origin: { x: 0, y: 0 }, orientation: 'horizontal' });
    s = removeShip(s, 0);
    expect(s.draft.ships).toHaveLength(0);
  });

  it('autoPlace erzeugt eine vollständige, startbare Flotte', () => {
    const s = autoPlace(placing(), createRng(42));
    expect(canStart(s)).toBe(true);
  });

  it('startGame ist nur mit gültiger Flotte möglich und wechselt zu playing', () => {
    const notReady = placing();
    expect(startGame(notReady, createRng(1))).toBe(notReady); // leer → kein Start

    const ready = autoPlace(placing(), createRng(42));
    const started = startGame(ready, createRng(7));
    expect(started.phase).toBe('playing');
    expect(started.game).not.toBeNull();
    expect(started.turn).toBe('A');
  });
});
