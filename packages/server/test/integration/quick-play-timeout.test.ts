import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDb } from './setup-app';
import { connect, createWsApp, flushRedis, HAS_INFRA, registerCookie, waitFor, type WsContext } from './setup-ws';

// Kurzes Wartetimeout, damit der 120-s-Fall (FR-016) deterministisch und schnell testbar ist.
// APP_CONFIG liest process.env beim App-Init (useFactory) → pro Datei überschreibbar; fileParallelism
// ist aus, daher beeinflusst das keine anderen Suites. Vorheriger Wert wird wiederhergestellt.
const prev = process.env.MATCHMAKING_TIMEOUT_MS;

describe.skipIf(!HAS_INFRA)('Quick Play: Wartetimeout ohne Gegner (006, FR-016/SC-008)', () => {
  let ctx: WsContext;
  beforeAll(async () => {
    process.env.MATCHMAKING_TIMEOUT_MS = '300';
    ctx = await createWsApp();
  });
  afterAll(async () => {
    await ctx.app.close();
    if (prev === undefined) delete process.env.MATCHMAKING_TIMEOUT_MS;
    else process.env.MATCHMAKING_TIMEOUT_MS = prev;
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await flushRedis(ctx.redis);
  });

  it('entfernt einen allein Wartenden nach dem Fenster und meldet „kein Match gefunden"', async () => {
    const sock = await connect(ctx.port, await registerCookie(ctx.app, 'lonely@x.com', 'Lonny'));
    const timeout = waitFor<{ reason: string }>(sock, 'queue:timeout', 2000);
    const ack = (await sock.emitWithAck('queue:join', {})) as { ok: boolean; status?: string };
    expect(ack.status).toBe('waiting');

    const msg = await timeout;
    expect(msg).toEqual({ reason: 'no-match' });
    expect(await ctx.redis.client.zcard('quickplay:queue')).toBe(0);

    sock.disconnect();
  });
});
