import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { toProfileView, type ProfileView } from '../stats/stats.view';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import {
  clearSessionCookie,
  SESSION_COOKIE,
  setGuestCookie,
  setSessionCookie,
} from './cookies';
import { GuestDto } from './dto/guest.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GuestTokenService } from './guest-token.service';
import { SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly guestTokens: GuestTokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('register')
  @HttpCode(201)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProfileView> {
    const { user, token } = await this.auth.register(dto);
    setSessionCookie(res, token, this.config);
    // Frisch angelegt → Statistik ist null.
    return toProfileView(user.displayName, { wins: 0, losses: 0 });
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProfileView> {
    const { user, token } = await this.auth.login(dto);
    setSessionCookie(res, token, this.config);
    const stat = await this.users.getStat(user.id);
    return toProfileView(user.displayName, stat);
  }

  @Post('guest')
  @HttpCode(201)
  guest(
    @Body() dto: GuestDto,
    @Res({ passthrough: true }) res: Response,
  ): { kind: 'guest'; displayName: string } {
    const displayName = dto.displayName.trim();
    setGuestCookie(res, this.guestTokens.issue(displayName), this.config);
    return { kind: 'guest', displayName };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) await this.sessions.revoke(token);
    clearSessionCookie(res, this.config);
  }
}
