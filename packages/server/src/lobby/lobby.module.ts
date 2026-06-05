import { Module } from '@nestjs/common';

import { LobbyRepository } from './lobby.repository';
import { LobbyService } from './lobby.service';

@Module({
  providers: [LobbyRepository, LobbyService],
  exports: [LobbyRepository, LobbyService],
})
export class LobbyModule {}
