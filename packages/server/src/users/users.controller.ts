import { Controller, Get, Req, UnauthorizedException, UseGuards } from '@nestjs/common';

import {
  ANONYMOUS,
  isLoggedIn,
  type PublicIdentity,
  toPublicIdentity,
} from '../auth/identity';
import type { RequestWithIdentity } from '../auth/guards/identity.guard';
import { LoggedInGuard } from '../auth/guards/logged-in.guard';
import { toProfileView, type ProfileView } from '../stats/stats.view';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Aktuelle Identität (FR-002, SC-007) — auch für Session-Restore (SC-010). */
  @Get('me')
  me(@Req() req: RequestWithIdentity): PublicIdentity {
    return toPublicIdentity(req.identity ?? ANONYMOUS);
  }

  /** Profil mit Anzeigename + Statistik (FR-011) — nur eingeloggt (FR-003). */
  @Get('me/profile')
  @UseGuards(LoggedInGuard)
  async profile(@Req() req: RequestWithIdentity): Promise<ProfileView> {
    const identity = req.identity ?? ANONYMOUS;
    if (!isLoggedIn(identity)) {
      throw new UnauthorizedException();
    }
    const stat = await this.users.getStat(identity.userId);
    return toProfileView(identity.displayName, stat);
  }
}
