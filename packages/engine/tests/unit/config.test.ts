import { describe, expect, it } from 'vitest';
import { CLASSIC_FLEET, DEFAULT_CONFIG, defineConfig, totalShipCells } from '../../src/config';

describe('Konfiguration', () => {
  it('DEFAULT_CONFIG ist 10×10, klassische Flotte, touching+extraTurn an', () => {
    expect(DEFAULT_CONFIG.board).toEqual({ width: 10, height: 10 });
    expect(DEFAULT_CONFIG.allowTouching).toBe(true);
    expect(DEFAULT_CONFIG.extraTurnOnHit).toBe(true);
    expect(DEFAULT_CONFIG.fleet).toBe(CLASSIC_FLEET);
  });

  it('die klassische Flotte umfasst 20 Zellen (5+4+3+3+3+2)', () => {
    expect(totalShipCells(CLASSIC_FLEET)).toBe(20);
    const totalShips = CLASSIC_FLEET.ships.reduce((n, s) => n + s.count, 0);
    expect(totalShips).toBe(6);
  });

  it('defineConfig füllt fehlende Felder mit Defaults', () => {
    const cfg = defineConfig({ allowTouching: false });
    expect(cfg.allowTouching).toBe(false);
    expect(cfg.extraTurnOnHit).toBe(true);
    expect(cfg.board).toEqual({ width: 10, height: 10 });
  });

  it('defineConfig() ohne Argument == DEFAULT_CONFIG-Werte', () => {
    const cfg = defineConfig();
    expect(cfg.board).toEqual(DEFAULT_CONFIG.board);
    expect(cfg.extraTurnOnHit).toBe(true);
  });

  it('lehnt ungültige Board-Maße ab', () => {
    expect(() => defineConfig({ board: { width: 0, height: 10 } })).toThrow();
    expect(() => defineConfig({ board: { width: -3, height: 10 } })).toThrow();
  });

  it('lehnt eine Flotte ab, die nicht aufs Feld passt', () => {
    expect(() =>
      defineConfig({ board: { width: 2, height: 2 }, fleet: { ships: [{ length: 3, count: 1 }] } }),
    ).toThrow();
  });
});
