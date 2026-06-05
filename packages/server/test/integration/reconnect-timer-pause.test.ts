import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDb } from './setup-app';
import {
  connect,
  createWsApp,
  flushRedis,
  HAS_INFRA,
  sleep,
  startGame,
  waitFor,
  type WsContext,
} from './setup-ws';

interface GameView {
  turn: string;
  turnDeadline: number | null;
}

describe.skipIf(!HAS_INFRA)('Reconnect: Zug-Timer pausiert (005, US4, FR-011/012/013)', () => {
  let ctx: WsContext;
  beforeAll(async () => {
    process.env.RECONNECT_WINDOW_MS = '5000';
    ctx = await createWsApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await flushRedis(ctx.redis);
  });

  it('pausiert während der Trennung und setzt mit der Restzeit fort (SC-004)', async () => {
    const g = await startGame(ctx, { allowTouching: true, turnTimerSeconds: 30, extraTurnOnHit: true });

    // Host (A) am Zug trennt; nach kurzer Zeit wieder verbinden.
    const disconnected = waitFor(g.guest, 'opponent:disconnected');
    g.host.disconnect();
    await disconnected;
    await sleep(500); // Timer DARF in dieser Zeit nicht weiterlaufen (pausiert)

    const host2 = await connect(ctx.port, g.hostCookie);
    const viewP = waitFor<GameView>(host2, 'game:view');
    await host2.emitWithAck('reconnect:resume', { code: g.code, token: g.hostToken });
    const view = await viewP;

    expect(view.turn).toBe('A');
    expect(view.turnDeadline).not.toBeNull();
    const remaining = (view.turnDeadline as number) - Date.now();
    // ~30 s Restzeit erhalten (Pause hat nicht heruntergezählt); großzügige Toleranz.
    expect(remaining).toBeGreaterThan(26_000);
    expect(remaining).toBeLessThanOrEqual(30_500);

    host2.disconnect();
    g.guest.disconnect();
  });

  it('Timer „aus": Pause/Resume ohne Timer-Effekt (FR-013)', async () => {
    const g = await startGame(ctx, { allowTouching: true, turnTimerSeconds: null, extraTurnOnHit: true });

    const disconnected = waitFor(g.guest, 'opponent:disconnected');
    g.host.disconnect();
    await disconnected;

    const host2 = await connect(ctx.port, g.hostCookie);
    const viewP = waitFor<GameView>(host2, 'game:view');
    await host2.emitWithAck('reconnect:resume', { code: g.code, token: g.hostToken });
    const view = await viewP;
    expect(view.turnDeadline).toBeNull();

    host2.disconnect();
    g.guest.disconnect();
  });
});
