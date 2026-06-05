// Versionierter, typisierter WebSocket-Nachrichten-Vertrag (contracts/websocket-events.md).
// Intents hinein (Client→Server), autoritative State/Events heraus (Server→Client).
// Reine Typdeklarationen — keine Logik, keine Framework-/Socket-Abhängigkeit.

import type {
  Coord,
  OpponentShotView,
  PlayerId,
  ShipPlacement,
  ShotOutcome,
  ShotResult,
} from '@schiffe/engine';

/** Lobby-Lebenszyklus (FR-007). Bewusst Unterstrich-Schreibweise — NICHT der Engine-GameStatus. */
export type LobbyStatus = 'waiting' | 'placing' | 'in_progress' | 'finished';

/** Wählbare Zug-Timer-Dauer in Sekunden; `null` = „aus" (FR-005, Default 30). */
export type TurnTimerSeconds = 15 | 30 | 60 | null;

export interface LobbySettings {
  readonly allowTouching: boolean;
  readonly turnTimerSeconds: TurnTimerSeconds;
  readonly extraTurnOnHit: boolean;
}

/** Fehlercodes für Ack-Antworten/`error`-Events (contracts/websocket-events.md). */
export type ErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'lobby-not-found'
  | 'lobby-full'
  | 'invalid-code'
  | 'rate-limited'
  | 'too-many-lobbies'
  | 'invalid-placement'
  | 'not-your-turn'
  | 'already-shot'
  | 'out-of-bounds'
  | 'not-in-progress'
  | 'invalid-name'
  | 'game-finished'
  | 'already-in-game'
  | 'internal-error';

export type Ack<T> = ({ readonly ok: true } & T) | { readonly ok: false; readonly error: ErrorCode };

// ── Server→Client Sichten ────────────────────────────────────────────────────

export interface LobbyPlayerView {
  readonly seat: 0 | 1;
  readonly playerId: PlayerId;
  readonly displayName: string;
  readonly isGuest: boolean;
  readonly connected: boolean;
  readonly placed: boolean;
}

/** Lobby-/Presence-Status ohne Brettdaten (Broadcast `lobby:state`). */
export interface LobbyView {
  readonly code: string;
  readonly status: LobbyStatus;
  readonly settings: LobbySettings;
  readonly players: ReadonlyArray<LobbyPlayerView>;
  readonly turn: PlayerId | null;
}

/** Brettdaten je Spieler — ausschließlich aus engine `viewFor` (Fog of War, FR-013). */
export interface GameViewMsg {
  readonly code: string;
  readonly you: PlayerId;
  readonly own: { readonly ships: ReadonlyArray<ShipPlacement>; readonly shotsReceived: ReadonlyArray<Coord> };
  readonly opponentShots: ReadonlyArray<OpponentShotView>;
  readonly turn: PlayerId;
  readonly turnDeadline: number | null;
}

export interface ShotResultMsg {
  readonly code: string;
  readonly by: PlayerId;
  readonly target: Coord;
  readonly outcome: ShotOutcome;
  readonly sunkShip?: { readonly length: number };
}

export type TurnChangeReason = 'shot' | 'miss' | 'timeout' | 'extra-turn' | 'start' | 'resume';

export interface TurnChangedMsg {
  readonly code: string;
  readonly turn: PlayerId;
  readonly turnDeadline: number | null;
  readonly reason: TurnChangeReason;
}

export interface GameOverMsg {
  readonly code: string;
  readonly winner: PlayerId;
  readonly reason: 'all-sunk' | 'forfeit';
}

/** Gegner getrennt — Reconnect-Fenster läuft (005, FR-007). `graceDeadline` für den Countdown. */
export interface OpponentDisconnectedMsg {
  readonly code: string;
  readonly playerId: PlayerId;
  readonly graceDeadline: number;
}

/** Gegner innerhalb des Fensters zurück (005, FR-010). */
export interface OpponentReconnectedMsg {
  readonly code: string;
  readonly playerId: PlayerId;
}

/** Quick-Play-Paarung gefunden (006, FR-003/006/007). Push an BEIDE gepaarten Spieler. */
export interface QueueMatchedMsg {
  readonly code: string;
  readonly you: PlayerId;
  readonly lobby: LobbyView;
  readonly reconnectToken: string;
}

/** Quick-Play-Wartetimeout ohne Gegner (006, FR-016). */
export interface QueueTimeoutMsg {
  readonly reason: 'no-match';
}

// ── Client→Server Intent-Payloads ────────────────────────────────────────────

export interface CreateLobbyPayload {
  readonly settings: LobbySettings;
}
export interface JoinLobbyPayload {
  readonly code: string;
  readonly guestName?: string;
}
export interface PlaceFleetPayload {
  readonly code: string;
  readonly placements: ReadonlyArray<ShipPlacement>;
}
export interface FireShotPayload {
  readonly code: string;
  readonly moveId: string;
  readonly target: Coord;
}
export interface LobbyRefPayload {
  readonly code: string;
}
export interface ReconnectResumePayload {
  readonly code: string;
  readonly token: string;
}

// ── Event-Namen (Single Source der String-Konstanten) ─────────────────────────

export const ClientEvents = {
  createLobby: 'lobby:create',
  joinLobby: 'lobby:join',
  leaveLobby: 'lobby:leave',
  placeFleet: 'fleet:place',
  fireShot: 'shot:fire',
  reconnectResume: 'reconnect:resume',
  queueJoin: 'queue:join',
  queueLeave: 'queue:leave',
} as const;

export const ServerEvents = {
  lobbyState: 'lobby:state',
  gameView: 'game:view',
  shotResult: 'shot:result',
  turnChanged: 'turn:changed',
  timerExpired: 'timer:expired',
  gameOver: 'game:over',
  opponentDisconnected: 'opponent:disconnected',
  opponentReconnected: 'opponent:reconnected',
  queueMatched: 'queue:matched',
  queueTimeout: 'queue:timeout',
  error: 'error',
} as const;

export type FireShotAck = Ack<{ result: ShotResult }>;
export type CreateLobbyAck = Ack<{ code: string; lobby: LobbyView; reconnectToken: string }>;
export type JoinLobbyAck = Ack<{ lobby: LobbyView; reconnectToken: string }>;
export type PlaceFleetAck = Ack<{ reason?: string }>;
export type ReconnectResumeAck = Ack<{ you: PlayerId }>;
export type QueueJoinAck = Ack<{ status: 'waiting' | 'matched' }>;
export type QueueLeaveAck = { readonly ok: true } | { readonly ok: false; readonly error: ErrorCode };
