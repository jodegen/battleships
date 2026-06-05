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

describe.skipIf(!HAS_INFRA)('Aufräumen & TTL (FR-011)', () => {
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

  it('eine wartende Lobby erhält eine ablaufende TTL (10-min-Auto-Close-Pfad)', async () => {
    const host = await connect(ctx.port, await registerCookie(ctx.app, 'ttl@x.com', 'Alice'));
    const { code } = await host.emitWithAck('lobby:create', { settings: SETTINGS });
    const pttl = await ctx.redis.client.pttl(`lobby:${code}`);
    // 0 < pttl ≤ 10 min (TTL gesetzt, läuft also ab).
    expect(pttl).toBeGreaterThan(0);
    expect(pttl).toBeLessThanOrEqual(10 * 60 * 1000);
    host.disconnect();
  });

  it('nach Partieende wird der Lobby-Key entfernt und die offene-Lobby-Zählung zurückgesetzt', async () => {
    const cfg = settingsToGameConfig(SETTINGS);
    const fa = generateFleet(cfg, createRng(7));
    const fb = generateFleet(cfg, createRng(99));
    if (!fa.ok || !fb.ok) throw new Error('fleet');

    const host = await connect(ctx.port, await registerCookie(ctx.app, 'clean@x.com', 'Alice'));
    const { code } = await host.emitWithAck('lobby:create', { settings: SETTINGS });
    const userId = (await ctx.prisma.user.findUnique({ where: { email: 'clean@x.com' } }))!.id;
    expect(await ctx.redis.client.scard(`open-lobbies:${userId}`)).toBe(1);

    const guest = await connect(ctx.port, await guestCookie(ctx.app, 'Bob'));
    await guest.emitWithAck('lobby:join', { code });
    await host.emitWithAck('fleet:place', { code, placements: fa.ships });
    const started = waitFor(host, 'turn:changed');
    await guest.emitWithAck('fleet:place', { code, placements: fb.ships });
    await started;

    const over = waitFor(host, 'game:over');
    for (const c of fb.ships.flatMap((s) => shipCells(s))) {
      await host.emitWithAck('shot:fire', { code, moveId: `${code}-${c.x}-${c.y}`, target: c });
    }
    await over;
    await new Promise((r) => setTimeout(r, 100));

    expect(await ctx.redis.client.get(`lobby:${code}`)).toBeNull();
    expect(await ctx.redis.client.scard(`open-lobbies:${userId}`)).toBe(0);
    host.disconnect();
    guest.disconnect();
  });
});
