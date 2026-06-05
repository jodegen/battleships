import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDb } from './setup-app';
import {
  connect,
  createWsApp,
  flushRedis,
  guestCookie,
  HAS_INFRA,
  registerCookie,
  type WsContext,
} from './setup-ws';

const SETTINGS = { allowTouching: true, turnTimerSeconds: null, extraTurnOnHit: true };

describe.skipIf(!HAS_INFRA)('Lobby erstellen & beitreten (US1, FR-001/003/004)', () => {
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

  it('eingeloggter Spieler erstellt eine Lobby und erhält einen Code (FR-001)', async () => {
    const cookie = await registerCookie(ctx.app, 'host1@x.com', 'Alice');
    const socket = await connect(ctx.port, cookie);
    const ack = await socket.emitWithAck('lobby:create', { settings: SETTINGS });
    expect(ack.ok).toBe(true);
    expect(typeof ack.code).toBe('string');
    expect(ack.lobby.status).toBe('waiting');
    socket.disconnect();
  });

  it('Gast darf KEINE Lobby erstellen (FR-001)', async () => {
    const cookie = await guestCookie(ctx.app, 'Bob');
    const socket = await connect(ctx.port, cookie);
    const ack = await socket.emitWithAck('lobby:create', { settings: SETTINGS });
    expect(ack).toEqual({ ok: false, error: 'forbidden' });
    socket.disconnect();
  });

  it('anonym darf keine Lobby erstellen (unauthenticated)', async () => {
    const socket = await connect(ctx.port);
    const ack = await socket.emitWithAck('lobby:create', { settings: SETTINGS });
    expect(ack).toEqual({ ok: false, error: 'unauthenticated' });
    socket.disconnect();
  });

  it('Gast tritt per Code bei → Status placing (FR-003/008)', async () => {
    const hostCookie = await registerCookie(ctx.app, 'host2@x.com', 'Alice');
    const host = await connect(ctx.port, hostCookie);
    const { code } = await host.emitWithAck('lobby:create', { settings: SETTINGS });

    const guest = await connect(ctx.port, await guestCookie(ctx.app, 'Bob'));
    const ack = await guest.emitWithAck('lobby:join', { code });
    expect(ack.ok).toBe(true);
    expect(ack.lobby.status).toBe('placing');
    expect(ack.lobby.players).toHaveLength(2);
    host.disconnect();
    guest.disconnect();
  });

  it('ungültiger Code wird abgelehnt; volle Lobby wird abgelehnt (FR-004)', async () => {
    const guest = await connect(ctx.port, await guestCookie(ctx.app, 'Bob'));
    // ungültiges Format (Z ist kein lesbares Code-Zeichen)
    expect((await guest.emitWithAck('lobby:join', { code: 'ZZZ-ZZZ' })).error).toBe('invalid-code');
    // gültiges Format, aber nicht existent
    expect((await guest.emitWithAck('lobby:join', { code: 'AAA-BBB' })).error).toBe('lobby-not-found');

    const host = await connect(ctx.port, await registerCookie(ctx.app, 'host3@x.com', 'Alice'));
    const { code } = await host.emitWithAck('lobby:create', { settings: SETTINGS });
    await guest.emitWithAck('lobby:join', { code });

    const third = await connect(ctx.port, await guestCookie(ctx.app, 'Eve'));
    expect((await third.emitWithAck('lobby:join', { code })).error).toBe('lobby-full');
    host.disconnect();
    guest.disconnect();
    third.disconnect();
  });
});
