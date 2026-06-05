// Domänentypen des Lobby-/Live-Zustands (data-model.md §2). Reine Typen.
// Der kanonische Spielzustand ist der eingebettete engine `GameState` (SSoT).

import type { Coord, GameState, PlayerId, ShipPlacement, ShotOutcome, ShotResult } from '@schiffe/engine';

import type { LobbySettings, LobbyStatus } from '../realtime/events';

/** Zug-Ledger-Eintrag (Reihenfolge der Schüsse) — Grundlage der `MatchMove`-Persistenz. */
export interface MoveLogEntry {
  readonly by: PlayerId;
  readonly coord: Coord;
  readonly outcome: ShotOutcome;
}

export type SeatIdentity =
  | { readonly kind: 'user'; readonly userId: string; readonly displayName: string }
  | { readonly kind: 'guest'; readonly displayName: string };

export interface Seat {
  readonly playerId: PlayerId; // Host → 'A', Beitretender → 'B'
  readonly identity: SeatIdentity;
  readonly connected: boolean;
  readonly placed: boolean;
  /** Geheimes Per-Seat-Reconnect-Token (005, FR-001). Verlässt den Server nur im create/join-Ack. */
  readonly reconnectToken: string;
  /** Absolute ms-Deadline des 60-s-Reconnect-Fensters; `null`, solange verbunden (005, FR-006). */
  readonly reconnectDeadline: number | null;
}

export interface LobbyRecord {
  readonly code: string;
  readonly status: LobbyStatus;
  readonly hostUserId: string;
  readonly settings: LobbySettings;
  readonly seats: ReadonlyArray<Seat>;
  readonly turnDeadline: number | null;
  readonly processedMoveIds: ReadonlyArray<string>;
  /** moveId → Ergebnis, für idempotentes Re-Emit bei doppeltem Schuss (FR-017). */
  readonly resultsByMove: Readonly<Record<string, ShotResult>>;
  readonly game: GameState | null;
  readonly moves: ReadonlyArray<MoveLogEntry>;
  readonly placement: { readonly A?: ReadonlyArray<ShipPlacement>; readonly B?: ReadonlyArray<ShipPlacement> };
  readonly matchKey: string;
  readonly createdAt: number;
  readonly startedAt: number | null;
  /** Bei Pause festgehaltene Zug-Restzeit (ms); `null` wenn kein aktiver Timer/nicht pausiert (005, FR-012). */
  readonly pausedTurnRemainingMs: number | null;
  /** `true`, solange ein Sitz während `in_progress` getrennt ist — sperrt Züge (005, FR-005). */
  readonly paused: boolean;
}

export function isGuestIdentity(id: SeatIdentity): id is Extract<SeatIdentity, { kind: 'guest' }> {
  return id.kind === 'guest';
}
