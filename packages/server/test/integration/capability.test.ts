import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, HAS_DB, resetDb, type TestContext } from './setup-app';

// FR-003 / US4: Capability-Matrix über alle eingeloggt-only-Routen.
const PROTECTED: ReadonlyArray<{ method: 'get' | 'post'; path: string }> = [
  { method: 'get', path: '/me/profile' },
  { method: 'get', path: '/me/stats' },
  { method: 'post', path: '/me/match-results' },
];

describe.skipIf(!HAS_DB)('Capability-Gating (US4, Integration)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  async function userCookie(): Promise<string[]> {
    const res = await http()
      .post('/auth/register')
      .send({ email: 'u4@example.com', password: 'password123', displayName: 'Userin' });
    return res.headers['set-cookie'] as unknown as string[];
  }
  async function guestCookie(): Promise<string[]> {
    const res = await http().post('/auth/guest').send({ displayName: 'Gastinger' });
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

  it('anonym → 401 auf allen geschützten Routen', async () => {
    for (const route of PROTECTED) {
      const res = await http()[route.method](route.path).send({});
      expect(res.status, route.path).toBe(401);
    }
  });

  it('Gast → 403 auf allen geschützten Routen', async () => {
    const cookie = await guestCookie();
    for (const route of PROTECTED) {
      const res = await http()[route.method](route.path).set('Cookie', cookie).send({});
      expect(res.status, route.path).toBe(403);
    }
  });

  it('eingeloggt → kein 401/403 auf geschützten Routen', async () => {
    const cookie = await userCookie();
    const profile = await http().get('/me/profile').set('Cookie', cookie);
    const stats = await http().get('/me/stats').set('Cookie', cookie);
    expect(profile.status).toBe(200);
    expect(stats.status).toBe(200);
  });

  it('GET /me liefert den korrekten Typ je Identität (SC-007)', async () => {
    expect((await http().get('/me')).body).toEqual({ kind: 'anonymous' });
    expect((await http().get('/me').set('Cookie', await guestCookie())).body).toEqual({
      kind: 'guest',
      displayName: 'Gastinger',
    });
    expect((await http().get('/me').set('Cookie', await userCookie())).body).toEqual({
      kind: 'user',
      displayName: 'Userin',
    });
  });
});
