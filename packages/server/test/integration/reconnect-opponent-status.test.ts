import { shipCells } from '@schiffe/engine';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDb } from './setup-app';
import { connect, createWsApp, flushRedis, HAS_INFRA, startGame, waitFor, type WsContext } from './setup-ws';

describe.skipIf(!HAS_INFRA)('Reconnect: Gegner-Status & Pause (005, US2)', () => {
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

  it('Trennung → opponent:disconnected mit Deadline; Zug während Pause abgelehnt; Rückkehr → opponent:reconnected (FR-005/007/010)', async () => {
    const g = await startGame(ctx);

    // Der Beigetretene (B) trennt → der Host (A, am Zug) bleibt zurück.
    const disconnected = waitFor<{ playerId: string; graceDeadline: number }>(g.host, 'opponent:disconnected');
    g.guest.disconnect();
    const d = await disconnected;
    expect(d.playerId).toBe('B');
    expect(typeof d.graceDeadline).toBe('number');

    // A ist am Zug, dennoch wird der Schuss abgelehnt, weil die Partie pausiert ist (nicht „not-your-turn").
    const fire = await g.host.emitWithAck('shot:fire', {
      code: g.code,
      moveId: 'p1',
      target: shipCells(g.fb[0])[0],
    });
    expect((fire as { ok: boolean }).ok).toBe(false);

    // B kehrt zurück → Host erhält opponent:reconnected.
    const reconnected = waitFor<{ playerId: string }>(g.host, 'opponent:reconnected');
    const guest2 = await connect(ctx.port, g.guestCookie);
    const ack = await guest2.emitWithAck('reconnect:resume', { code: g.code, token: g.guestToken });
    expect(ack).toMatchObject({ ok: true, you: 'B' });
    expect((await reconnected).playerId).toBe('B');

    g.host.disconnect();
    guest2.disconnect();
  });
});
