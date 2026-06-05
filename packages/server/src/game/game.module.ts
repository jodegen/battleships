import { Module } from '@nestjs/common';

import { GameService } from './game.service';
import { TurnTimerService } from './turn-timer.service';

@Module({
  providers: [GameService, TurnTimerService],
  exports: [GameService, TurnTimerService],
})
export class GameModule {}
