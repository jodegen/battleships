import { describe, expect, it } from 'vitest';
import { defineConfig } from '../../src/config';
import { generateFleet } from '../../src/generate';
import { validatePlacement } from '../../src/placement';
import { createRng } from '../../src/rng';

describe('generateFleet', () => {
  it('erzeugt eine regelkonforme Standardflotte (touching erlaubt)', () => {
    const cfg = defineConfig();
    const result = generateFleet(cfg, createRng(1));
    expect(result.ok).toBe(true);
    if (result.ok) expect(validatePlacement(cfg, result.ships)).toEqual({ ok: true });
  });

  it('erzeugt eine regelkonforme Flotte bei verbotener Berührung', () => {
    const cfg = defineConfig({ allowTouching: false });
    for (const seed of [1, 2, 3, 42, 777]) {
      const result = generateFleet(cfg, createRng(seed));
      expect(result.ok).toBe(true);
      if (result.ok) expect(validatePlacement(cfg, result.ships)).toEqual({ ok: true });
    }
  });

  it('ist deterministisch: gleicher Seed → gleiche Aufstellung (SC-008)', () => {
    const cfg = defineConfig();
    const a = generateFleet(cfg, createRng(99));
    const b = generateFleet(cfg, createRng(99));
    expect(a).toEqual(b);
  });

  it('unterschiedliche Seeds liefern i. d. R. unterschiedliche Aufstellungen', () => {
    const cfg = defineConfig();
    const a = generateFleet(cfg, createRng(1));
    const b = generateFleet(cfg, createRng(2));
    expect(a).not.toEqual(b);
  });

  it('signalisiert unplaceable, wenn die Flotte nicht passt (verbotene Berührung, zu eng)', () => {
    // 3×3-Feld: ohne Berührung passen höchstens zwei Längen-3-Schiffe (Zeilen 0 und 2).
    // Drei sind unmöglich → der Generator muss `unplaceable` melden.
    const cfg = defineConfig({
      board: { width: 3, height: 3 },
      fleet: { ships: [{ length: 3, count: 3 }] },
      allowTouching: false,
    });
    const result = generateFleet(cfg, createRng(5));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unplaceable');
  });
});
