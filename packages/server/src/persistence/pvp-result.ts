// Reine Ableitung des Persistenz-Payloads bei Partieende (data-model.md §4, persistence.md).
// GameState + Seats → Match-Felder, MatchMove-Ledger und per-Spieler Stat-Schreibvorgänge.
// Ohne DB/Prisma — testbar. Stats nur für eingeloggte Seats (FR-024/025).

import type { PlayerId } from '@schiffe/engine';

import type { LobbySettings } from '../realtime/events';
import type { LobbyRecord } from '../lobby/lobby-types';

export type MatchPersistStatus = 'FINISHED' | 'FORFEITED';
export type MoveResult = 'MISS' | 'HIT' | 'SUNK';

export interface MatchWriteMove {
  readonly turnIndex: number;
  readonly byPlayer: PlayerId;
  readonly x: number;
  readonly y: number;
  readonly result: MoveResult;
}

export interface MatchWrite {
  readonly matchKey: string;
  readonly lobbyCode: string;
  readonly status: MatchPersistStatus;
  readonly playerAId: string | null;
  readonly playerADisplay: string;
  readonly playerBId: string | null;
  readonly playerBDisplay: string;
  readonly winnerSeat: PlayerId;
  readonly settings: LobbySettings;
  readonly startedAt: number;
  readonly endedAt: number;
}

export interface StatWrite {
  readonly userId: string;
  readonly outcome: 'win' | 'loss';
}

export interface MatchWritePayload {
  readonly match: MatchWrite;
  readonly moves: ReadonlyArray<MatchWriteMove>;
  readonly statWrites: ReadonlyArray<StatWrite>;
}

const RESULT: Record<string, MoveResult> = { miss: 'MISS', hit: 'HIT', sunk: 'SUNK' };

export function buildMatchWrite(
  record: LobbyRecord,
  opts: { winner: PlayerId; status: MatchPersistStatus; endedAt: number },
): MatchWritePayload {
  const seatA = record.seats.find((s) => s.playerId === 'A');
  const seatB = record.seats.find((s) => s.playerId === 'B');
  if (!seatA || !seatB) throw new Error('buildMatchWrite: beide Seats erforderlich');

  const userIdOf = (identity: typeof seatA.identity): string | null =>
    identity.kind === 'user' ? identity.userId : null;

  const match: MatchWrite = {
    matchKey: record.matchKey,
    lobbyCode: record.code,
    status: opts.status,
    playerAId: userIdOf(seatA.identity),
    playerADisplay: seatA.identity.displayName,
    playerBId: userIdOf(seatB.identity),
    playerBDisplay: seatB.identity.displayName,
    winnerSeat: opts.winner,
    settings: record.settings,
    startedAt: record.startedAt ?? opts.endedAt,
    endedAt: opts.endedAt,
  };

  const moves: MatchWriteMove[] = record.moves.map((m, i) => ({
    turnIndex: i,
    byPlayer: m.by,
    x: m.coord.x,
    y: m.coord.y,
    result: RESULT[m.outcome],
  }));

  const statWrites: StatWrite[] = [];
  for (const seat of [seatA, seatB]) {
    if (seat.identity.kind === 'user') {
      statWrites.push({
        userId: seat.identity.userId,
        outcome: seat.playerId === opts.winner ? 'win' : 'loss',
      });
    }
  }

  return { match, moves, statWrites };
}
