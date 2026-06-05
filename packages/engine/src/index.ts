// Öffentliche API von @schiffe/engine (Contract: specs/001-engine-ai-core/contracts/public-api.md).

// Typen
export type {
  PlayerId,
  Orientation,
  Coord,
  BoardSize,
  FleetSpec,
  GameConfig,
  ShipPlacement,
  PlacementError,
  PlacementResult,
  ShotOutcome,
  ShotResult,
  ShotRejectionReason,
  ShotRejection,
  GameStatus,
  Ship,
  Board,
  GameState,
  OpponentShotView,
  PlayerView,
  AiLevel,
  AiDecision,
} from './types';

// Zufall (deterministisch, injizierbar)
export type { Rng } from './rng';
export { createRng } from './rng';

// Konfiguration
export { DEFAULT_CONFIG, DEFAULT_BOARD, CLASSIC_FLEET, defineConfig, validateConfig, totalShipCells } from './config';

// Geometrie (nützliche Helfer für Konsumenten)
export { inBounds, shipCells, neighbors4, neighbors8, allCells, coordKey, coordEquals } from './coords';

// US1 — Platzierung & Generator
export { validatePlacement } from './placement';
export { generateFleet } from './generate';

// US2 — Spielschleife
export { createGame, applyShot, isOver, getWinner, currentTurn } from './game';
export { resolveShot, allSunk, shipIsSunk } from './shot';
export { viewFor } from './view';

// US3 — KI
export { selectMove } from './ai/index';
