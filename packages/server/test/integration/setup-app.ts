import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

// Integrationstests laufen nur, wenn eine echte Postgres erreichbar ist (DATABASE_URL gesetzt).
// Lokal: `docker compose up -d` + `npm run -w @schiffe/server prisma:deploy`. CI: Postgres-Service.
export const HAS_DB = Boolean(process.env.DATABASE_URL);

export interface TestContext {
  readonly app: INestApplication;
  readonly prisma: PrismaService;
}

export async function createTestApp(): Promise<TestContext> {
  process.env.COOKIE_SECRET ??= 'test-cookie-secret';
  process.env.GUEST_TOKEN_SECRET ??= 'test-guest-secret';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser(process.env.COOKIE_SECRET));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.matchResult.deleteMany();
  await prisma.session.deleteMany();
  await prisma.stat.deleteMany();
  await prisma.user.deleteMany();
}
