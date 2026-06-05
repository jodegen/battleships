import { Module } from '@nestjs/common';

import { LoggedInGuard } from '../auth/guards/logged-in.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, LoggedInGuard],
  exports: [UsersService],
})
export class UsersModule {}
