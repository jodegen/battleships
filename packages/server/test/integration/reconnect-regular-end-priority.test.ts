import { shipCells } from '@schiffe/engine';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDb } from './setup-app';
import {
  createWsApp,
  flushRedis,
  HAS_INFRA,
  sleep,
  startGame,
  waitFor,
  type StartedGame,
  type WsContext,
} from './setup-ws';

/** Alle Zellen der gegnerischen Flotte (B) in fester Reihenfolge. */
function enemyCells(g: StartedGame): Array<{ x: number; y: number }> {
  return g.fb.flatMap((ship) => shipCells(ship));
}

/** A (am Zug, Extrazug bei Treffer) versenkt alle B-Zellen BIS AUF die letzte. */
async function sinkAllButOne(g: StartedGame): Promise<{ x: number; y: number }> {
  const cells = enemyCells(g);
  for (let i = 0; i < cells.length - 1; i++) {
    await g.host.emitWithAck('shot:fire', { code: g.code, moveId: `pre-${i}`, target: cells[i] });
  }
  return cells[cells.length - 1]!;
}

async function expectSingleRegularValuation(ctx: WsContext, hostEmail: string, guestEmail: string): Promise<void> {
  const winner = await ctx.prisma.user.findUnique({ where: { email: hostEmail }, include: { stat: true } });
  const loser = await ctx.prisma.user.findUnique({ where: { email: guestEmail }, include: { stat: true } });
  // Sieger ist der, der versenkt hat (A); genau EIN Stats-Write je Spieler, keine Aufgabe-Doppelung.
  expect(winner?.stat?.wins).toBe(1);
  expect(winner?.stat?.losses).toBe(0);
  expect(loser?.stat?.losses).toBe(1);
  expect(loser?.stat?.wins).toBe(0);
}

// FR-019: Endet die Partie regulär (letztes Schiff versenkt) zeitgleich mit einem Disconnect,
// hat das reguläre Ergebnis Vorrang vor der Aufgabe-Wertung — und es wird genau einmal gewertet
// (FR-016). Window klein, damit der „Disconnect zuerst"-Fall schnell konvergiert.
describe.skipIf(!HAS_INFRA)('Reconnect: reguläres Spielende schlägt Aufgabe (005, FR-019)', () => {
  let ctx: WsContext;
  beforeAll(async () => {
    process.env.RECONNECT_WINDOW_MS = '800';
    ctx = await createWsApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await flushRedis(ctx.redis);
  });

  it('Schuss landet KURZ VOR dem Disconnect → reguläres all-sunk gewinnt, ein Stats-Write', async () => {
    const g = await startGame(ctx, undefined, { host: 'win@x.com', guest: 'lose@x.com' });
    const last = await sinkAllButOne(g);

    // Gewinnender Schuss wird vollständig verarbeitet (Ack), DANN trennt der Verlierer.
    const over = waitFor<{ winner: string; reason: string }>(g.host, 'game:over');
    const ack = await g.host.emitWithAck('shot:fire', { code: g.code, moveId: 'win', target: last });
    expect((ack as { ok: boolean }).ok).toBe(true);
    expect(await over).toMatchObject({ winner: 'A', reason: 'all-sunk' });

    g.guest.disconnect(); // späte Trennung darf das reguläre Ergebnis NICHT überschreiben
    await sleep(900); // länger als das Fenster — es darf keine zweite (Aufgabe-)Wertung geben
    await expectSingleRegularValuation(ctx, 'win@x.com', 'lose@x.com');

    g.host.disconnect();
  });

  it('Schuss und Disconnect PRAKTISCH GLEICHZEITIG → Sieger bleibt der Versenkende, genau ein Stats-Write', async () => {
    const g = await startGame(ctx, undefined, { host: 'win2@x.com', guest: 'lose2@x.com' });
    const last = await sinkAllButOne(g);

    // Ohne auf das Ack zu warten feuern und im selben Tick den Gegner trennen.
    const over = waitFor<{ winner: string }>(g.host, 'game:over', 4000);
    g.host.emit('shot:fire', { code: g.code, moveId: 'win', target: last });
    g.guest.disconnect();

    // Unabhängig von der Reihenfolge: Sieger ist A (der Versenkende bzw. Verbliebene).
    expect((await over).winner).toBe('A');
    await sleep(900); // Fenster + Persistenz abwarten; KEINE Doppelwertung
    await expectSingleRegularValuation(ctx, 'win2@x.com', 'lose2@x.com');

    g.host.disconnect();
  });
});
