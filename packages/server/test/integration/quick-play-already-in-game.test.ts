import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { QUICK_PLAY_SETTINGS } from '../../src/matchmaking/quick-play-settings';
import { resetDb } from './setup-app';
import { connect, createWsApp, flushRedis, HAS_INFRA, registerCookie, type WsContext } from './setup-ws';

describe.skipIf(!HAS_INFRA)('Quick Play: kein gleichzeitiges In-Queue-und-Partie (006, FR-015)', () => {
  let ctx: WsContext;
  beforeAll(async () => {
    ctx = await createWsApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await flushRedis(ctx.redis);
  });

  it('lehnt queue:join ab, wenn der Nutzer (konto-weit, anderes Gerät) bereits eine offene Lobby hat', async () => {
    const cookie = await registerCookie(ctx.app, 'busy@x.com', 'Bea');

    // Gerät 1: erstellt eine Code-Lobby → game-of-user gesetzt.
    const device1 = await connect(ctx.port, cookie);
    const create = (await device1.emitWithAck('lobby:create', { settings: QUICK_PLAY_SETTINGS })) as { ok: boolean };
    expect(create.ok).toBe(true);

    // Gerät 2 (gleiches Konto, NICHT in einer Lobby) versucht zu suchen → already-in-game.
    const device2 = await connect(ctx.port, cookie);
    const ack = (await device2.emitWithAck('queue:join', {})) as { ok: boolean; error?: string };
    expect(ack).toEqual({ ok: false, error: 'already-in-game' });
    expect(await ctx.redis.client.zcard('quickplay:queue')).toBe(0);

    device1.disconnect();
    device2.disconnect();
  });
});
