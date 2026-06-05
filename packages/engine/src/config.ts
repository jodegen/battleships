// Spielregeln-Konfiguration mit Defaults (FR-001, FR-002, FR-003).

import type { BoardSize, FleetSpec, GameConfig } from './types';

export const DEFAULT_BOARD: BoardSize = { width: 10, height: 10 };

/**
 * Klassische Flotte: 1×5, 1×4, 2×3 (Zerstörer) + 1×3 (U-Boot) = 3×3, 1×2. Summe 20 Zellen.
 */
export const CLASSIC_FLEET: FleetSpec = {
  ships: [
    { length: 5, count: 1 },
    { length: 4, count: 1 },
    { length: 3, count: 3 },
    { length: 2, count: 1 },
  ],
};

export const DEFAULT_CONFIG: GameConfig = {
  board: DEFAULT_BOARD,
  fleet: CLASSIC_FLEET,
  allowTouching: true,
  extraTurnOnHit: true,
};

export function totalShipCells(fleet: FleetSpec): number {
  return fleet.ships.reduce((sum, s) => sum + s.length * s.count, 0);
}

export function validateConfig(cfg: GameConfig): void {
  if (!Number.isInteger(cfg.board.width) || !Number.isInteger(cfg.board.height)) {
    throw new Error('board dimensions must be integers');
  }
  if (cfg.board.width <= 0 || cfg.board.height <= 0) {
    throw new Error('board dimensions must be positive');
  }
  if (cfg.fleet.ships.length === 0) {
    throw new Error('fleet must contain at least one ship');
  }
  for (const s of cfg.fleet.ships) {
    if (!Number.isInteger(s.length) || s.length < 1) throw new Error('ship length must be >= 1');
    if (!Number.isInteger(s.count) || s.count < 1) throw new Error('ship count must be >= 1');
    if (s.length > cfg.board.width && s.length > cfg.board.height) {
      throw new Error(`ship of length ${s.length} does not fit on the board`);
    }
  }
  if (totalShipCells(cfg.fleet) > cfg.board.width * cfg.board.height) {
    throw new Error('fleet does not fit on the board');
  }
}

export function defineConfig(partial?: Partial<GameConfig>): GameConfig {
  const cfg: GameConfig = {
    board: partial?.board ?? DEFAULT_BOARD,
    fleet: partial?.fleet ?? CLASSIC_FLEET,
    allowTouching: partial?.allowTouching ?? true,
    extraTurnOnHit: partial?.extraTurnOnHit ?? true,
  };
  validateConfig(cfg);
  return cfg;
}
