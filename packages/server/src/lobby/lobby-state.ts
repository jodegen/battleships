// Reine Lobby-Zustandsmaschine (data-model.md §1, FR-007–011a). Keine I/O, kein Zufall,
// keine Wall-Clock — Zeit (`now`) wird übergeben. Alle Funktionen liefern neue Records.

import type { PlayerId, ShipPlacement } from '@schiffe/engine';

import type { LobbyPlayerView, LobbySettings, LobbyView } from '../realtime/events';
import { type LobbyRecord, type Seat, type SeatIdentity, isGuestIdentity } from './lobby-types';

export function createLobbyRecord(args: {
  code: string;
  host: Extract<SeatIdentity, { kind: 'user' }>;
  settings: LobbySettings;
  matchKey: string;
  now: number;
}): LobbyRecord {
  const hostSeat: Seat = { playerId: 'A', identity: args.host, connected: true, placed: false };
  return {
    code: args.code,
    status: 'waiting',
    hostUserId: args.host.userId,
    settings: args.settings,
    seats: [hostSeat],
    turnDeadline: null,
    processedMoveIds: [],
    resultsByMove: {},
    game: null,
    moves: [],
    placement: {},
    matchKey: args.matchKey,
    createdAt: args.now,
    startedAt: null,
  };
}

export type JoinResult =
  | { readonly ok: true; readonly record: LobbyRecord }
  | { readonly ok: false; readonly error: 'lobby-full' | 'not-waiting' };

/** Zweiter Spieler tritt bei → Seat B, Übergang waiting→placing (FR-008). */
export function joinAsSecond(record: LobbyRecord, identity: SeatIdentity): JoinResult {
  // Voll geht vor Phase: ein dritter Beitritt zu einer bereits besetzten Lobby ist „full",
  // unabhängig davon, ob sie schon platziert/läuft (FR-004).
  if (record.seats.length >= 2) return { ok: false, error: 'lobby-full' };
  if (record.status !== 'waiting') return { ok: false, error: 'not-waiting' };
  const secondSeat: Seat = { playerId: 'B', identity, connected: true, placed: false };
  return {
    ok: true,
    record: { ...record, seats: [...record.seats, secondSeat], status: 'placing' },
  };
}

/**
 * Austritt/Disconnect VOR Spielstart (FR-011a). Host (Seat A) → Lobby schließen (null).
 * Zweiter Spieler (Seat B) → Sitz frei, zurück zu `waiting`.
 */
export function removeBeforeStart(record: LobbyRecord, playerId: PlayerId): LobbyRecord | null {
  if (playerId === 'A') return null; // Host weg → Lobby geschlossen
  return {
    ...record,
    status: 'waiting',
    seats: record.seats.filter((s) => s.playerId !== 'B'),
    placement: {},
  };
}

export function setConnected(record: LobbyRecord, playerId: PlayerId, connected: boolean): LobbyRecord {
  return {
    ...record,
    seats: record.seats.map((s) => (s.playerId === playerId ? { ...s, connected } : s)),
  };
}

/** Markiert eine Seite als platziert und merkt sich ihre Flotte (während `placing`). */
export function setPlaced(
  record: LobbyRecord,
  playerId: PlayerId,
  placements: ReadonlyArray<ShipPlacement>,
): LobbyRecord {
  return {
    ...record,
    seats: record.seats.map((s) => (s.playerId === playerId ? { ...s, placed: true } : s)),
    placement: { ...record.placement, [playerId]: placements },
  };
}

export function bothPlaced(record: LobbyRecord): boolean {
  return record.seats.length === 2 && record.seats.every((s) => s.placed);
}

export function seatByPlayerId(record: LobbyRecord, playerId: PlayerId): Seat | undefined {
  return record.seats.find((s) => s.playerId === playerId);
}

/** Hat die Lobby ihren 10-min-Wartetimeout ohne zweiten Beitritt überschritten (FR-011)? */
export function isExpiredWaiting(record: LobbyRecord, now: number, timeoutMs: number): boolean {
  return record.status === 'waiting' && record.seats.length < 2 && now - record.createdAt >= timeoutMs;
}

/** Lobby-/Presence-Sicht ohne Brettdaten (Broadcast `lobby:state`). */
export function toLobbyView(record: LobbyRecord): LobbyView {
  const players: LobbyPlayerView[] = record.seats.map((s, idx) => ({
    seat: idx as 0 | 1,
    playerId: s.playerId,
    displayName: s.identity.displayName,
    isGuest: isGuestIdentity(s.identity),
    connected: s.connected,
    placed: s.placed,
  }));
  return {
    code: record.code,
    status: record.status,
    settings: record.settings,
    players,
    turn: record.status === 'in_progress' && record.game ? record.game.turn : null,
  };
}
