import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

// Hinweis: Das frühere Verhalten „Disconnect während in_progress → sofortiger Forfeit" (004,
// FR-010a) ist durch das Reconnect-Fenster (005, FR-018) abgelöst und wird in den
// reconnect-*.test.ts geprüft. Hier verbleiben nur die unveränderten Vor-Spiel-Fälle (FR-018).
describe.skipIf(!HAS_INFRA)('Verlassen/Disconnect vor Spielstart (FR-018, unverändert zu 004)', () => {
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
});
