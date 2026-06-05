import { Injectable } from '@nestjs/common';
import { MatchMode, MatchStatus, MoveResult, Prisma } from '@prisma/client';
import type { PlayerId } from '@schiffe/engine';

import { PrismaService } from '../prisma/prisma.service';
import { StatsService } from '../stats/stats.service';
import type { LobbyRecord } from '../lobby/lobby-types';
import { buildMatchWrite, type MatchPersistStatus } from './pvp-result';

/**
 * Persistiert beendete PvP-Partien (Match + MatchMove, Spec §9) und schreibt die Statistik
 * eingeloggter Spieler über den bestehenden idempotenten Pfad fort (persistence.md).
 */
@Injectable()
export class MatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: StatsService,
  ) {}

  async persistFinished(
    record: LobbyRecord,
    winner: PlayerId,
    status: MatchPersistStatus,
    now: number,
  ): Promise<void> {
    const { match, moves, statWrites } = buildMatchWrite(record, { winner, status, endedAt: now });

    let matchId: string;
    try {
      const created = await this.prisma.match.create({
        data: {
          matchKey: match.matchKey,
          lobbyCode: match.lobbyCode,
          mode: MatchMode.PVP,
          status: status === 'FORFEITED' ? MatchStatus.FORFEITED : MatchStatus.FINISHED,
          playerAId: match.playerAId,
          playerADisplay: match.playerADisplay,
          playerBId: match.playerBId,
          playerBDisplay: match.playerBDisplay,
          winnerSeat: match.winnerSeat,
          settings: match.settings as unknown as Prisma.InputJsonValue,
          startedAt: new Date(match.startedAt),
          endedAt: new Date(match.endedAt),
          moves: {
            create: moves.map((m) => ({
              turnIndex: m.turnIndex,
              byPlayer: m.byPlayer,
              x: m.x,
              y: m.y,
              result: m.result as MoveResult,
            })),
          },
        },
      });
      matchId = created.id;
    } catch (error) {
      // Bereits persistiert (doppelter „finished"-Trigger) → bestehenden Match nutzen (FR-026).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.match.findUnique({ where: { matchKey: match.matchKey } });
        if (!existing) throw error;
        matchId = existing.id;
      } else {
        throw error;
      }
    }

    // resultId = matchId → erneute Meldung zählt garantiert nicht doppelt (FR-024/026).
    for (const sw of statWrites) {
      await this.stats.recordResult(sw.userId, matchId, sw.outcome);
    }
  }
}
