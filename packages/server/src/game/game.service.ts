import { Injectable } from '@nestjs/common';
import {
  applyShot,
  type Coord,
  createGame,
  type PlayerId,
  type ShipPlacement,
  type ShotResult,
  validatePlacement,
} from '@schiffe/engine';

import type { ErrorCode } from '../realtime/events';
import type { LobbyRecord } from '../lobby/lobby-types';
import { settingsToGameConfig } from './game-config';
import { isProcessed, withProcessed } from './move-dedup';

function opponentOf(p: PlayerId): PlayerId {
  return p === 'A' ? 'B' : 'A';
}

function nextDeadline(record: LobbyRecord, now: number, finished: boolean): number | null {
  if (finished || record.settings.turnTimerSeconds === null) return null;
  return now + record.settings.turnTimerSeconds * 1000;
}

export type ShotApplication =
  | { readonly kind: 'applied'; readonly record: LobbyRecord; readonly result: ShotResult; readonly finished: boolean; readonly winner: PlayerId | null }
  | { readonly kind: 'duplicate'; readonly result: ShotResult }
  | { readonly kind: 'rejected'; readonly error: ErrorCode };

/**
 * Brücke zur Engine als EINZIGER Spiellogik (Prinzip I/III). Der Service trifft selbst keine
 * Board-Regelentscheidung — er ruft `validatePlacement`/`createGame`/`applyShot` auf und hält
 * den resultierenden Zustand. Zeit (`now`) wird injiziert (Determinismus).
 */
@Injectable()
export class GameService {
  /** Validiert eine Flotte gegen die Lobby-Einstellungen (FR-015). */
  validateFleet(record: LobbyRecord, placements: ReadonlyArray<ShipPlacement>): { ok: true } | { ok: false } {
    return validatePlacement(settingsToGameConfig(record.settings), placements);
  }

  /** Startet die Partie aus beiden eingereichten Flotten (FR-009). Startspieler A. */
  start(record: LobbyRecord, now: number): LobbyRecord {
    const a = record.placement.A;
    const b = record.placement.B;
    if (!a || !b) throw new Error('start: beide Flotten erforderlich');
    const game = createGame(settingsToGameConfig(record.settings), { A: a, B: b });
    return {
      ...record,
      status: 'in_progress',
      game,
      startedAt: now,
      turnDeadline: nextDeadline(record, now, false),
    };
  }

  /** Wendet einen Schuss server-autoritativ an; idempotent über `moveId` (FR-014/016/017). */
  applyShot(record: LobbyRecord, by: PlayerId, moveId: string, target: Coord, now: number): ShotApplication {
    if (record.status !== 'in_progress' || !record.game) {
      return { kind: 'rejected', error: 'not-in-progress' };
    }
    if (isProcessed(record.processedMoveIds, moveId)) {
      return { kind: 'duplicate', result: record.resultsByMove[moveId] };
    }

    const outcome = applyShot(record.game, by, target);
    if ('rejected' in outcome) {
      const map: Record<string, ErrorCode> = {
        'not-your-turn': 'not-your-turn',
        'already-shot': 'already-shot',
        'out-of-bounds': 'out-of-bounds',
        'game-over': 'not-in-progress',
      };
      return { kind: 'rejected', error: map[outcome.reason] };
    }

    const { state, result } = outcome;
    const finished = state.status === 'finished';
    const next: LobbyRecord = {
      ...record,
      game: state,
      status: finished ? 'finished' : 'in_progress',
      moves: [...record.moves, { by, coord: target, outcome: result.outcome }],
      processedMoveIds: withProcessed(record.processedMoveIds, moveId),
      resultsByMove: { ...record.resultsByMove, [moveId]: result },
      turnDeadline: nextDeadline(record, now, finished),
    };
    return { kind: 'applied', record: next, result, finished, winner: state.winner };
  }

  /**
   * Zug-Verfall bei Timer-Ablauf (FR-021): Zugwechsel OHNE Schuss. Reine Zeit-/Transportregel —
   * die Engine ist zeitunabhängig, daher wird der Turn hier (nicht im Board) weitergereicht.
   */
  passTurnOnTimeout(record: LobbyRecord, now: number): LobbyRecord | null {
    if (record.status !== 'in_progress' || !record.game) return null;
    const game = { ...record.game, turn: opponentOf(record.game.turn) };
    return { ...record, game, turnDeadline: nextDeadline(record, now, false) };
  }
}
