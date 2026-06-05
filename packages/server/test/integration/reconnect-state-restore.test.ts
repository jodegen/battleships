import { shipCells } from '@schiffe/engine';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDb } from './setup-app';
import {
  connect,
  createWsApp,
  flushRedis,
  HAS_INFRA,
  registerCookie,
  startGame,
  waitFor,
  type WsContext,
} from './setup-ws';

interface GameView {
  own: { ships: unknown[]; shotsReceived: unknown[] };
  opponentShots: Array<{ coord: { x: number; y: number }; outcome: string }>;
  turn: string;
  turnDeadline: number | null;
}

// Reconnect-Fenster großzügig: hier wird stets innerhalb des Fensters wieder verbunden.
describe.skipIf(!HAS_INFRA)('Reconnect: Zustands-Wiederherstellung (005, US1)', () => {
  let ctx: WsContext;
  beforeAll(async () => {
    process.env.RECONNECT_WINDOW_MS = '5000';
    ctx = await createWsApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await flushRedis(ctx.redis);
  });

  it('stellt eigene Flotte + Schuss-Historie wieder her, ohne gegnerische Schiffe zu leaken (FR-008/009, SC-002)', async () => {
    const g = await startGame(ctx);
    // Host (A) am Zug: ein Treffer auf eine B-Zelle → erzeugt eigene Schuss-Historie.
    const target = shipCells(g.fb[0])[0];
    await g.host.emitWithAck('shot:fire', { code: g.code, moveId: 'm1', target });

    const disconnected = waitFor(g.guest, 'opponent:disconnected');
    g.host.disconnect();
    await disconnected;

    const host2 = await connect(ctx.port, g.hostCookie);
    const viewP = waitFor<GameView>(host2, 'game:view');
    const ack = await host2.emitWithAck('reconnect:resume', { code: g.code, token: g.hostToken });
    expect(ack).toMatchObject({ ok: true, you: 'A' });

    const view = await viewP;
    expect(view.own.ships.length).toBe(g.fa.length); // eigene Flotte wiederhergestellt
    expect(view.opponentShots.some((s) => s.coord.x === target.x && s.coord.y === target.y)).toBe(true);
    // Fog of War: game:view trägt strukturell keine gegnerische Flotte (nur own.ships + opponentShots).
    expect(Object.keys(view)).not.toContain('opponent');

    host2.disconnect();
    g.guest.disconnect();
  });

  it('reconnect:resume mit fremdem/falschem Token → forbidden, Sitz bleibt reserviert (FR-002, SC-007)', async () => {
    const g = await startGame(ctx);
    const disconnected = waitFor(g.guest, 'opponent:disconnected');
    g.host.disconnect();
    await disconnected;

    // Fremder eingeloggter Nutzer ohne passendes Token/Identität.
    const intruder = await connect(ctx.port, await registerCookie(ctx.app, 'eve@x.com', 'Eve'));
    const bad = await intruder.emitWithAck('reconnect:resume', { code: g.code, token: 'bogus' });
    expect(bad).toMatchObject({ ok: false, error: 'forbidden' });
    intruder.disconnect();

    // Der legitime Host kann weiterhin mit gültigem Token zurückkehren.
    const host2 = await connect(ctx.port, g.hostCookie);
    const ok = await host2.emitWithAck('reconnect:resume', { code: g.code, token: g.hostToken });
    expect(ok).toMatchObject({ ok: true, you: 'A' });

    host2.disconnect();
    g.guest.disconnect();
  });
});
