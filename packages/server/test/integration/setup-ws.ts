import type { AddressInfo } from 'node:net';

import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';

// WS-Integrationstests brauchen echte Postgres UND Redis.
export const HAS_INFRA = Boolean(process.env.DATABASE_URL) && Boolean(process.env.REDIS_URL);

export interface WsContext {
  readonly app: INestApplication;
  readonly prisma: PrismaService;
  readonly redis: RedisService;
  readonly port: number;
}

export async function createWsApp(): Promise<WsContext> {
  process.env.COOKIE_SECRET ??= 'test-cookie-secret';
  process.env.GUEST_TOKEN_SECRET ??= 'test-guest-secret';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser(process.env.COOKIE_SECRET));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const redis = app.get(RedisService);
  // Tests laufen single-instance → Standard-Socket.IO-Adapter genügt. Der Redis-Pub/Sub-
  // Adapter (mehr-Instanz) wird in Produktion (main.ts) verdrahtet; hier nicht nötig.

  await app.init();
  await app.listen(0);
  const port = (app.getHttpServer().address() as AddressInfo).port;
  return { app, prisma: app.get(PrismaService), redis, port };
}

/** Registriert einen Nutzer und liefert dessen Session-Cookie zurück. */
export async function registerCookie(
  app: INestApplication,
  email: string,
  displayName: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'password123', displayName });
  return extractCookie(res.headers['set-cookie']);
}

/** Erzeugt ein Gast-Cookie über den Auth-Endpunkt. */
export async function guestCookie(app: INestApplication, displayName: string): Promise<string> {
  const res = await request(app.getHttpServer()).post('/auth/guest').send({ displayName });
  return extractCookie(res.headers['set-cookie']);
}

function extractCookie(setCookie: string | string[] | undefined): string {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return arr.map((c) => c.split(';')[0]).join('; ');
}

/** Verbindet einen socket.io-Client (optional mit Cookie) und wartet auf `connect`. */
export function connect(port: number, cookie?: string): Promise<Socket> {
  const socket = io(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: cookie ? { cookie } : {},
  });
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

/** Wartet auf das nächste Event `name` (mit Timeout). */
export function waitFor<T = unknown>(socket: Socket, name: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${name}`)), timeoutMs);
    socket.once(name, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

export async function flushRedis(redis: RedisService): Promise<void> {
  await redis.client.flushdb();
}
