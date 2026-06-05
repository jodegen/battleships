import { createRng, generateFleet } from '@schiffe/engine';
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
// CI-freundliche Stichprobe der SC-009-Größenordnung (Richtwert ≥ 50 im manuellen/Lasttest).
const N = 24;

describe.skipIf(!HAS_INFRA)('Nebenläufigkeit (SC-009, Stichprobe)', () => {
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

  it(`bedient ${N} gleichzeitige Partien; jeder Schuss liefert ein Ergebnis`, async () => {
    const cfg = settingsToGameConfig(SETTINGS);
    const fa = generateFleet(cfg, createRng(7));
    const fb = generateFleet(cfg, createRng(99));
    if (!fa.ok || !fb.ok) throw new Error('fleet');
    const firstTarget = { x: fb.ships[0].origin.x, y: fb.ships[0].origin.y };

    const games = Array.from({ length: N }, (_, i) => i).map(async (i) => {
      const host = await connect(ctx.port, await registerCookie(ctx.app, `c${i}@x.com`, `Host${i}`));
      const { code } = await host.emitWithAck('lobby:create', { settings: SETTINGS });
      const guest = await connect(ctx.port, await guestCookie(ctx.app, `Guest${i}`));
      await guest.emitWithAck('lobby:join', { code });
      await host.emitWithAck('fleet:place', { code, placements: fa.ships });
      const started = waitFor(host, 'turn:changed');
      await guest.emitWithAck('fleet:place', { code, placements: fb.ships });
      await started;
      const ack = await host.emitWithAck('shot:fire', { code, moveId: `${code}-0`, target: firstTarget });
      host.disconnect();
      guest.disconnect();
      return ack.ok === true;
    });

    const results = await Promise.all(games);
    expect(results.every(Boolean)).toBe(true);
    expect(results).toHaveLength(N);
  });
});
