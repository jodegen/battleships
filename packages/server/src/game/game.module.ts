import { Module } from '@nestjs/common';

import { GraceTimerService } from '../reconnect/grace-timer.service';
import { GameService } from './game.service';
import { TurnTimerService } from './turn-timer.service';

@Module({
  providers: [GameService, TurnTimerService, GraceTimerService],
  exports: [GameService, TurnTimerService, GraceTimerService],
})
export class GameModule {}
