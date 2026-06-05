import { describe, expect, it } from 'vitest';
import { validatePlacement } from '../../src/placement';
import type { ShipPlacement } from '../../src/types';
import { tinyConfig, tinyConfigNoTouch } from '../helpers';

// Schiff A: (0,0)(1,0)(2,0). Schiff B variiert.
const shipA: ShipPlacement = { length: 3, origin: { x: 0, y: 0 }, orientation: 'horizontal' };

describe('Berührungsregel', () => {
  it('allowTouching=true: orthogonal anliegende Schiffe sind erlaubt', () => {
    const ships: ShipPlacement[] = [
      shipA,
      { length: 2, origin: { x: 0, y: 1 }, orientation: 'horizontal' }, // (0,1)(1,1) berührt A
    ];
    expect(validatePlacement(tinyConfig, ships)).toEqual({ ok: true });
  });

  it('allowTouching=false: orthogonale Berührung wird abgelehnt', () => {
    const ships: ShipPlacement[] = [
      shipA,
      { length: 2, origin: { x: 0, y: 1 }, orientation: 'horizontal' }, // berührt A orthogonal
    ];
    expect(validatePlacement(tinyConfigNoTouch, ships)).toEqual({
      ok: false,
      reason: 'touching-forbidden',
    });
  });

  it('allowTouching=false: diagonale Berührung wird ebenfalls abgelehnt', () => {
    const ships: ShipPlacement[] = [
      shipA,
      { length: 2, origin: { x: 3, y: 1 }, orientation: 'horizontal' }, // (3,1)(4,1); (3,1) diagonal zu (2,0)
    ];
    expect(validatePlacement(tinyConfigNoTouch, ships)).toEqual({
      ok: false,
      reason: 'touching-forbidden',
    });
  });

  it('allowTouching=false: ausreichender Abstand wird akzeptiert', () => {
    const ships: ShipPlacement[] = [
      shipA,
      { length: 2, origin: { x: 0, y: 2 }, orientation: 'horizontal' }, // (0,2)(1,2): >=1 Feld Abstand
    ];
    expect(validatePlacement(tinyConfigNoTouch, ships)).toEqual({ ok: true });
  });
});
