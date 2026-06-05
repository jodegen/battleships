import { Inject } from '@nestjs/common';
import {
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { PlayerId } from '@schiffe/engine';
import type { Server, Socket } from 'socket.io';

import { GuestTokenService } from '../auth/guest-token.service';
import type { Identity } from '../auth/identity';
import { SessionService } from '../auth/session.service';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { GameService } from '../game/game.service';
import { TurnTimerService } from '../game/turn-timer.service';
import { projectGameView } from '../game/fog-of-war';
import { CreateLobbyDto } from '../lobby/dto/create-lobby.dto';
import { FireShotDto } from '../lobby/dto/fire-shot.dto';
import { JoinLobbyDto } from '../lobby/dto/join-lobby.dto';
import { PlaceFleetDto } from '../lobby/dto/place-fleet.dto';
import { removeBeforeStart, setPlaced, toLobbyView } from '../lobby/lobby-state';
import { LobbyRepository } from '../lobby/lobby.repository';
import { LobbyService } from '../lobby/lobby.service';
import type { LobbyRecord, SeatIdentity } from '../lobby/lobby-types';
import { MatchService } from '../persistence/match.service';
import {
  ClientEvents,
  type CreateLobbyAck,
  type FireShotAck,
  type JoinLobbyAck,
  type PlaceFleetAck,
  ServerEvents,
} from './events';
import { createWsAuthMiddleware, type SocketData } from './ws-auth.middleware';
import { validatePayload } from './validate-payload';

function opponentOf(p: PlayerId): PlayerId {
  return p === 'A' ? 'B' : 'A';
}

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class GameGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() private server!: Server;

  constructor(
    private readonly lobby: LobbyService,
    private readonly repo: LobbyRepository,
    private readonly game: GameService,
    private readonly timer: TurnTimerService,
    private readonly matches: MatchService,
    private readonly sessions: SessionService,
    private readonly guests: GuestTokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  afterInit(server: Server): void {
    server.use(createWsAuthMiddleware(this.sessions, this.guests));
  }

  private now(): number {
    return Date.now();
  }
  private identityOf(socket: Socket): Identity {
    return (socket.data as SocketData).identity;
  }

  // ── US1: Lobby erstellen (FR-001) ────────────────────────────────────────────
  @SubscribeMessage(ClientEvents.createLobby)
  async onCreate(socket: Socket, raw: unknown): Promise<CreateLobbyAck> {
    const identity = this.identityOf(socket);
    if (identity.kind !== 'user') return { ok: false, error: identity.kind === 'guest' ? 'forbidden' : 'unauthenticated' };
    const parsed = validatePayload(CreateLobbyDto, raw);
    if (!parsed.ok) return { ok: false, error: 'invalid-placement' };

    const settings = {
      allowTouching: parsed.value.settings.allowTouching,
      turnTimerSeconds: parsed.value.settings.turnTimerSeconds ?? null,
      extraTurnOnHit: parsed.value.settings.extraTurnOnHit,
    };
    const res = await this.lobby.createLobby({ userId: identity.userId, displayName: identity.displayName }, settings, this.now());
    if (!res.ok) return { ok: false, error: res.error };

    await socket.join(res.record.code);
    (socket.data as SocketData).lobby = { code: res.record.code, playerId: 'A' };
    return { ok: true, code: res.record.code, lobby: toLobbyView(res.record) };
  }

  // ── US1: Lobby beitreten (FR-003) ────────────────────────────────────────────
  @SubscribeMessage(ClientEvents.joinLobby)
  async onJoin(socket: Socket, raw: unknown): Promise<JoinLobbyAck> {
    const parsed = validatePayload(JoinLobbyDto, raw);
    if (!parsed.ok) return { ok: false, error: 'invalid-code' };
    const identity = this.identityOf(socket);

    const seat = this.resolveJoinIdentity(identity, parsed.value.guestName);
    if (!seat) return { ok: false, error: identity.kind === 'anonymous' ? 'invalid-name' : 'unauthenticated' };

    const idKey = identity.kind === 'user' ? `user:${identity.userId}` : `conn:${socket.id}`;
    const res = await this.lobby.joinLobby(parsed.value.code, seat, idKey);
    if (!res.ok) return { ok: false, error: res.error };

    await socket.join(res.record.code);
    (socket.data as SocketData).lobby = { code: res.record.code, playerId: 'B' };
    this.broadcastLobbyState(res.record);
    return { ok: true, lobby: toLobbyView(res.record) };
  }

  private resolveJoinIdentity(identity: Identity, guestName?: string): SeatIdentity | null {
    if (identity.kind === 'user') return { kind: 'user', userId: identity.userId, displayName: identity.displayName };
    if (identity.kind === 'guest') return { kind: 'guest', displayName: identity.displayName };
    if (guestName) return { kind: 'guest', displayName: guestName.trim() };
    return null;
  }

  // ── US2: Schiffe platzieren (FR-009/015) ─────────────────────────────────────
  @SubscribeMessage(ClientEvents.placeFleet)
  async onPlace(socket: Socket, raw: unknown): Promise<PlaceFleetAck> {
    const parsed = validatePayload(PlaceFleetDto, raw);
    if (!parsed.ok) return { ok: false, error: 'invalid-placement' };
    const seat = (socket.data as SocketData).lobby;
    if (!seat || seat.code !== parsed.value.code) return { ok: false, error: 'lobby-not-found' };

    const current = await this.repo.get(parsed.value.code);
    if (!current || current.status !== 'placing') return { ok: false, error: 'not-in-progress' };

    const placements = parsed.value.placements.map((p) => ({ length: p.length, origin: { x: p.origin.x, y: p.origin.y }, orientation: p.orientation }));
    if (!this.game.validateFleet(current, placements).ok) return { ok: false, error: 'invalid-placement' };

    let started = false;
    const result = await this.repo.update(
      parsed.value.code,
      (rec) => {
        if (rec.status !== 'placing') return rec;
        const placed = setPlaced(rec, seat.playerId, placements);
        if (placed.seats.length === 2 && placed.seats.every((s) => s.placed)) {
          started = true;
          return this.game.start(placed, this.now());
        }
        return placed;
      },
      this.lobby.ttlFor('placing'),
    );
    if (result.status !== 'ok') return { ok: false, error: 'lobby-not-found' };

    this.broadcastLobbyState(result.record);
    if (started) {
      await this.emitGameViews(result.record);
      this.server.to(result.record.code).emit(ServerEvents.turnChanged, {
        code: result.record.code,
        turn: result.record.game?.turn ?? 'A',
        turnDeadline: result.record.turnDeadline,
        reason: 'start',
      });
      this.armTimer(result.record);
    }
    return { ok: true };
  }

  // ── US3: Schießen (FR-014/016/017) ───────────────────────────────────────────
  @SubscribeMessage(ClientEvents.fireShot)
  async onFire(socket: Socket, raw: unknown): Promise<FireShotAck> {
    const parsed = validatePayload(FireShotDto, raw);
    if (!parsed.ok) return { ok: false, error: 'out-of-bounds' };
    const seat = (socket.data as SocketData).lobby;
    if (!seat || seat.code !== parsed.value.code) return { ok: false, error: 'lobby-not-found' };

    const target = { x: parsed.value.target.x, y: parsed.value.target.y };
    let captured: ReturnType<GameService['applyShot']> | null = null;
    const result = await this.repo.update(
      parsed.value.code,
      (rec) => {
        const app = this.game.applyShot(rec, seat.playerId, parsed.value.moveId, target, this.now());
        captured = app;
        return app.kind === 'applied' ? app.record : rec;
      },
      this.lobby.ttlFor('in_progress'),
    );
    if (result.status !== 'ok' || !captured) return { ok: false, error: 'lobby-not-found' };

    const app = captured as ReturnType<GameService['applyShot']>;
    if (app.kind === 'rejected') return { ok: false, error: app.error };
    if (app.kind === 'duplicate') return { ok: true, result: app.result };

    // applied → Broadcasts (Fog-of-War-konform: nur getroffenes Feld + Ergebnis)
    this.server.to(result.record.code).emit(ServerEvents.shotResult, {
      code: result.record.code,
      by: seat.playerId,
      target,
      outcome: app.result.outcome,
      sunkShip: app.result.sunkShip,
    });

    if (app.finished && app.winner) {
      this.timer.clear(result.record.code);
      this.server.to(result.record.code).emit(ServerEvents.gameOver, { code: result.record.code, winner: app.winner, reason: 'all-sunk' });
      await this.finishAndPersist(result.record, app.winner, 'FINISHED');
    } else {
      await this.emitGameViews(result.record);
      this.server.to(result.record.code).emit(ServerEvents.turnChanged, {
        code: result.record.code,
        turn: result.record.game?.turn ?? seat.playerId,
        turnDeadline: result.record.turnDeadline,
        reason: app.result.outcome === 'miss' ? 'miss' : 'shot',
      });
      this.armTimer(result.record);
    }
    return { ok: true, result: app.result };
  }

  // ── US4: Zug-Timer (FR-021) ──────────────────────────────────────────────────
  private armTimer(record: LobbyRecord): void {
    this.timer.schedule(record.code, record.turnDeadline, () => {
      void this.onTimeout(record.code);
    });
  }

  private async onTimeout(code: string): Promise<void> {
    const result = await this.repo.update(
      code,
      (rec) => this.game.passTurnOnTimeout(rec, this.now()) ?? rec,
      this.lobby.ttlFor('in_progress'),
    );
    if (result.status !== 'ok' || !result.record.game) return;
    this.server.to(code).emit(ServerEvents.timerExpired, { code });
    await this.emitGameViews(result.record);
    this.server.to(code).emit(ServerEvents.turnChanged, {
      code,
      turn: result.record.game.turn,
      turnDeadline: result.record.turnDeadline,
      reason: 'timeout',
    });
    this.armTimer(result.record);
  }

  // ── US1/US3: Verlassen & Disconnect (FR-010a/011a) ───────────────────────────
  @SubscribeMessage(ClientEvents.leaveLobby)
  async onLeave(socket: Socket): Promise<{ ok: true }> {
    await this.handleDeparture(socket).catch(() => undefined);
    return { ok: true };
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    // Best-effort-Aufräumen: Fehler beim Shutdown (z. B. geschlossene Redis-Verbindung)
    // dürfen keine unbehandelte Rejection auslösen.
    await this.handleDeparture(socket).catch(() => undefined);
  }

  private async handleDeparture(socket: Socket): Promise<void> {
    const seat = (socket.data as SocketData).lobby;
    if (!seat) return;
    (socket.data as SocketData).lobby = undefined;
    const { code, playerId } = seat;

    let forfeitWinner: PlayerId | null = null;
    const result = await this.repo.update(
      code,
      (rec) => {
        if (rec.status === 'in_progress' && rec.game) {
          forfeitWinner = opponentOf(playerId);
          return { ...rec, status: 'finished', game: { ...rec.game, status: 'finished', winner: forfeitWinner } };
        }
        return removeBeforeStart(rec, playerId); // null = Host weg → schließen
      },
      this.lobby.ttlFor('waiting'),
    );

    if (forfeitWinner) {
      this.timer.clear(code);
      this.server.to(code).emit(ServerEvents.gameOver, { code, winner: forfeitWinner, reason: 'forfeit' });
      if (result.status === 'ok') await this.finishAndPersist(result.record, forfeitWinner, 'FORFEITED');
      return;
    }
    if (result.status === 'closed') {
      this.timer.clear(code);
      this.server.to(code).emit(ServerEvents.error, { error: 'lobby-not-found', message: 'Lobby geschlossen' });
      return;
    }
    if (result.status === 'ok') this.broadcastLobbyState(result.record);
  }

  // ── US6: Persistenz bei Partieende (FR-024–026) ──────────────────────────────
  private async finishAndPersist(record: LobbyRecord, winner: PlayerId, status: 'FINISHED' | 'FORFEITED'): Promise<void> {
    try {
      await this.matches.persistFinished(record, winner, status, this.now());
    } finally {
      const host = record.seats.find((s) => s.playerId === 'A');
      if (host?.identity.kind === 'user') await this.repo.removeOpenLobby(host.identity.userId, record.code);
      await this.repo.delete(record.code);
    }
  }

  // ── Broadcast-Helfer ─────────────────────────────────────────────────────────
  private broadcastLobbyState(record: LobbyRecord): void {
    this.server.to(record.code).emit(ServerEvents.lobbyState, toLobbyView(record));
  }

  /** Pro Spieler die EIGENE Fog-of-War-Projektion (FR-013) — niemals roher GameState. */
  private async emitGameViews(record: LobbyRecord): Promise<void> {
    if (!record.game) return;
    const sockets = await this.server.in(record.code).fetchSockets();
    for (const s of sockets) {
      const seat = (s.data as SocketData).lobby;
      if (!seat) continue;
      s.emit(ServerEvents.gameView, projectGameView(record.code, record.game, seat.playerId, record.turnDeadline));
    }
  }
}
