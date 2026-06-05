// Session-Controller: die einzige UI↔Engine-Naht. Reine Funktionen, die ausschließlich
// @schiffe/engine für Spiellogik aufrufen (FR-001). React-Komponenten rufen nur diese Funktionen.

import {
  applyShot,
  createGame,
  currentTurn,
  DEFAULT_CONFIG,
  generateFleet,
  getWinner,
  isOver,
  selectMove,
  validatePlacement,
  viewFor,
  type Coord,
  type GameConfig,
  type GameState,
  type PlayerId,
  type PlayerView,
  type Rng,
  type ShipPlacement,
  type ShotResult,
} from '@schiffe/engine';
import { AI, DIFFICULTY_TO_LEVEL, HUMAN, type Difficulty, type SessionState } from './types';

export function createSession(seed: number): SessionState {
  return {
    phase: 'difficulty',
    config: DEFAULT_CONFIG,
    difficulty: null,
    seed,
    draft: { ships: [] },
    game: null,
    turn: null,
  };
}

export function restart(seed: number): SessionState {
  return createSession(seed);
}

export function chooseDifficulty(s: SessionState, d: Difficulty): SessionState {
  if (s.phase !== 'difficulty') return s;
  return { ...s, difficulty: d, phase: 'placing' };
}

// ---------- Platzierung (US1) ----------

function lengthCounts(ships: ReadonlyArray<ShipPlacement>): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of ships) m.set(s.length, (m.get(s.length) ?? 0) + 1);
  return m;
}

/** Soll-Anzahl je Schiffslänge aus der Flotten-Konfiguration (nutzt das `count`-Feld). */
function targetCounts(config: GameConfig): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of config.fleet.ships) m.set(s.length, (m.get(s.length) ?? 0) + s.count);
  return m;
}

/**
 * Prüft eine (Teil-)Aufstellung über die Engine: Es wird eine Probe-Config gebaut, deren Flotte
 * exakt der aktuellen Schiffsmenge entspricht — so nutzt `validatePlacement` die echten
 * Geometrieregeln (Bounds/Überlappung/Berührung), ohne dass die UI Regeln nachbildet (FR-001/006).
 */
function partialPlacementOk(config: GameConfig, ships: ReadonlyArray<ShipPlacement>): boolean {
  const counts = lengthCounts(ships);
  const probe: GameConfig = {
    ...config,
    fleet: { ships: [...counts].map(([length, count]) => ({ length, count })) },
  };
  return validatePlacement(probe, ships).ok;
}

/** Darf dieses Schiff (Länge + Lage) zur aktuellen Aufstellung hinzugefügt werden? */
export function canPlaceShip(s: SessionState, ship: ShipPlacement): boolean {
  const target = targetCounts(s.config);
  const have = lengthCounts(s.draft.ships);
  const allowed = target.get(ship.length) ?? 0;
  if ((have.get(ship.length) ?? 0) + 1 > allowed) return false; // nicht mehr als die Soll-Flotte
  return partialPlacementOk(s.config, [...s.draft.ships, ship]);
}

export function placeShip(s: SessionState, ship: ShipPlacement): SessionState {
  if (s.phase !== 'placing') return s;
  if (!canPlaceShip(s, ship)) return s;
  return { ...s, draft: { ships: [...s.draft.ships, ship] } };
}

export function removeShip(s: SessionState, index: number): SessionState {
  if (s.phase !== 'placing') return s;
  if (index < 0 || index >= s.draft.ships.length) return s;
  return { ...s, draft: { ships: s.draft.ships.filter((_, i) => i !== index) } };
}

export function rotateShip(s: SessionState, index: number): SessionState {
  if (s.phase !== 'placing') return s;
  const ship = s.draft.ships[index];
  if (!ship) return s;
  const rotated: ShipPlacement = {
    length: ship.length,
    origin: ship.origin,
    orientation: ship.orientation === 'horizontal' ? 'vertical' : 'horizontal',
  };
  const candidate = s.draft.ships.map((sh, i) => (i === index ? rotated : sh));
  if (!partialPlacementOk(s.config, candidate)) return s; // z. B. würde aus dem Raster ragen
  return { ...s, draft: { ships: candidate } };
}

export function autoPlace(s: SessionState, rng: Rng): SessionState {
  if (s.phase !== 'placing') return s;
  const gen = generateFleet(s.config, rng);
  if (!gen.ok) return s;
  return { ...s, draft: { ships: gen.ships } };
}

export function canStart(s: SessionState): boolean {
  return s.phase === 'placing' && validatePlacement(s.config, s.draft.ships).ok;
}

export function startGame(s: SessionState, rng: Rng): SessionState {
  if (!canStart(s)) return s;
  const ai = generateFleet(s.config, rng); // gegnerische Flotte automatisch platzieren
  if (!ai.ok) return s;
  const game = createGame(s.config, { A: s.draft.ships, B: ai.ships });
  return { ...s, game, phase: 'playing', turn: currentTurn(game) };
}

// ---------- Spielablauf (US2) ----------

function afterShot(
  s: SessionState,
  by: PlayerId,
  res: { state: GameState; result: ShotResult },
): SessionState {
  const next: SessionState = {
    ...s,
    game: res.state,
    turn: currentTurn(res.state),
    lastShot: { by, result: res.result },
  };
  if (isOver(res.state)) {
    return { ...next, phase: 'finished', outcome: getWinner(res.state) === HUMAN ? 'won' : 'lost' };
  }
  return next;
}

export function playerShoot(
  s: SessionState,
  target: Coord,
): { next: SessionState; accepted: boolean } {
  if (s.phase !== 'playing' || !s.game) return { next: s, accepted: false };
  if (currentTurn(s.game) !== HUMAN) return { next: s, accepted: false };
  const res = applyShot(s.game, HUMAN, target);
  if ('rejected' in res) return { next: s, accepted: false };
  return { next: afterShot(s, HUMAN, res), accepted: true };
}

export function isAiTurn(s: SessionState): boolean {
  return s.phase === 'playing' && s.game !== null && currentTurn(s.game) === AI;
}

export function aiStep(s: SessionState, rng: Rng): SessionState {
  if (!isAiTurn(s) || !s.game || !s.difficulty) return s;
  const decision = selectMove(s.game, AI, DIFFICULTY_TO_LEVEL[s.difficulty], rng);
  if ('noMove' in decision) return s;
  const res = applyShot(s.game, AI, decision.move);
  if ('rejected' in res) return s;
  return afterShot(s, AI, res);
}

// ---------- Sicht (Fog of War, FR-002) ----------

export function ownView(s: SessionState): PlayerView['own'] | null {
  return s.game ? viewFor(s.game, HUMAN).own : null;
}

export function opponentShots(s: SessionState): PlayerView['opponent']['shots'] | null {
  return s.game ? viewFor(s.game, HUMAN).opponent.shots : null;
}
