import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, HAS_DB, resetDb, type TestContext } from './setup-app';

const creds = { email: 'alice@example.com', password: 'password123', displayName: 'Alice' };

describe.skipIf(!HAS_DB)('Auth-Flow (US1, Integration)', () => {
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

  it('register: 201 + sid-Cookie + Nullstatistik (US1-1, SC-001)', async () => {
    const res = await http().post('/auth/register').send(creds);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      displayName: 'Alice',
      stats: { gamesPlayed: 0, wins: 0, losses: 0, winRate: 0 },
    });
    expect(String(res.headers['set-cookie'])).toContain('sid=');
  });

  it('register: doppelte E-Mail → 409 (US1-2)', async () => {
    await http().post('/auth/register').send(creds);
    const res = await http().post('/auth/register').send({ ...creds, displayName: 'Bob' });
    expect(res.status).toBe(409);
  });

  it('register: Passwort < 8 Zeichen → 400 (FR-023, SC-009)', async () => {
    const res = await http().post('/auth/register').send({ ...creds, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('register: 8-Zeichen-Passwort ohne Sonderzeichen wird akzeptiert (SC-009)', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ ...creds, password: 'abcdefgh' });
    expect(res.status).toBe(201);
  });

  it('login: 200 + Cookie (US1-3)', async () => {
    await http().post('/auth/register').send(creds);
    const res = await http().post('/auth/login').send({ email: creds.email, password: creds.password });
    expect(res.status).toBe(200);
    expect(String(res.headers['set-cookie'])).toContain('sid=');
  });

  it('login: falsches Passwort → 401 (US1-4, FR-008)', async () => {
    await http().post('/auth/register').send(creds);
    const res = await http()
      .post('/auth/login')
      .send({ email: creds.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('login: unbekannte E-Mail → 401 (gleich wie falsches Passwort, keine Enumeration)', async () => {
    const res = await http()
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever1' });
    expect(res.status).toBe(401);
  });

  it('GET /me ohne Cookie → anonymous', async () => {
    const res = await http().get('/me');
    expect(res.body).toEqual({ kind: 'anonymous' });
  });

  it('Session-Restore: GET /me mit Cookie → user (US1-5, SC-010)', async () => {
    const reg = await http().post('/auth/register').send(creds);
    const cookie = reg.headers['set-cookie'];
    const res = await http().get('/me').set('Cookie', cookie);
    expect(res.body).toEqual({ kind: 'user', displayName: 'Alice' });
  });

  it('GET /me/profile: anonym → 401', async () => {
    const res = await http().get('/me/profile');
    expect(res.status).toBe(401);
  });

  it('GET /me/profile: eingeloggt → 200 mit Profil (US2-3, US2-5)', async () => {
    const reg = await http().post('/auth/register').send(creds);
    const res = await http().get('/me/profile').set('Cookie', reg.headers['set-cookie']);
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Alice');
    expect(res.body.stats).toEqual({ gamesPlayed: 0, wins: 0, losses: 0, winRate: 0 });
  });

  it('logout: 204, danach GET /me → anonymous (US1-6, FR-010)', async () => {
    const reg = await http().post('/auth/register').send(creds);
    const cookie = reg.headers['set-cookie'];
    const out = await http().post('/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(204);
    const me = await http().get('/me').set('Cookie', cookie);
    expect(me.body).toEqual({ kind: 'anonymous' });
  });

  it('Passwörter werden nie im Klartext zurückgegeben (SC-008)', async () => {
    const res = await http().post('/auth/register').send(creds);
    expect(JSON.stringify(res.body)).not.toContain(creds.password);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });
});
