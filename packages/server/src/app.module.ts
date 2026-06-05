import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { AppConfigModule } from './config/config.module';
import { GameModule } from './game/game.module';
import { LobbyModule } from './lobby/lobby.module';
import { PersistenceModule } from './persistence/persistence.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';
import { StatsModule } from './stats/stats.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppConfigModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    StatsModule,
    // M3 (004): Realtime/Redis-Schicht
    RedisModule,
    LobbyModule,
    GameModule,
    PersistenceModule,
    RealtimeModule,
  ],
})
export class AppModule {}
