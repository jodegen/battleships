import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDb } from './setup-app';
import { connect, createWsApp, flushRedis, HAS_INFRA, startGame, waitFor, type WsContext } from './setup-ws';

/** Sammelt alle eingehenden Event-Payloads eines Sockets (für den Leak-Scan). */
function collectAll(socket: Socket): unknown[] {
  const seen: unknown[] = [];
  socket.onAny((_event: string, ...args: unknown[]) => seen.push(...args));
  return seen;
}

describe.skipIf(!HAS_INFRA)('Reconnect: Token-Geheimhaltung (005, Polish)', () => {
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

  it('reconnectToken erscheint in keinem Broadcast/keiner Projektion (nur im create/join-Ack)', async () => {
    const g = await startGame(ctx);
    const guestSeen = collectAll(g.guest);

    const disconnected = waitFor(g.guest, 'opponent:disconnected');
    g.host.disconnect();
    await disconnected;

    const host2 = await connect(ctx.port, g.hostCookie);
    const hostSeen = collectAll(host2);
    const viewP = waitFor(host2, 'game:view'); // VOR dem Emit registrieren (Server sendet vor dem Ack)
    await host2.emitWithAck('reconnect:resume', { code: g.code, token: g.hostToken });
    await viewP;
    // kurze Sammelzeit für lobby:state/opponent:reconnected
    await new Promise((r) => setTimeout(r, 100));

    const haystack = JSON.stringify([...guestSeen, ...hostSeen]);
    expect(haystack).not.toContain(g.hostToken);
    expect(haystack).not.toContain(g.guestToken);

    host2.disconnect();
    g.guest.disconnect();
  });
});
