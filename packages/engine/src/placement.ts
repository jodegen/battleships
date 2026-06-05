// Schiffsplatzierung & Validierung inkl. konfigurierbarer Berührungsregel (FR-005–FR-012).

import { coordKey, inBounds, neighbors8, shipCells } from './coords';
import type { FleetSpec, GameConfig, PlacementResult, ShipPlacement } from './types';

function fleetMatches(spec: FleetSpec, ships: ReadonlyArray<ShipPlacement>): boolean {
  const want = new Map<number, number>();
  for (const { length, count } of spec.ships) want.set(length, (want.get(length) ?? 0) + count);
  const have = new Map<number, number>();
  for (const s of ships) have.set(s.length, (have.get(s.length) ?? 0) + 1);
  if (want.size !== have.size) return false;
  for (const [len, cnt] of want) {
    if (have.get(len) !== cnt) return false;
  }
  return true;
}

/**
 * Prüft eine vollständige Aufstellung gegen alle Regeln. Liefert beim ersten zutreffenden
 * Verstoß den passenden Grund (FR-011) und akzeptiert nur eine vollständige, gültige Flotte.
 */
export function validatePlacement(
  config: GameConfig,
  ships: ReadonlyArray<ShipPlacement>,
): PlacementResult {
  // 1. Ausrichtung & Lage im Feld
  for (const s of ships) {
    if (s.orientation !== 'horizontal' && s.orientation !== 'vertical') {
      return { ok: false, reason: 'invalid-orientation' };
    }
    if (!Number.isInteger(s.length) || s.length < 1) {
      return { ok: false, reason: 'invalid-orientation' };
    }
    for (const c of shipCells(s)) {
      if (!inBounds(c, config.board)) return { ok: false, reason: 'out-of-bounds' };
    }
  }

  // 2. Flottenzusammensetzung
  if (!fleetMatches(config.fleet, ships)) return { ok: false, reason: 'fleet-mismatch' };

  // 3. Überlappung
  const owner = new Map<string, number>();
  ships.forEach((s, idx) => {
    for (const c of shipCells(s)) owner.set(coordKey(c), idx);
  });
  let occupiedCount = 0;
  for (const s of ships) occupiedCount += shipCells(s).length;
  if (owner.size !== occupiedCount) return { ok: false, reason: 'overlap' };

  // 4. Berührungsregel (nur wenn verboten): kein fremdes Schiff in 8er-Nachbarschaft
  if (!config.allowTouching) {
    for (let idx = 0; idx < ships.length; idx++) {
      const ship = ships[idx] as ShipPlacement;
      for (const c of shipCells(ship)) {
        for (const n of neighbors8(c, config.board)) {
          const ownerIdx = owner.get(coordKey(n));
          if (ownerIdx !== undefined && ownerIdx !== idx) {
            return { ok: false, reason: 'touching-forbidden' };
          }
        }
      }
    }
  }

  return { ok: true };
}
