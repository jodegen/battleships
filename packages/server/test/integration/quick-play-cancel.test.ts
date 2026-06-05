import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDb } from './setup-app';
import { connect, createWsApp, flushRedis, HAS_INFRA, registerCookie, waitFor, type WsContext } from './setup-ws';

describe.skipIf(!HAS_INFRA)('Quick Play: Suche abbrechen vor der Paarung (006, US2/FR-008/009)', () => {
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

  it('entfernt den Spieler bei queue:leave und bezieht ihn nicht in eine spätere Paarung ein', async () => {
    const a = await connect(ctx.port, await registerCookie(ctx.app, 'cancel@x.com', 'Cara'));
    expect(((await a.emitWithAck('queue:join', {})) as { status?: string }).status).toBe('waiting');
    expect(await ctx.redis.client.zcard('quickplay:queue')).toBe(1);

    const leaveAck = (await a.emitWithAck('queue:leave', {})) as { ok: boolean };
    expect(leaveAck).toEqual({ ok: true });
    expect(await ctx.redis.client.zcard('quickplay:queue')).toBe(0);

    // Ein danach beitretender Spieler findet KEINEN Gegner (A ist raus) → bleibt wartend.
    const b = await connect(ctx.port, await registerCookie(ctx.app, 'later@x.com', 'Liam'));
    let matched = false;
    b.on('queue:matched', () => {
      matched = true;
    });
    const bAck = (await b.emitWithAck('queue:join', {})) as { status?: string };
    expect(bAck.status).toBe('waiting');
    await waitFor(b, 'queue:matched', 100).catch(() => undefined);
    expect(matched).toBe(false);
    expect(await ctx.redis.client.zcard('quickplay:queue')).toBe(1);

    a.disconnect();
    b.disconnect();
  });
});
