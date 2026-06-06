import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDb } from './setup-app';
import {
  connect,
  createWsApp,
  flushRedis,
  HAS_INFRA,
  registerCookie,
  waitFor,
  type WsContext,
} from './setup-ws';

interface JoinAck {
  ok: boolean;
  status?: 'waiting' | 'matched';
  error?: string;
}
interface Matched {
  code: string;
  you: 'A' | 'B';
  reconnectToken: string;
}

describe.skipIf(!HAS_INFRA)(
  'Quick Play: atomare Paarung ohne Doppel-Match (006, US1/FR-012)',
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

    it('paart zwei suchende Spieler in dieselbe Lobby (früher Wartender = Host A)', async () => {
      const a = await connect(ctx.port, await registerCookie(ctx.app, 'a1@x.com', 'Alice'));
      const aMatched = waitFor<Matched>(a, 'queue:matched');
      const aAck = (await a.emitWithAck('queue:join', {})) as JoinAck;
      expect(aAck).toEqual({ ok: true, status: 'waiting' });

      const b = await connect(ctx.port, await registerCookie(ctx.app, 'b1@x.com', 'Bob'));
      const bMatched = waitFor<Matched>(b, 'queue:matched');
      const bAck = (await b.emitWithAck('queue:join', {})) as JoinAck;
      expect(bAck).toEqual({ ok: true, status: 'matched' });

      const [am, bm] = await Promise.all([aMatched, bMatched]);
      expect(am.code).toBe(bm.code); // dieselbe Lobby
      expect(am.you).toBe('A'); // früher Wartender ist Host
      expect(bm.you).toBe('B');
      expect(am.reconnectToken).toBeTruthy();
      expect(bm.reconnectToken).toBeTruthy();

      // Warteschlange ist leer → kein dritter Eintrag (FR-011).
      expect(await ctx.redis.client.zcard('quickplay:queue')).toBe(0);

      a.disconnect();
      b.disconnect();
    });

    it('paart bei GLEICHZEITIGEM Beitritt genau einmal (kein Doppel-/Selbst-Match, SC-006)', async () => {
      const a = await connect(ctx.port, await registerCookie(ctx.app, 'a2@x.com', 'Alice'));
      const b = await connect(ctx.port, await registerCookie(ctx.app, 'b2@x.com', 'Bob'));
      const aMatched = waitFor<Matched>(a, 'queue:matched');
      const bMatched = waitFor<Matched>(b, 'queue:matched');

      const [ackA, ackB] = (await Promise.all([
        a.emitWithAck('queue:join', {}),
        b.emitWithAck('queue:join', {}),
      ])) as JoinAck[];

      // Genau einer reiht sich ein, der andere matched — nie beide gleich.
      expect(new Set([ackA.status, ackB.status])).toEqual(new Set(['waiting', 'matched']));

      const [am, bm] = await Promise.all([aMatched, bMatched]);
      expect(am.code).toBe(bm.code);
      expect(new Set([am.you, bm.you])).toEqual(new Set(['A', 'B']));
      expect(await ctx.redis.client.zcard('quickplay:queue')).toBe(0);

      a.disconnect();
      b.disconnect();
    });

    it('lässt einen einzelnen Sucher wartend (kein Match)', async () => {
      const a = await connect(ctx.port, await registerCookie(ctx.app, 'solo@x.com', 'Solo'));
      const ack = (await a.emitWithAck('queue:join', {})) as JoinAck;
      expect(ack).toEqual({ ok: true, status: 'waiting' });
      expect(await ctx.redis.client.zcard('quickplay:queue')).toBe(1);
      a.disconnect();
    });
  },
);
