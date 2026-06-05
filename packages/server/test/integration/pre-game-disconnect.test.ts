import { createRng, generateFleet, shipCells } from '@schiffe/engine';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { settingsToGameConfig } from '../../src/game/game-config';
import { resetDb } from './setup-app';
import {
  connect,
  createWsApp,
  flushRedis,
  guestCookie,
  HAS_INFRA,
  registerCookie,
  waitFor,
  type WsContext,
} from './setup-ws';

const SETTINGS = { allowTouching: true, turnTimerSeconds: null, extraTurnOnHit: true };

describe.skipIf(!HAS_INFRA)('Verlassen/Disconnect (FR-010a/011a)', () => {
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

  it('Disconnect des zweiten Spielers in placing → Sitz frei, zurück zu waiting (FR-011a)', async () => {
    const host = await connect(ctx.port, await registerCookie(ctx.app, 'h1@x.com', 'Alice'));
    const { code } = await host.emitWithAck('lobby:create', { settings: SETTINGS });
    const guest = await connect(ctx.port, await guestCookie(ctx.app, 'Bob'));
    await guest.emitWithAck('lobby:join', { code });

    const backToWaiting = waitFor<{ status: string; players: unknown[] }>(host, 'lobby:state');
    guest.disconnect();
    const state = await backToWaiting;
    expect(state.status).toBe('waiting');
    expect(state.players).toHaveLength(1);
    host.disconnect();
  });

  it('Host-Disconnect vor Spielstart schließt die Lobby (FR-011a)', async () => {
    const host = await connect(ctx.port, await registerCookie(ctx.app, 'h2@x.com', 'Alice'));
    const { code } = await host.emitWithAck('lobby:create', { settings: SETTINGS });
    const guest = await connect(ctx.port, await guestCookie(ctx.app, 'Bob'));
    await guest.emitWithAck('lobby:join', { code });

    const closed = waitFor<{ error: string }>(guest, 'error');
    host.disconnect();
    expect((await closed).error).toBe('lobby-not-found');
    guest.disconnect();
  });

  it('Disconnect während in_progress → Sieg durch Aufgabe, gewertet (FR-010a)', async () => {
    const cfg = settingsToGameConfig(SETTINGS);
    const fa = generateFleet(cfg, createRng(7));
    const fb = generateFleet(cfg, createRng(99));
    if (!fa.ok || !fb.ok) throw new Error('fleet');

    const host = await connect(ctx.port, await registerCookie(ctx.app, 'win@x.com', 'Alice'));
    const { code } = await host.emitWithAck('lobby:create', { settings: SETTINGS });
    const guest = await connect(ctx.port, await registerCookie(ctx.app, 'lose@x.com', 'Bob'));
    await guest.emitWithAck('lobby:join', { code });

    await host.emitWithAck('fleet:place', { code, placements: fa.ships });
    const started = waitFor(host, 'turn:changed');
    await guest.emitWithAck('fleet:place', { code, placements: fb.ships });
    await started;

    // Host (am Zug) trifft einmal, dann verlässt der Gast → Host gewinnt durch Aufgabe.
    const over = waitFor<{ winner: string; reason: string }>(host, 'game:over');
    await host.emitWithAck('shot:fire', { code, moveId: 'm0', target: shipCells(fb.ships[0])[0] });
    guest.disconnect();
    expect(await over).toMatchObject({ winner: 'A', reason: 'forfeit' });

    // Gewertet: Alice gewinnt, Bob verliert (beide eingeloggt).
    await new Promise((r) => setTimeout(r, 100));
    const alice = await ctx.prisma.user.findUnique({ where: { email: 'win@x.com' }, include: { stat: true } });
    const bob = await ctx.prisma.user.findUnique({ where: { email: 'lose@x.com' }, include: { stat: true } });
    expect(alice?.stat?.wins).toBe(1);
    expect(bob?.stat?.losses).toBe(1);
    host.disconnect();
  });
});
