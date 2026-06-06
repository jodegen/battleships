import { Module } from '@nestjs/common';

import { GameModule } from '../game/game.module';
import { LobbyModule } from '../lobby/lobby.module';
import { MatchmakingRepository } from './matchmaking.repository';
import { MatchmakingService } from './matchmaking.service';

// RedisModule ist global; GameModule liefert den GraceTimerService (Wartetimeout, research.md §4);
// LobbyModule liefert LobbyService + LobbyRepository (bestehende Lobby-Erzeugung & Aktiv-Index).
@Module({
  imports: [LobbyModule, GameModule],
  providers: [MatchmakingRepository, MatchmakingService],
  exports: [MatchmakingService, MatchmakingRepository],
})
export class MatchmakingModule {}
