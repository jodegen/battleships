import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { isAllowedDisplayName } from '../auth/display-name';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import type { ErrorCode, LobbySettings } from '../realtime/events';
import { createReconnectToken } from '../reconnect/reconnect-token';
import { generateLobbyCode, isValidLobbyCode, normalizeLobbyCode } from './lobby-code';
import { createLobbyRecord, joinAsSecond } from './lobby-state';
import { LobbyRepository } from './lobby.repository';
import type { LobbyRecord, SeatIdentity } from './lobby-types';

const WAITING_TTL_MS = 10 * 60 * 1000; // FR-011: 10 min Auto-Close
const ACTIVE_TTL_MS = 2 * 60 * 60 * 1000; // placing/in_progress sliding ~2 h
const CODE_COLLISION_RETRIES = 10;

export type CreateResult =
  | { readonly ok: true; readonly record: LobbyRecord }
  | { readonly ok: false; readonly error: ErrorCode };
export type JoinResultS =
  | { readonly ok: true; readonly record: LobbyRecord }
  | { readonly ok: false; readonly error: ErrorCode };

@Injectable()
export class LobbyService {
  constructor(
    private readonly repo: LobbyRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** TTL je Lobby-Status (data-model.md §2.2). */
  ttlFor(status: LobbyRecord['status']): number {
    return status === 'waiting' ? WAITING_TTL_MS : ACTIVE_TTL_MS;
  }

  /** Nur eingeloggte Spieler erstellen Lobbys (FR-001); Obergrenze offener Lobbys (FR-006b). */
  async createLobby(
    host: { userId: string; displayName: string },
    settings: LobbySettings,
    now: number,
  ): Promise<CreateResult> {
    const open = await this.repo.countOpenLobbies(host.userId);
    if (open >= this.config.maxOpenLobbiesPerUser) return { ok: false, error: 'too-many-lobbies' };

    for (let i = 0; i < CODE_COLLISION_RETRIES; i++) {
      const code = generateLobbyCode(Math.random);
      const record = createLobbyRecord({
        code,
        host: { kind: 'user', userId: host.userId, displayName: host.displayName },
        settings,
        matchKey: randomUUID(),
        reconnectToken: createReconnectToken(),
        now,
      });
      const created = await this.repo.createIfAbsent(record, WAITING_TTL_MS);
      if (created) {
        await this.repo.addOpenLobby(host.userId, code);
        // 006/FR-015: konto-weiter Aktiv-Index für den Host.
        await this.repo.setUserGame(host.userId, code, ACTIVE_TTL_MS);
        return { ok: true, record };
      }
    }
    return { ok: false, error: 'internal-error' };
  }

  /**
   * Beitritt per Code für user ODER guest (FR-003), mit Beitritts-Drosselung (FR-006a) und
   * Gast-Namensvalidierung (FR-006). `idKey` identifiziert den Versuchenden (Drossel-Schlüssel).
   */
  async joinLobby(rawCode: string, identity: SeatIdentity, idKey: string): Promise<JoinResultS> {
    if (!isValidLobbyCode(rawCode)) return { ok: false, error: 'invalid-code' };
    if (identity.kind === 'guest' && !isAllowedDisplayName(identity.displayName)) {
      return { ok: false, error: 'invalid-name' };
    }

    const fails = await this.repo.joinFailureCount(idKey);
    if (fails >= this.config.joinRateLimitMaxFails) return { ok: false, error: 'rate-limited' };

    const code = normalizeLobbyCode(rawCode);
    const record = await this.repo.get(code);
    if (!record) {
      await this.repo.registerJoinFailure(idKey, this.config.joinRateLimitWindowSeconds);
      return { ok: false, error: 'lobby-not-found' };
    }

    const joined = joinAsSecond(record, identity, createReconnectToken());
    if (!joined.ok) {
      const error: ErrorCode = joined.error === 'lobby-full' ? 'lobby-full' : 'lobby-not-found';
      return { ok: false, error };
    }

    await this.repo.save(joined.record, ACTIVE_TTL_MS);
    // 006/FR-015: konto-weiter Aktiv-Index für den eingeloggten Beitretenden (Seat B).
    if (identity.kind === 'user') await this.repo.setUserGame(identity.userId, code, ACTIVE_TTL_MS);
    return { ok: true, record: joined.record };
  }
}
