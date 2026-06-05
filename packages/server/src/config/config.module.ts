import { Global, Module } from '@nestjs/common';

import { type AppConfig, loadAppConfig } from './app-config';

export const APP_CONFIG = 'APP_CONFIG';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => loadAppConfig() }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
