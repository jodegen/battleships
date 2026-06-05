import { Module } from '@nestjs/common';

import { LoggedInGuard } from '../auth/guards/logged-in.guard';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  controllers: [StatsController],
  providers: [StatsService, LoggedInGuard],
  exports: [StatsService],
})
export class StatsModule {}
