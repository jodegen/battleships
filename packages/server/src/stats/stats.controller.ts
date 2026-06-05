import { Body, Controller, Get, HttpCode, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';

import type { RequestWithIdentity } from '../auth/guards/identity.guard';
import { LoggedInGuard } from '../auth/guards/logged-in.guard';
import { ANONYMOUS, isLoggedIn } from '../auth/identity';
import { MatchResultDto } from './dto/match-result.dto';
import { StatsService } from './stats.service';
import type { StatsView } from './stats.view';

// Beide Routen sind eingeloggt-only (FR-003): Gast → 403, anonym → 401.
@Controller()
@UseGuards(LoggedInGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  private requireUserId(req: RequestWithIdentity): string {
    const identity = req.identity ?? ANONYMOUS;
    if (!isLoggedIn(identity)) throw new UnauthorizedException();
    return identity.userId;
  }

  @Get('me/stats')
  getStats(@Req() req: RequestWithIdentity): Promise<StatsView> {
    return this.stats.getStats(this.requireUserId(req));
  }

  @Post('me/match-results')
  @HttpCode(200)
  recordResult(
    @Req() req: RequestWithIdentity,
    @Body() dto: MatchResultDto,
  ): Promise<StatsView> {
    return this.stats.recordResult(this.requireUserId(req), dto.resultId, dto.outcome);
  }
}
