import type { AddressInfo } from 'node:net';

import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createRng, generateFleet, type ShipPlacement } from '@schiffe/engine';
import cookieParser from 'cookie-parser';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { settingsToGameConfig } from '../../src/game/game-config';
import type { LobbySettings } from '../../src/realtime/events';
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
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

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

export interface StartedGame {
  readonly code: string;
  readonly host: Socket;
  readonly guest: Socket;
  readonly hostCookie: string;
  readonly guestCookie: string;
  readonly hostToken: string;
  readonly guestToken: string;
  readonly hostEmail: string;
  readonly guestEmail: string;
  readonly fa: ShipPlacement[];
  readonly fb: ShipPlacement[];
}

const DEFAULT_GAME_SETTINGS: LobbySettings = {
  allowTouching: true,
  turnTimerSeconds: null,
  extraTurnOnHit: true,
};

/** Bringt zwei eingeloggte Spieler bis `in_progress` (Host A am Zug). Liefert Codes/Tokens/Fleets. */
export async function startGame(
  ctx: WsContext,
  settings: LobbySettings = DEFAULT_GAME_SETTINGS,
  emails: { host: string; guest: string } = { host: 'host@x.com', guest: 'guest@x.com' },
): Promise<StartedGame> {
  const hostCookie = await registerCookie(ctx.app, emails.host, 'Alice');
  const guestCookie = await registerCookie(ctx.app, emails.guest, 'Bob');

  const host = await connect(ctx.port, hostCookie);
  const create = (await host.emitWithAck('lobby:create', { settings })) as {
    ok: boolean;
    code: string;
    reconnectToken: string;
  };
  const guest = await connect(ctx.port, guestCookie);
  const join = (await guest.emitWithAck('lobby:join', { code: create.code })) as {
    ok: boolean;
    reconnectToken: string;
  };

  const cfg = settingsToGameConfig(settings);
  const fa = generateFleet(cfg, createRng(7));
  const fb = generateFleet(cfg, createRng(99));
  if (!fa.ok || !fb.ok) throw new Error('fleet');

  await host.emitWithAck('fleet:place', { code: create.code, placements: fa.ships });
  const started = waitFor(host, 'turn:changed');
  await guest.emitWithAck('fleet:place', { code: create.code, placements: fb.ships });
  await started;

  return {
    code: create.code,
    host,
    guest,
    hostCookie,
    guestCookie,
    hostToken: create.reconnectToken,
    guestToken: join.reconnectToken,
    hostEmail: emails.host,
    guestEmail: emails.guest,
    fa: fa.ships,
    fb: fb.ships,
  };
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface QueueMatchedPayload {
  readonly code: string;
  readonly you: 'A' | 'B';
  readonly reconnectToken: string;
}

export interface QuickMatch {
  readonly a: Socket;
  readonly b: Socket;
  readonly code: string;
  readonly am: QueueMatchedPayload;
  readonly bm: QueueMatchedPayload;
}

/**
 * Bringt zwei eingeloggte Spieler über Quick Play (`queue:join`) zur Paarung. Der zuerst Wartende
 * (A) wird Host. Liefert beide Sockets, den Lobby-Code und die `queue:matched`-Payloads (006).
 */
export async function quickMatch(
  ctx: WsContext,
  emails: { host: string; guest: string } = { host: 'qa@x.com', guest: 'qb@x.com' },
): Promise<QuickMatch> {
  const a = await connect(ctx.port, await registerCookie(ctx.app, emails.host, 'Alice'));
  const aMatched = waitFor<QueueMatchedPayload>(a, 'queue:matched');
  await a.emitWithAck('queue:join', {});

  const b = await connect(ctx.port, await registerCookie(ctx.app, emails.guest, 'Bob'));
  const bMatched = waitFor<QueueMatchedPayload>(b, 'queue:matched');
  await b.emitWithAck('queue:join', {});

  const [am, bm] = await Promise.all([aMatched, bMatched]);
  return { a, b, code: am.code, am, bm };
}
