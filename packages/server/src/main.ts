import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { loadAppConfig } from './config/app-config';
import { RedisService } from './redis/redis.service';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const config = loadAppConfig();
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser(config.cookieSecret));
  app.enableCors({ origin: config.webOrigin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Socket.IO mit Redis-Pub/Sub-Backplane (M3/004): mehr-Instanz-fähige Lobby-Räume.
  const redis = app.get(RedisService);
  app.useWebSocketAdapter(new RedisIoAdapter(app, redis.duplicate(), redis.duplicate()));

  await app.listen(config.port);
}

void bootstrap();
