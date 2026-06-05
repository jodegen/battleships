import { describe, expect, it } from 'vitest';
import {
  applyShot,
  createGame,
  createRng,
  currentTurn,
  defineConfig,
  generateFleet,
  getWinner,
  isOver,
  selectMove,
} from '../../src/index';

describe('Integration: Quickstart-Smoke (vollständige KI-Partie)', () => {
  it('läuft deterministisch bis zu einem Sieger', () => {
    const rng = createRng(12345);
    const config = defineConfig({ allowTouching: false });

    const a = generateFleet(config, rng);
    const b = generateFleet(config, rng);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    let state = createGame(config, { A: a.ships, B: b.ships });

    let guard = 0;
    const cap = 4 * config.board.width * config.board.height + 10;
    while (!isOver(state) && guard < cap) {
      guard++;
      const turn = currentTurn(state);
      const level = turn === 'B' ? 'density' : 'hunt-target';
      const decision = selectMove(state, turn, level, rng);
      if ('noMove' in decision) break;
      const res = applyShot(state, turn, decision.move);
      if ('rejected' in res) continue;
      state = res.state;
    }

    expect(isOver(state)).toBe(true);
    expect(getWinner(state)).not.toBeNull();
  });
});
