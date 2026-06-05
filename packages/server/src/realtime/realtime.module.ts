import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { GameModule } from '../game/game.module';
import { LobbyModule } from '../lobby/lobby.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { GameGateway } from './game.gateway';

@Module({
  imports: [AuthModule, LobbyModule, GameModule, PersistenceModule],
  providers: [GameGateway],
})
export class RealtimeModule {}
