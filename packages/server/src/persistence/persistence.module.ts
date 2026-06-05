import { Module } from '@nestjs/common';

import { StatsModule } from '../stats/stats.module';
import { MatchService } from './match.service';

@Module({
  imports: [StatsModule],
  providers: [MatchService],
  exports: [MatchService],
})
export class PersistenceModule {}
