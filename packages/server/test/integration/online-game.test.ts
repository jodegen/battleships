import { createRng, generateFleet, type ShipPlacement, shipCells } from '@schiffe/engine';
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
const cfg = settingsToGameConfig(SETTINGS);

function fleet(seed: number): ShipPlacement[] {
  const f = generateFleet(cfg, createRng(seed));
  if (!f.ok) throw new Error('fleet gen failed');
  return f.ships;
}

let moveCounter = 0;
const nextMoveId = (): string => `m-${moveCounter++}`;

describe.skipIf(!HAS_INFRA)('Online-Partie: server-autoritativ, Fog of War, Persistenz (US3/US6)', () => {
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

  it('spielt eine Partie zu Ende, leakt keine Gegnerflotte und persistiert Ergebnis+Stats', async () => {
    const fleetA = fleet(7);
    const fleetB = fleet(99);
    const aCells = fleetA.flatMap((s) => shipCells(s));
    const bCells = fleetB.flatMap((s) => shipCells(s));

    const host = await connect(ctx.port, await registerCookie(ctx.app, 'alice@x.com', 'Alice'));
    const { code } = await host.emitWithAck('lobby:create', { settings: SETTINGS });
    const guest = await connect(ctx.port, await guestCookie(ctx.app, 'Bob'));
    await guest.emitWithAck('lobby:join', { code });

    // Fog-of-War-Wächter: ALLE an den Gast (Seat B) gesendeten game:view sammeln.
    const guestViews: Array<{ opponentShots: unknown[] }> = [];
    guest.on('game:view', (v: { opponentShots: unknown[] }) => guestViews.push(v));

    // Beide platzieren → Partie startet.
    await host.emitWithAck('fleet:place', { code, placements: fleetA });
    const started = waitFor(host, 'turn:changed');
    await guest.emitWithAck('fleet:place', { code, placements: fleetB });
    await started;

    // A trifft alle B-Zellen nacheinander (Extrazug-Regel → A bleibt am Zug) bis Sieg.
    const overP = waitFor<{ winner: string; reason: string }>(host, 'game:over');
    for (const target of bCells) {
      const ack = await host.emitWithAck('shot:fire', { code, moveId: nextMoveId(), target });
      expect(ack.ok).toBe(true);
    }
    const over = await overP;
    expect(over).toMatchObject({ winner: 'A', reason: 'all-sunk' });

    // Fog of War (SC-003): der Gast hat NIE Schüsse abgegeben → kennt keine A-Schiffe.
    expect(guestViews.length).toBeGreaterThan(0);
    for (const v of guestViews) expect(v.opponentShots).toEqual([]);
    // Sanity: A und B Flotten sind disjunkt genug, dass der Test aussagekräftig ist.
    expect(aCells.length).toBeGreaterThan(0);

    // Persistenz (FR-024–026): Match + MatchMove + Stats des eingeloggten Spielers.
    const match = await ctx.prisma.match.findFirst({ include: { moves: true } });
    expect(match).not.toBeNull();
    expect(match?.winnerSeat).toBe('A');
    expect(match?.playerADisplay).toBe('Alice');
    expect(match?.playerBId).toBeNull(); // Gast hat keinen User-Eintrag
    expect(match?.playerBDisplay).toBe('Bob');
    expect(match?.moves.length).toBe(bCells.length);

    const alice = await ctx.prisma.user.findUnique({ where: { email: 'alice@x.com' }, include: { stat: true } });
    expect(alice?.stat?.wins).toBe(1);
    expect(alice?.stat?.losses).toBe(0);

    host.disconnect();
    guest.disconnect();
  });

  it('lehnt Schuss außer der Reihe ab (FR-014)', async () => {
    const host = await connect(ctx.port, await registerCookie(ctx.app, 'a2@x.com', 'Alice'));
    const { code } = await host.emitWithAck('lobby:create', { settings: SETTINGS });
    const guest = await connect(ctx.port, await guestCookie(ctx.app, 'Bob'));
    await guest.emitWithAck('lobby:join', { code });

    await host.emitWithAck('fleet:place', { code, placements: fleet(7) });
    const started = waitFor(host, 'turn:changed');
    await guest.emitWithAck('fleet:place', { code, placements: fleet(99) });
    await started;

    // B ist NICHT am Zug (Startspieler A) → Ablehnung.
    const ack = await guest.emitWithAck('shot:fire', { code, moveId: nextMoveId(), target: { x: 0, y: 0 } });
    expect(ack).toEqual({ ok: false, error: 'not-your-turn' });
    host.disconnect();
    guest.disconnect();
  });
});
