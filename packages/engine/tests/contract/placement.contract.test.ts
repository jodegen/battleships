import { describe, expect, it } from 'vitest';
import { createRng, defineConfig, generateFleet, validatePlacement } from '../../src/index';
import { fleetA, tinyConfig } from '../helpers';

describe('Contract: Platzierungs-API', () => {
  it('validatePlacement liefert ein PlacementResult mit ok-Flag', () => {
    const result = validatePlacement(tinyConfig, fleetA);
    expect(result).toHaveProperty('ok');
    expect(result.ok).toBe(true);
  });

  it('validatePlacement liefert bei Verstoß ok=false + reason', () => {
    const bad = validatePlacement(tinyConfig, [
      { length: 3, origin: { x: 4, y: 0 }, orientation: 'horizontal' },
      { length: 2, origin: { x: 0, y: 2 }, orientation: 'vertical' },
    ]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(typeof bad.reason).toBe('string');
  });

  it('generateFleet liefert {ok, ships} und ist mit demselben Seed reproduzierbar', () => {
    const a = generateFleet(defineConfig(), createRng(2024));
    const b = generateFleet(defineConfig(), createRng(2024));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.ships).toEqual(b.ships);
  });
});
