import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, HAS_DB, resetDb, type TestContext } from './setup-app';

const creds = { email: 'stat@example.com', password: 'password123', displayName: 'Statler' };
const RESULT_A = '11111111-1111-4111-8111-111111111111';
const RESULT_B = '22222222-2222-4222-8222-222222222222';

describe.skipIf(!HAS_DB)('Stats-Schreibpfad (US2, Integration)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  async function registerAndCookie(): Promise<string[]> {
    const res = await http().post('/auth/register').send(creds);
    return res.headers['set-cookie'] as unknown as string[];
  }

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });

  it('Sieg erhöht wins und gamesPlayed um 1 (US2-1, SC-002)', async () => {
    const cookie = await registerAndCookie();
    const res = await http()
      .post('/me/match-results')
      .set('Cookie', cookie)
      .send({ resultId: RESULT_A, outcome: 'win' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ gamesPlayed: 1, wins: 1, losses: 0, winRate: 1 });
  });

  it('Niederlage erhöht losses und gamesPlayed um 1 (US2-2)', async () => {
    const cookie = await registerAndCookie();
    const res = await http()
      .post('/me/match-results')
      .set('Cookie', cookie)
      .send({ resultId: RESULT_A, outcome: 'loss' });
    expect(res.body).toEqual({ gamesPlayed: 1, wins: 0, losses: 1, winRate: 0 });
  });

  it('gleiche resultId zählt nicht doppelt (US2-6, SC-006)', async () => {
    const cookie = await registerAndCookie();
    await http().post('/me/match-results').set('Cookie', cookie).send({ resultId: RESULT_A, outcome: 'win' });
    const second = await http()
      .post('/me/match-results')
      .set('Cookie', cookie)
      .send({ resultId: RESULT_A, outcome: 'win' });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ gamesPlayed: 1, wins: 1, losses: 0, winRate: 1 });
  });

  it('verschiedene resultIds akkumulieren und winRate ist konsistent (SC-003)', async () => {
    const cookie = await registerAndCookie();
    await http().post('/me/match-results').set('Cookie', cookie).send({ resultId: RESULT_A, outcome: 'win' });
    const res = await http()
      .post('/me/match-results')
      .set('Cookie', cookie)
      .send({ resultId: RESULT_B, outcome: 'loss' });
    expect(res.body).toEqual({ gamesPlayed: 2, wins: 1, losses: 1, winRate: 0.5 });
  });

  it('GET /me/stats spiegelt die erfassten Werte (US2-3)', async () => {
    const cookie = await registerAndCookie();
    await http().post('/me/match-results').set('Cookie', cookie).send({ resultId: RESULT_A, outcome: 'win' });
    const res = await http().get('/me/stats').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ gamesPlayed: 1, wins: 1, losses: 0, winRate: 1 });
  });

  it('Persistenz über erneute Anmeldung (US2-4, SC-004)', async () => {
    const cookie = await registerAndCookie();
    await http().post('/me/match-results').set('Cookie', cookie).send({ resultId: RESULT_A, outcome: 'win' });
    await http().post('/auth/logout').set('Cookie', cookie);
    const login = await http().post('/auth/login').send({ email: creds.email, password: creds.password });
    const res = await http().get('/me/stats').set('Cookie', login.headers['set-cookie']);
    expect(res.body).toEqual({ gamesPlayed: 1, wins: 1, losses: 0, winRate: 1 });
  });

  it('ungültiges outcome → 400', async () => {
    const cookie = await registerAndCookie();
    const res = await http()
      .post('/me/match-results')
      .set('Cookie', cookie)
      .send({ resultId: RESULT_A, outcome: 'draw' });
    expect(res.status).toBe(400);
  });

  it('anonym → 401 auf Stats-Routen', async () => {
    expect((await http().get('/me/stats')).status).toBe(401);
    expect(
      (await http().post('/me/match-results').send({ resultId: RESULT_A, outcome: 'win' })).status,
    ).toBe(401);
  });
});
