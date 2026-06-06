import { Injectable } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';

const QUEUE_KEY = 'quickplay:queue';
const connKey = (userId: string): string => `quickplay:conn:${userId}`;

/** Im `quickplay:conn`-Key gehaltene Auflösungsdaten des wartenden Sockets (research.md §5). */
export interface QueueConn {
  readonly socketId: string;
  readonly displayName: string;
}

export type ClaimResult =
  | { readonly kind: 'matched'; readonly opponentUserId: string }
  | { readonly kind: 'waiting' };

/**
 * Atomares „claim-or-enqueue" (006, FR-012). Redis führt Skripte serialisiert aus → kein
 * TOCTOU-Fenster: entweder den frühesten ANDEREN Wartenden herausnehmen, oder sich selbst
 * (idempotent, ein Platz pro Konto) einreihen. KEYS[1]=ZSET, ARGV[1]=userId, ARGV[2]=now.
 */
const CLAIM_OR_ENQUEUE_LUA = `
local earliest = redis.call('ZRANGE', KEYS[1], 0, 0)
if earliest[1] and earliest[1] ~= ARGV[1] then
  redis.call('ZREM', KEYS[1], earliest[1])
  return {'matched', earliest[1]}
else
  redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
  return {'waiting'}
end
`;

/**
 * Redis-Zugriff für die Quick-Play-Warteschlange (contracts/redis-state.md). Getrennt vom
 * Lobby-State; hält nur Warteschlangen-/Transport-Metadaten.
 */
@Injectable()
export class MatchmakingRepository {
  constructor(private readonly redis: RedisService) {}

  /** Atomar paaren oder einreihen (FR-004/011/012). */
  async claimOrEnqueue(userId: string, now: number): Promise<ClaimResult> {
    const res = (await this.redis.client.eval(
      CLAIM_OR_ENQUEUE_LUA,
      1,
      QUEUE_KEY,
      userId,
      String(now),
    )) as [string, string?];
    if (res[0] === 'matched' && res[1]) return { kind: 'matched', opponentUserId: res[1] };
    return { kind: 'waiting' };
  }

  /** Reiht erneut ein (z. B. nachdem ein „Geistermatch" verworfen wurde, research.md §5). */
  async enqueue(userId: string, now: number): Promise<void> {
    await this.redis.client.zadd(QUEUE_KEY, String(now), userId);
  }

  /** Entfernt einen Wartenden (Cancel/Disconnect/Timeout, FR-008/013/016). Idempotent. */
  async removeFromQueue(userId: string): Promise<void> {
    await this.redis.client.zrem(QUEUE_KEY, userId);
    await this.delConn(userId);
  }

  async isWaiting(userId: string): Promise<boolean> {
    const score = await this.redis.client.zscore(QUEUE_KEY, userId);
    return score !== null;
  }

  async size(): Promise<number> {
    return this.redis.client.zcard(QUEUE_KEY);
  }

  async setConn(userId: string, conn: QueueConn, ttlMs: number): Promise<void> {
    await this.redis.client.set(connKey(userId), JSON.stringify(conn), 'PX', ttlMs);
  }
  async getConn(userId: string): Promise<QueueConn | null> {
    const raw = await this.redis.client.get(connKey(userId));
    return raw ? (JSON.parse(raw) as QueueConn) : null;
  }
  async delConn(userId: string): Promise<void> {
    await this.redis.client.del(connKey(userId));
  }
}
