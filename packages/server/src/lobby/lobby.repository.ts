import { Injectable } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';
import type { LobbyRecord } from './lobby-types';

import type { PlayerId } from '@schiffe/engine';

const lobbyKey = (code: string): string => `lobby:${code}`;
const openKey = (userId: string): string => `open-lobbies:${userId}`;
const joinFailKey = (idKey: string): string => `join-fails:${idKey}`;
const matchResultKey = (code: string): string => `match-result:${code}`;
const userGameKey = (userId: string): string => `game-of-user:${userId}`;

/** Flüchtiger Terminal-Marker (005, FR-017): verspäteter Reconnect erfährt das Endergebnis. */
export interface TerminalResult {
  readonly winner: PlayerId;
  readonly reason: 'forfeit' | 'all-sunk';
  readonly endedAt: number;
}

const MATCH_RESULT_TTL_MS = 120_000;

export type UpdateResult =
  | { readonly status: 'ok'; readonly record: LobbyRecord }
  | { readonly status: 'closed' }
  | { readonly status: 'not-found' }
  | { readonly status: 'conflict' };

/**
 * Redis-CRUD für den flüchtigen Lobby-/Spielzustand (contracts/redis-state.md).
 * Mutationen sind atomar (WATCH/MULTI/EXEC mit Retry), um Lost-Updates und das
 * Doppel-Apply-Fenster (Idempotenz) zu vermeiden.
 */
@Injectable()
export class LobbyRepository {
  constructor(private readonly redis: RedisService) {}

  /** Legt eine neue Lobby an, sofern der Code frei ist (Kollisionsschutz). */
  async createIfAbsent(record: LobbyRecord, ttlMs: number): Promise<boolean> {
    const res = await this.redis.client.set(
      lobbyKey(record.code),
      JSON.stringify(record),
      'PX',
      ttlMs,
      'NX',
    );
    return res === 'OK';
  }

  async get(code: string): Promise<LobbyRecord | null> {
    const raw = await this.redis.client.get(lobbyKey(code));
    return raw ? (JSON.parse(raw) as LobbyRecord) : null;
  }

  async save(record: LobbyRecord, ttlMs: number): Promise<void> {
    await this.redis.client.set(lobbyKey(record.code), JSON.stringify(record), 'PX', ttlMs);
  }

  async delete(code: string): Promise<void> {
    await this.redis.client.del(lobbyKey(code));
  }

  /**
   * Atomare Lesen-Ändern-Schreiben-Operation. `updater` liefert den neuen Record,
   * `null` zum Schließen (Delete). Bei gleichzeitiger Änderung wird begrenzt erneut versucht.
   */
  async update(
    code: string,
    updater: (record: LobbyRecord) => LobbyRecord | null,
    ttlMs: number,
    attempts = 5,
  ): Promise<UpdateResult> {
    const key = lobbyKey(code);
    for (let i = 0; i < attempts; i++) {
      await this.redis.client.watch(key);
      const raw = await this.redis.client.get(key);
      if (!raw) {
        await this.redis.client.unwatch();
        return { status: 'not-found' };
      }
      const next = updater(JSON.parse(raw) as LobbyRecord);
      const multi = this.redis.client.multi();
      if (next === null) {
        multi.del(key);
      } else {
        multi.set(key, JSON.stringify(next), 'PX', ttlMs);
      }
      const execed = await multi.exec();
      if (execed === null) continue; // WATCH-Konflikt → erneut versuchen
      return next === null ? { status: 'closed' } : { status: 'ok', record: next };
    }
    return { status: 'conflict' };
  }

  // ── Reconnect: Terminal-Marker für verspäteten Wiedereintritt (005, FR-017) ──

  async setMatchResult(code: string, result: TerminalResult): Promise<void> {
    await this.redis.client.set(matchResultKey(code), JSON.stringify(result), 'PX', MATCH_RESULT_TTL_MS);
  }
  async getMatchResult(code: string): Promise<TerminalResult | null> {
    const raw = await this.redis.client.get(matchResultKey(code));
    return raw ? (JSON.parse(raw) as TerminalResult) : null;
  }

  // ── Anti-Abuse: Obergrenze offener Lobbys pro Nutzer (FR-006b) ───────────────

  async countOpenLobbies(userId: string): Promise<number> {
    return this.redis.client.scard(openKey(userId));
  }
  async addOpenLobby(userId: string, code: string): Promise<void> {
    await this.redis.client.sadd(openKey(userId), code);
  }
  async removeOpenLobby(userId: string, code: string): Promise<void> {
    await this.redis.client.srem(openKey(userId), code);
  }

  // ── Anti-Abuse: Beitritts-Drosselung gegen Code-Erraten (FR-006a) ────────────

  /** Erhöht den Fehlversuchs-Zähler im Fenster und liefert den neuen Stand. */
  async registerJoinFailure(idKey: string, windowSeconds: number): Promise<number> {
    const key = joinFailKey(idKey);
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, windowSeconds);
    return count;
  }
  async joinFailureCount(idKey: string): Promise<number> {
    const raw = await this.redis.client.get(joinFailKey(idKey));
    return raw ? Number.parseInt(raw, 10) : 0;
  }

  // ── 006: Konto-weiter Aktiv-Index (FR-015) — ein eingeloggter Nutzer kann nicht ──
  // gleichzeitig in einer Partie/offenen Lobby UND in der Quick-Play-Warteschlange sein.

  /** Merkt sich, in welcher Lobby/Partie ein eingeloggter Nutzer sitzt (Host oder Beitretender). */
  async setUserGame(userId: string, code: string, ttlMs: number): Promise<void> {
    await this.redis.client.set(userGameKey(userId), code, 'PX', ttlMs);
  }
  async getUserGame(userId: string): Promise<string | null> {
    return this.redis.client.get(userGameKey(userId));
  }
  async clearUserGame(userId: string): Promise<void> {
    await this.redis.client.del(userGameKey(userId));
  }
}
