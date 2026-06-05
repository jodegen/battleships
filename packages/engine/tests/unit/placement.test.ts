import { describe, expect, it } from 'vitest';
import { validatePlacement } from '../../src/placement';
import type { ShipPlacement } from '../../src/types';
import { fleetA, tinyConfig } from '../helpers';

describe('validatePlacement – Basisregeln', () => {
  it('akzeptiert eine vollständige, gültige Flotte', () => {
    expect(validatePlacement(tinyConfig, fleetA)).toEqual({ ok: true });
  });

  it('lehnt ein Schiff außerhalb des Felds ab', () => {
    const ships: ShipPlacement[] = [
      { length: 3, origin: { x: 3, y: 0 }, orientation: 'horizontal' }, // (3,0)(4,0)(5,0) -> out
      { length: 2, origin: { x: 0, y: 2 }, orientation: 'vertical' },
    ];
    expect(validatePlacement(tinyConfig, ships)).toEqual({ ok: false, reason: 'out-of-bounds' });
  });

  it('lehnt überlappende Schiffe ab', () => {
    const ships: ShipPlacement[] = [
      { length: 3, origin: { x: 0, y: 0 }, orientation: 'horizontal' }, // (0,0)(1,0)(2,0)
      { length: 2, origin: { x: 2, y: 0 }, orientation: 'horizontal' }, // (2,0)(3,0) -> overlap at (2,0)
    ];
    expect(validatePlacement(tinyConfig, ships)).toEqual({ ok: false, reason: 'overlap' });
  });

  it('lehnt eine falsche Flottenzusammensetzung ab (zu wenige Schiffe)', () => {
    const ships: ShipPlacement[] = [{ length: 3, origin: { x: 0, y: 0 }, orientation: 'horizontal' }];
    expect(validatePlacement(tinyConfig, ships)).toEqual({ ok: false, reason: 'fleet-mismatch' });
  });

  it('lehnt falsche Schiffslängen ab', () => {
    const ships: ShipPlacement[] = [
      { length: 4, origin: { x: 0, y: 0 }, orientation: 'horizontal' },
      { length: 2, origin: { x: 0, y: 2 }, orientation: 'vertical' },
    ];
    expect(validatePlacement(tinyConfig, ships)).toEqual({ ok: false, reason: 'fleet-mismatch' });
  });
});
