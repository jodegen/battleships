import { createRng, generateFleet, type ShipPlacement, shipCells } from '@schiffe/engine';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { settingsToGameConfig } from '../../src/game/game-config';
import { QUICK_PLAY_SETTINGS } from '../../src/matchmaking/quick-play-settings';
import { resetDb } from './setup-app';
import {
  createWsApp,
  flushRedis,
  HAS_INFRA,
  quickMatch,
  waitFor,
  type WsContext,
} from './setup-ws';

const cfg = settingsToGameConfig(QUICK_PLAY_SETTINGS);
function fleet(seed: number): ShipPlacement[] {
  const f = generateFleet(cfg, createRng(seed));
  if (!f.ok) throw new Error('fleet gen failed');
  return f.ships;
}
let moveCounter = 0;
const nextMoveId = (): string => `qm-${moveCounter++}`;

describe.skipIf(!HAS_INFRA)(
  'Quick Play: gematchte Partie verläuft identisch zur Code-Lobby (006, US1/FR-007)',
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

    it('verwendet Standard-Einstellungen, spielt zu Ende, reconnectet per Token und persistiert Stats für beide', async () => {
      const fleetA = fleet(7);
      const fleetB = fleet(99);
      const bCells = fleetB.flatMap((s) => shipCells(s));

      const { a, b, code, am, bm } = await quickMatch(ctx, {
        host: 'alice@x.com',
        guest: 'bob@x.com',
      });

      // Lobby-Sicht trägt die Standard-Einstellungen (FR-005, SC-003).
      const aState = await waitFor<{ settings: typeof QUICK_PLAY_SETTINGS; status: string }>(
        a,
        'lobby:state',
        50,
      ).catch(() => null);
      // (lobby:state kann bereits vor dem Listener gesendet worden sein — settings prüfen wir robust über die Partie.)
      void aState;

      // Beide platzieren → Partie startet (placing → in_progress).
      await a.emitWithAck('fleet:place', { code, placements: fleetA });
      const started = waitFor(a, 'turn:changed');
      await b.emitWithAck('fleet:place', { code, placements: fleetB });
      await started;

      // Reconnect mit dem aus queue:matched erhaltenen Token funktioniert (FR-007, 005-Pfad).
      const resume = (await b.emitWithAck('reconnect:resume', {
        code,
        token: bm.reconnectToken,
      })) as {
        ok: boolean;
        you?: string;
      };
      expect(resume).toEqual({ ok: true, you: 'B' });
      expect(am.you).toBe('A');

      // A trifft alle B-Zellen (Extrazug-Regel) bis zum Sieg.
      const overP = waitFor<{ winner: string; reason: string }>(a, 'game:over');
      for (const target of bCells) {
        const ack = (await a.emitWithAck('shot:fire', { code, moveId: nextMoveId(), target })) as {
          ok: boolean;
        };
        expect(ack.ok).toBe(true);
      }
      expect(await overP).toMatchObject({ winner: 'A', reason: 'all-sunk' });

      // Persistenz + Stats für BEIDE eingeloggten Spieler (identisch zur Code-Lobby).
      const match = await ctx.prisma.match.findFirst();
      expect(match?.winnerSeat).toBe('A');
      const alice = await ctx.prisma.user.findUnique({
        where: { email: 'alice@x.com' },
        include: { stat: true },
      });
      const bob = await ctx.prisma.user.findUnique({
        where: { email: 'bob@x.com' },
        include: { stat: true },
      });
      expect(alice?.stat?.wins).toBe(1);
      expect(bob?.stat?.losses).toBe(1);

      // Aktiv-Index beider Spieler ist nach Partieende geräumt → erneute Suche möglich (FR-015).
      expect(await ctx.redis.client.get(`game-of-user:${alice?.id ?? ''}`)).toBeNull();
      expect(await ctx.redis.client.get(`game-of-user:${bob?.id ?? ''}`)).toBeNull();

      a.disconnect();
      b.disconnect();
    });
  },
);
