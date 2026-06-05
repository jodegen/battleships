import { Injectable } from '@nestjs/common';
import { Outcome, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { ReportedOutcome } from './dto/match-result.dto';
import { toStatsView, type StatsView } from './stats.view';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: string): Promise<StatsView> {
    const stat = await this.prisma.stat.findUnique({ where: { userId } });
    return toStatsView(stat);
  }

  /**
   * Idempotente Erfassung eines beendeten KI-Ergebnisses (FR-017/019, SC-002/006).
   * Eine Transaktion: MatchResult einfügen (Unique-Konflikt = bereits erfasst → No-Op),
   * sonst den passenden Stat-Zähler um 1 erhöhen.
   */
  async recordResult(
    userId: string,
    resultId: string,
    outcome: ReportedOutcome,
  ): Promise<StatsView> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.matchResult.create({
          data: { userId, resultId, outcome: outcome === 'win' ? Outcome.WIN : Outcome.LOSS },
        });
        await tx.stat.update({
          where: { userId },
          data: outcome === 'win' ? { wins: { increment: 1 } } : { losses: { increment: 1 } },
        });
      });
    } catch (error) {
      // Bereits verarbeitete resultId → idempotenter No-Op (FR-019).
      const isDuplicate =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!isDuplicate) throw error;
    }
    return this.getStats(userId);
  }
}
