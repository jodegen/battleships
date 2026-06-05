// Deterministischer Aufstellungsgenerator (FR-030, SC-008).

import { coordKey, neighbors8, shipCells } from './coords';
import { validatePlacement } from './placement';
import type { Rng } from './rng';
import type { GameConfig, Orientation, ShipPlacement } from './types';

const MAX_ATTEMPTS_PER_SHIP = 2000;

/**
 * Erzeugt eine regelkonforme Aufstellung der konfigurierten Flotte deterministisch aus `rng`.
 * Größere Schiffe zuerst (höhere Erfolgswahrscheinlichkeit). Reserviert bei verbotener
 * Berührung den 8er-Ring um jedes Schiff. Liefert `'unplaceable'`, falls kein Layout gelingt.
 */
export function generateFleet(
  config: GameConfig,
  rng: Rng,
): { ok: true; ships: ShipPlacement[] } | { ok: false; reason: 'unplaceable' } {
  const lengths: number[] = [];
  for (const { length, count } of config.fleet.ships) {
    for (let i = 0; i < count; i++) lengths.push(length);
  }
  lengths.sort((a, b) => b - a);

  const placed: ShipPlacement[] = [];
  const blocked = new Set<string>(); // belegte Zellen (+ Ringpuffer bei verbotener Berührung)

  for (const length of lengths) {
    let success = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_SHIP && !success; attempt++) {
      const orientation: Orientation = rng.next() < 0.5 ? 'horizontal' : 'vertical';
      const maxX = orientation === 'horizontal' ? config.board.width - length : config.board.width - 1;
      const maxY = orientation === 'vertical' ? config.board.height - length : config.board.height - 1;
      if (maxX < 0 || maxY < 0) continue;

      const origin = { x: rng.nextInt(maxX + 1), y: rng.nextInt(maxY + 1) };
      const cells = shipCells({ origin, orientation, length });

      let conflict = false;
      for (const c of cells) {
        if (blocked.has(coordKey(c))) {
          conflict = true;
          break;
        }
      }
      if (conflict) continue;

      placed.push({ length, origin, orientation });
      for (const c of cells) {
        blocked.add(coordKey(c));
        if (!config.allowTouching) {
          for (const n of neighbors8(c, config.board)) blocked.add(coordKey(n));
        }
      }
      success = true;
    }
    if (!success) return { ok: false, reason: 'unplaceable' };
  }

  // Sicherheitsnetz: das Ergebnis muss die Vollvalidierung bestehen.
  const verdict = validatePlacement(config, placed);
  if (!verdict.ok) return { ok: false, reason: 'unplaceable' };
  return { ok: true, ships: placed };
}
