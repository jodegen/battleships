// Dünner, typisierter socket.io-Client für die Online-Partie (Contract: server
// contracts/websocket-events.md). Verbindet same-origin; im Dev proxyt Next.js `/socket.io`
// an den Server (siehe next.config.mjs), damit HTTP-only-Cookies Same-Origin funktionieren.

import { io, type Socket } from 'socket.io-client';

export type PlayerId = 'A' | 'B';
export type ShotOutcome = 'miss' | 'hit' | 'sunk';
export type Orientation = 'horizontal' | 'vertical';
export interface Coord {
  x: number;
  y: number;
}
export interface ShipPlacement {
  length: number;
  origin: Coord;
  orientation: Orientation;
}
export type TurnTimerSeconds = 15 | 30 | 60 | null;

export interface LobbySettings {
  allowTouching: boolean;
  turnTimerSeconds: TurnTimerSeconds;
  extraTurnOnHit: boolean;
}

export interface LobbyPlayerView {
  seat: 0 | 1;
  playerId: PlayerId;
  displayName: string;
  isGuest: boolean;
  connected: boolean;
  placed: boolean;
}
export interface LobbyView {
  code: string;
  status: 'waiting' | 'placing' | 'in_progress' | 'finished';
  settings: LobbySettings;
  players: LobbyPlayerView[];
  turn: PlayerId | null;
}
export interface OpponentShotView {
  coord: Coord;
  outcome: ShotOutcome;
  sunkShip?: { length: number };
}
export interface GameViewMsg {
  code: string;
  you: PlayerId;
  own: { ships: ShipPlacement[]; shotsReceived: Coord[] };
  opponentShots: OpponentShotView[];
  turn: PlayerId;
  turnDeadline: number | null;
}
export interface ShotResultMsg {
  code: string;
  by: PlayerId;
  target: Coord;
  outcome: ShotOutcome;
  sunkShip?: { length: number };
}
export interface TurnChangedMsg {
  code: string;
  turn: PlayerId;
  turnDeadline: number | null;
  reason: string;
}
export interface GameOverMsg {
  code: string;
  winner: PlayerId;
  reason: 'all-sunk' | 'forfeit';
}
/** Gegner getrennt — Reconnect-Fenster läuft (005, FR-007). */
export interface OpponentDisconnectedMsg {
  code: string;
  playerId: PlayerId;
  graceDeadline: number;
}
/** Gegner innerhalb des Fensters zurück (005, FR-010). */
export interface OpponentReconnectedMsg {
  code: string;
  playerId: PlayerId;
}

/** Quick-Play-Paarung gefunden (006, FR-003/006/007). Push an beide Spieler. */
export interface QueueMatchedMsg {
  code: string;
  you: PlayerId;
  lobby: LobbyView;
  reconnectToken: string;
}
/** Quick-Play-Wartetimeout ohne Gegner (006, FR-016). */
export interface QueueTimeoutMsg {
  reason: 'no-match';
}

export type Ack<T> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Stellt eine Verbindung her (same-origin, Cookies). `url` optional für Tests/abweichende Hosts.
 * socket.io reconnectet den Transport automatisch (Default); der Wiedereintritt in die laufende
 * Partie (`reconnect:resume`) wird in `useOnlineGame` beim `connect`-Event ausgelöst (005).
 */
export function createSocket(url?: string): Socket {
  const target = url ?? process.env.NEXT_PUBLIC_WS_URL ?? '';
  return io(target, {
    path: '/socket.io',
    withCredentials: true,
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
  });
}
