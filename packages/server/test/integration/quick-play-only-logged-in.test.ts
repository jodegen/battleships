import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDb } from './setup-app';
import {
  connect,
  createWsApp,
  flushRedis,
  guestCookie,
  HAS_INFRA,
  registerCookie,
  type WsContext,
} from './setup-ws';

describe.skipIf(!HAS_INFRA)('Quick Play: nur eingeloggte Spieler (006, US3/FR-001)', () => {
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

  it('lehnt Gäste mit forbidden ab und reiht sie nicht ein', async () => {
    const guest = await connect(ctx.port, await guestCookie(ctx.app, 'Gus'));
    const ack = (await guest.emitWithAck('queue:join', {})) as { ok: boolean; error?: string };
    expect(ack).toEqual({ ok: false, error: 'forbidden' });
    expect(await ctx.redis.client.zcard('quickplay:queue')).toBe(0);
    guest.disconnect();
  });

  it('lehnt anonyme Verbindungen mit unauthenticated ab', async () => {
    const anon = await connect(ctx.port); // kein Cookie
    const ack = (await anon.emitWithAck('queue:join', {})) as { ok: boolean; error?: string };
    expect(ack).toEqual({ ok: false, error: 'unauthenticated' });
    anon.disconnect();
  });

  it('(Kontrolle) lässt eingeloggte Spieler zu', async () => {
    const user = await connect(ctx.port, await registerCookie(ctx.app, 'in@x.com', 'Ina'));
    const ack = (await user.emitWithAck('queue:join', {})) as { ok: boolean; status?: string };
    expect(ack).toEqual({ ok: true, status: 'waiting' });
    user.disconnect();
  });
});
