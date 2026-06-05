import { Inject, Injectable } from '@nestjs/common';

import type { PlayerId } from '@schiffe/engine';

import type { Identity } from '../auth/identity';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { LobbyRepository } from '../lobby/lobby.repository';
import { LobbyService } from '../lobby/lobby.service';
import type { LobbyRecord } from '../lobby/lobby-types';
import { GraceTimerService } from '../reconnect/grace-timer.service';
import type { ErrorCode } from '../realtime/events';
import { MatchmakingRepository } from './matchmaking.repository';
import { canEnterQueue } from './queue-guard';
import { QUICK_PLAY_SETTINGS } from './quick-play-settings';

type UserIdentity = Extract<Identity, { kind: 'user' }>;

/** Puffer auf den `quickplay:conn`-TTL, damit der Auflösungs-Key nicht vor dem Timeout abläuft. */
const CONN_BUFFER_MS = 30_000;

export interface JoinArgs {
  readonly identity: UserIdentity;
  readonly socketId: string;
  /** socket.data.lobby gesetzt? (FR-015, per-Socket-Anteil) */
  readonly inLobby: boolean;
}

export type JoinOutcome =
  | { readonly kind: 'rejected'; readonly error: ErrorCode }
  | { readonly kind: 'waiting' }
  | {
      readonly kind: 'matched';
      readonly code: string;
      readonly record: LobbyRecord;
      readonly hostUserId: string;
      readonly hostSocketId: string;
      readonly joinerPlayerId: PlayerId;
    };

/**
 * Quick-Play-Matchmaking (006). Orchestriert Beitritt/Abbruch und die atomare Paarung; die eigentliche
 * Partie entsteht über die BESTEHENDE Lobby-Erzeugung (`LobbyService`) — kein paralleler Spielpfad.
 */
@Injectable()
export class MatchmakingService {
  constructor(
    private readonly repo: MatchmakingRepository,
    private readonly lobby: LobbyService,
    private readonly lobbyRepo: LobbyRepository,
    private readonly grace: GraceTimerService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private now(): number {
    return Date.now();
  }

  // Wartetimeout-Timer pro Nutzer über den bestehenden GraceTimerService (research.md §4).
  private timerCode(userId: string): string {
    return `mm:${userId}`;
  }
  scheduleWaitTimer(userId: string, onExpire: () => void): void {
    this.grace.schedule(this.timerCode(userId), 'A', this.now() + this.config.matchmakingTimeoutMs, onExpire);
  }
  clearWaitTimer(userId: string): void {
    this.grace.clear(this.timerCode(userId), 'A');
  }

  /** Entfernt einen Wartenden vollständig (Queue + Timer). Idempotent (FR-008/013/016). */
  async removeFromQueue(userId: string): Promise<void> {
    await this.repo.removeFromQueue(userId);
    this.clearWaitTimer(userId);
  }

  /** Bricht die Suche ab (FR-008). */
  async leave(userId: string): Promise<void> {
    await this.removeFromQueue(userId);
  }

  isWaiting(userId: string): Promise<boolean> {
    return this.repo.isWaiting(userId);
  }

  private connTtlMs(): number {
    return this.config.matchmakingTimeoutMs + CONN_BUFFER_MS;
  }

  private async enqueueSelf(identity: UserIdentity, socketId: string): Promise<JoinOutcome> {
    await this.enqueueWaiting(identity, socketId);
    return { kind: 'waiting' };
  }

  /** Reiht einen Nutzer als Wartenden ein (ZSET + conn). Für das Gateway (Geistermatch-Requeue). */
  async enqueueWaiting(identity: UserIdentity, socketId: string): Promise<void> {
    await this.repo.enqueue(identity.userId, this.now());
    await this.repo.setConn(identity.userId, { socketId, displayName: identity.displayName }, this.connTtlMs());
  }

  /** Verwirft eine soeben erzeugte Lobby (Geistermatch) und räumt beide Aktiv-Indizes (FR-015). */
  async discardMatch(code: string, hostUserId: string, joinerUserId: string): Promise<void> {
    await this.lobbyRepo.removeOpenLobby(hostUserId, code);
    await this.lobbyRepo.clearUserGame(hostUserId);
    await this.lobbyRepo.clearUserGame(joinerUserId);
    await this.lobbyRepo.delete(code);
  }

  /**
   * Beitritt zur Warteschlange: Guard (FR-001/015) → atomares claim-or-enqueue (FR-012). Bei einem
   * Match entsteht die Lobby (Standard-Einstellungen, früher Wartender = Host A) über `LobbyService`.
   */
  async join(args: JoinArgs): Promise<JoinOutcome> {
    const now = this.now();
    const hasActiveGame = (await this.lobbyRepo.getUserGame(args.identity.userId)) !== null;
    const guard = canEnterQueue(args.identity, { inLobby: args.inLobby, hasActiveGame });
    if (!guard.ok) return { kind: 'rejected', error: guard.error };

    const claim = await this.repo.claimOrEnqueue(args.identity.userId, now);
    if (claim.kind === 'waiting') {
      await this.repo.setConn(
        args.identity.userId,
        { socketId: args.socketId, displayName: args.identity.displayName },
        this.connTtlMs(),
      );
      return { kind: 'waiting' };
    }

    // matched: der frühere Wartende (`opponentUserId`) wird Host A (First-come, FR-004).
    const opp = await this.repo.getConn(claim.opponentUserId);
    if (!opp) {
      // Geistermatch (Gegner nicht mehr auflösbar) → mich einreihen statt eine kaputte Partie zu bauen.
      return this.enqueueSelf(args.identity, args.socketId);
    }

    const host = { userId: claim.opponentUserId, displayName: opp.displayName };
    const created = await this.lobby.createLobby(host, QUICK_PLAY_SETTINGS, now);
    if (!created.ok) return this.enqueueSelf(args.identity, args.socketId);

    const joined = await this.lobby.joinLobby(
      created.record.code,
      { kind: 'user', userId: args.identity.userId, displayName: args.identity.displayName },
      `user:${args.identity.userId}`,
    );
    if (!joined.ok) {
      // Defensiv aufräumen und mich erneut einreihen (sollte regulär nicht eintreten).
      await this.lobbyRepo.removeOpenLobby(host.userId, created.record.code);
      await this.lobbyRepo.clearUserGame(host.userId);
      await this.lobbyRepo.delete(created.record.code);
      return this.enqueueSelf(args.identity, args.socketId);
    }

    // Match steht: Gegner-Wartetimer + conn aufräumen.
    this.clearWaitTimer(claim.opponentUserId);
    await this.repo.delConn(claim.opponentUserId);
    return {
      kind: 'matched',
      code: joined.record.code,
      record: joined.record,
      hostUserId: claim.opponentUserId,
      hostSocketId: opp.socketId,
      joinerPlayerId: 'B',
    };
  }
}
