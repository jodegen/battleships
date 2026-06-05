// Reine Zustandsübergänge für Reconnect/Pause/Aufgabe (005, data-model.md §2). Keine I/O,
// kein Zufall, keine Wall-Clock — `now`/`windowMs` werden injiziert. Alle Funktionen liefern
// neue Records. Der kanonische Spielzustand bleibt der eingebettete engine-`GameState`.

import type { PlayerId } from '@schiffe/engine';

import type { LobbyRecord } from '../lobby/lobby-types';

export function opponentOf(p: PlayerId): PlayerId {
  return p === 'A' ? 'B' : 'A';
}

/**
 * Verbindungsabbruch während `in_progress` (FR-004/005/011): Sitz wird getrennt markiert, ein
 * 60-s-Fenster gesetzt und der Zug-Timer pausiert (Restzeit festgehalten, `turnDeadline=null`).
 * Ist die Partie bereits pausiert (anderer Sitz zuerst getrennt), bleibt die zuvor festgehaltene
 * Restzeit erhalten — sie wird nicht überschrieben.
 */
export function markDisconnected(
  record: LobbyRecord,
  playerId: PlayerId,
  now: number,
  windowMs: number,
): LobbyRecord {
  const pausedTurnRemainingMs = record.paused
    ? record.pausedTurnRemainingMs
    : record.turnDeadline === null
      ? null
      : Math.max(0, record.turnDeadline - now);
  return {
    ...record,
    seats: record.seats.map((s) =>
      s.playerId === playerId ? { ...s, connected: false, reconnectDeadline: now + windowMs } : s,
    ),
    turnDeadline: null,
    pausedTurnRemainingMs,
    paused: true,
  };
}

/**
 * Erfolgreicher Reconnect (FR-010/012): Sitz wieder verbunden, Fenster gelöscht. Sind danach
 * ALLE Sitze verbunden, wird die Pause aufgehoben und der Zug-Timer mit der Restzeit fortgesetzt
 * (`turnDeadline = now + Restzeit`); bei Timer-„aus" bleibt die Deadline `null`. Ist noch ein
 * Sitz getrennt, bleibt die Partie pausiert.
 */
export function markReconnected(record: LobbyRecord, playerId: PlayerId, now: number): LobbyRecord {
  const seats = record.seats.map((s) =>
    s.playerId === playerId ? { ...s, connected: true, reconnectDeadline: null } : s,
  );
  const allConnected = seats.every((s) => s.connected);
  if (!allConnected) {
    return { ...record, seats };
  }
  const turnDeadline =
    record.pausedTurnRemainingMs === null ? null : now + record.pausedTurnRemainingMs;
  return { ...record, seats, turnDeadline, pausedTurnRemainingMs: null, paused: false };
}

export type AbandonResult = { readonly record: LobbyRecord; readonly winner: PlayerId } | null;

/**
 * Aufgabe-Wertung bei Fenster-Ablauf (FR-014/014a/016). Greift nur, wenn die Partie noch läuft
 * und der betroffene Sitz weiterhin getrennt ist — der Status-Guard macht einen zweiten Trigger
 * (beide getrennt → erstes Fenster entscheidet; Reconnect/Forfeit-Race) zum No-Op.
 */
export function resolveAbandon(record: LobbyRecord, playerId: PlayerId): AbandonResult {
  if (record.status !== 'in_progress' || !record.game) return null;
  const seat = record.seats.find((s) => s.playerId === playerId);
  if (!seat || seat.connected) return null;
  const winner = opponentOf(playerId);
  return {
    winner,
    record: {
      ...record,
      status: 'finished',
      game: { ...record.game, status: 'finished', winner },
    },
  };
}
