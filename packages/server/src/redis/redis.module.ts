import { Global, Module } from '@nestjs/common';

import { RedisService } from './redis.service';

// APP_CONFIG stammt aus dem globalen AppConfigModule (in AppModule eingebunden).
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
