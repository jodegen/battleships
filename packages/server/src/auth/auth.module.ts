import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GuestTokenService } from './guest-token.service';
import { IdentityGuard } from './guards/identity.guard';
import { SessionService } from './session.service';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    GuestTokenService,
    // Globaler Identitäts-Guard: setzt request.identity für jede Anfrage (FR-001/002).
    { provide: APP_GUARD, useClass: IdentityGuard },
  ],
  exports: [SessionService, GuestTokenService],
})
export class AuthModule {}
