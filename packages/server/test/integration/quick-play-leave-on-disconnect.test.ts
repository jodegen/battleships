import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDb } from './setup-app';
import {
  connect,
  createWsApp,
  flushRedis,
  HAS_INFRA,
  registerCookie,
  sleep,
  type WsContext,
} from './setup-ws';

describe.skipIf(!HAS_INFRA)(
  'Quick Play: Disconnect entfernt still aus der Queue (006, US2/FR-013)',
  () => {
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

    it('entfernt einen wartenden Spieler bei Disconnect — keine Partie, kein Statistik-Eintrag', async () => {
      const cookie = await registerCookie(ctx.app, 'wait@x.com', 'Wanda');
      const sock = await connect(ctx.port, cookie);
      const ack = (await sock.emitWithAck('queue:join', {})) as { ok: boolean; status?: string };
      expect(ack.status).toBe('waiting');
      expect(await ctx.redis.client.zcard('quickplay:queue')).toBe(1);

      sock.disconnect();
      await sleep(150); // handleDisconnect ist asynchron

      expect(await ctx.redis.client.zcard('quickplay:queue')).toBe(0);
      const user = await ctx.prisma.user.findUnique({
        where: { email: 'wait@x.com' },
        include: { stat: true },
      });
      expect(await ctx.redis.client.get(`quickplay:conn:${user?.id ?? ''}`)).toBeNull();

      // Es entstand keine Partie → kein Match referenziert diesen Spieler, keine Stats (SC-009).
      const matchesForUser = await ctx.prisma.match.count({
        where: { OR: [{ playerAId: user?.id }, { playerBId: user?.id }] },
      });
      expect(matchesForUser).toBe(0);
      // Stats wurden nicht hochgezählt (kein Spiel gewertet).
      expect(user?.stat?.wins ?? 0).toBe(0);
      expect(user?.stat?.losses ?? 0).toBe(0);
    });
  },
);
