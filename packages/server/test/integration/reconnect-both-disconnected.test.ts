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

describe.skipIf(!HAS_INFRA)('Reconnect: beide Spieler getrennt (005, US3, FR-014a)', () => {
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

  it('das zuerst ablaufende Fenster entscheidet: der andere gewinnt; genau eine Wertung', async () => {
    const g = await startGame(ctx, undefined, { host: 'a@x.com', guest: 'b@x.com' });

    // A trennt zuerst und bekommt einen klaren Vorsprung, damit A's 300-ms-Fenster
    // deterministisch VOR B's abläuft (sonst Timer-Reihenfolge bei ~gleicher Deadline unklar).
    const aGone = waitFor(g.guest, 'opponent:disconnected');
    g.host.disconnect();
    await aGone;
    await sleep(200); // A-Fenster endet bei ~+300 ms, B-Fenster erst bei ~+500 ms
    g.guest.disconnect();

    await sleep(700); // A's Fenster lief zuerst ab → A gilt als aufgegeben, B gewinnt

    // Verspäteter Reconnect von B erfährt das Endergebnis (Sieger B).
    const b2 = await connect(ctx.port, g.guestCookie);
    const over = waitFor<{ winner: string; reason: string }>(b2, 'game:over');
    const ack = await b2.emitWithAck('reconnect:resume', { code: g.code, token: g.guestToken });
    expect(ack).toMatchObject({ ok: false, error: 'game-finished' });
    expect(await over).toMatchObject({ winner: 'B', reason: 'forfeit' });

    // Genau eine Wertung: B gewinnt, A verliert.
    const a = await ctx.prisma.user.findUnique({ where: { email: 'a@x.com' }, include: { stat: true } });
    const b = await ctx.prisma.user.findUnique({ where: { email: 'b@x.com' }, include: { stat: true } });
    expect(b?.stat?.wins).toBe(1);
    expect(a?.stat?.losses).toBe(1);
    expect(a?.stat?.wins).toBe(0);

    b2.disconnect();
  });
});
