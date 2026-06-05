import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, HAS_DB, resetDb, type TestContext } from './setup-app';

const RESULT = '33333333-3333-4333-8333-333333333333';

describe.skipIf(!HAS_DB)('Gast (US3, Integration)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });

  it('POST /auth/guest: 201 + guest-Cookie, kein DB-Eintrag (US3-1, FR-014)', async () => {
    const res = await http().post('/auth/guest').send({ displayName: 'Gastinger' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ kind: 'guest', displayName: 'Gastinger' });
    expect(String(res.headers['set-cookie'])).toContain('guest=');
    expect(await ctx.prisma.user.count()).toBe(0);
  });

  it('ungültiger Anzeigename → 400 (US3-2, FR-013)', async () => {
    expect((await http().post('/auth/guest').send({ displayName: 'ab' })).status).toBe(400);
    expect((await http().post('/auth/guest').send({ displayName: 'admin' })).status).toBe(400);
  });

  it('GET /me mit Gast-Cookie → guest', async () => {
    const guest = await http().post('/auth/guest').send({ displayName: 'Gastinger' });
    const res = await http().get('/me').set('Cookie', guest.headers['set-cookie']);
    expect(res.body).toEqual({ kind: 'guest', displayName: 'Gastinger' });
  });

  it('Gast hat keine Statistik: /me/stats und /me/profile → 403 (US3-3, US4-4)', async () => {
    const guest = await http().post('/auth/guest').send({ displayName: 'Gastinger' });
    const cookie = guest.headers['set-cookie'];
    expect((await http().get('/me/stats').set('Cookie', cookie)).status).toBe(403);
    expect((await http().get('/me/profile').set('Cookie', cookie)).status).toBe(403);
  });

  it('Gast kann kein Ergebnis melden → 403 (US3-3)', async () => {
    const guest = await http().post('/auth/guest').send({ displayName: 'Gastinger' });
    const res = await http()
      .post('/me/match-results')
      .set('Cookie', guest.headers['set-cookie'])
      .send({ resultId: RESULT, outcome: 'win' });
    expect(res.status).toBe(403);
    expect(await ctx.prisma.matchResult.count()).toBe(0);
  });
});
