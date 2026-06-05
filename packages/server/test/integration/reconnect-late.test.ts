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

describe.skipIf(!HAS_INFRA)('Reconnect: verspäteter Wiedereintritt (005, US3, FR-017)', () => {
  let ctx: WsContext;
  beforeAll(async () => {
    process.env.RECONNECT_WINDOW_MS = '300';
    ctx = await createWsApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await flushRedis(ctx.redis);
  });

  it('Reconnect nach Ablauf → terminales game:over, kein Wiedereintritt; unbekannter Code → lobby-not-found', async () => {
    const g = await startGame(ctx, undefined, { host: 'win@x.com', guest: 'lose@x.com' });

    const over = waitFor<{ winner: string }>(g.host, 'game:over');
    g.guest.disconnect();
    expect(await over).toMatchObject({ winner: 'A' });
    await sleep(50); // Partie ist bereits beendet + Marker gesetzt, Lobby gelöscht

    const guest2 = await connect(ctx.port, g.guestCookie);
    const terminal = waitFor<{ winner: string; reason: string }>(guest2, 'game:over');
    const ack = await guest2.emitWithAck('reconnect:resume', { code: g.code, token: g.guestToken });
    expect(ack).toMatchObject({ ok: false, error: 'game-finished' });
    expect(await terminal).toMatchObject({ winner: 'A', reason: 'forfeit' });

    // Unbekannter Code (kein Record, kein Marker) → lobby-not-found.
    const unknown = await guest2.emitWithAck('reconnect:resume', { code: 'ZZZZZZ', token: 'x' });
    expect(unknown).toMatchObject({ ok: false, error: 'lobby-not-found' });

    g.host.disconnect();
    guest2.disconnect();
  });
});
