import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDb } from './setup-app';
import { createWsApp, flushRedis, HAS_INFRA, sleep, startGame, waitFor, type WsContext } from './setup-ws';

// Kurzes Fenster, damit der Ablauf deterministisch und schnell prüfbar ist.
describe.skipIf(!HAS_INFRA)('Reconnect: Aufgabe nach Fenster-Ablauf (005, US3)', () => {
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

  it('Fenster läuft ab → Sieg durch Aufgabe; Statistik genau einmal fortgeschrieben (FR-014/015/016, SC-005)', async () => {
    const g = await startGame(ctx, undefined, { host: 'win@x.com', guest: 'lose@x.com' });

    const over = waitFor<{ winner: string; reason: string }>(g.host, 'game:over');
    g.guest.disconnect(); // kehrt nicht zurück
    expect(await over).toMatchObject({ winner: 'A', reason: 'forfeit' });

    await sleep(150);
    const alice = await ctx.prisma.user.findUnique({ where: { email: 'win@x.com' }, include: { stat: true } });
    const bob = await ctx.prisma.user.findUnique({ where: { email: 'lose@x.com' }, include: { stat: true } });
    expect(alice?.stat?.wins).toBe(1);
    expect(alice?.stat?.losses).toBe(0);
    expect(bob?.stat?.losses).toBe(1);
    expect(bob?.stat?.wins).toBe(0);

    g.host.disconnect();
  });
});
