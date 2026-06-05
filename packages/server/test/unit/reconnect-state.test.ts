import type { GameState, PlayerId } from '@schiffe/engine';
import { describe, expect, it } from 'vitest';

import type { LobbyRecord, Seat } from '../../src/lobby/lobby-types';
import { markDisconnected, markReconnected, resolveAbandon } from '../../src/reconnect/reconnect-state';

const fakeGame = (turn: PlayerId = 'A'): GameState =>
  ({ status: 'in_progress', winner: null, turn }) as unknown as GameState;

function seat(playerId: PlayerId, connected: boolean): Seat {
  return {
    playerId,
    identity: { kind: 'user', userId: `u-${playerId}`, displayName: playerId },
    connected,
    placed: true,
    reconnectToken: `rt-${playerId}`,
    reconnectDeadline: null,
  };
}

function record(overrides: Partial<LobbyRecord> = {}): LobbyRecord {
  return {
    code: 'C',
    status: 'in_progress',
    hostUserId: 'u-A',
    settings: { allowTouching: true, turnTimerSeconds: 30, extraTurnOnHit: true },
    seats: [seat('A', true), seat('B', true)],
    turnDeadline: 10_000,
    processedMoveIds: [],
    resultsByMove: {},
    game: fakeGame('A'),
    moves: [],
    placement: {},
    matchKey: 'mk',
    createdAt: 0,
    startedAt: 0,
    pausedTurnRemainingMs: null,
    paused: false,
    ...overrides,
  };
}

describe('Reconnect-Zustand (005)', () => {
  describe('markDisconnected (FR-004/005/011)', () => {
    it('setzt Fenster-Deadline, hält Restzeit fest und pausiert den Zug-Timer', () => {
      const r = markDisconnected(record({ turnDeadline: 10_000 }), 'B', 6_000, 60_000);
      const b = r.seats.find((s) => s.playerId === 'B')!;
      expect(b.connected).toBe(false);
      expect(b.reconnectDeadline).toBe(66_000);
      expect(r.turnDeadline).toBeNull();
      expect(r.pausedTurnRemainingMs).toBe(4_000); // 10000 - 6000
      expect(r.paused).toBe(true);
    });

    it('Timer „aus" (turnDeadline=null) → keine Restzeit, aber pausiert', () => {
      const r = markDisconnected(record({ turnDeadline: null }), 'A', 5_000, 60_000);
      expect(r.pausedTurnRemainingMs).toBeNull();
      expect(r.paused).toBe(true);
    });

    it('zweiter Disconnect überschreibt die zuvor festgehaltene Restzeit NICHT', () => {
      const first = markDisconnected(record({ turnDeadline: 10_000 }), 'A', 6_000, 60_000);
      const second = markDisconnected(first, 'B', 9_000, 60_000);
      expect(second.pausedTurnRemainingMs).toBe(4_000); // bleibt vom ersten Disconnect
      expect(second.seats.every((s) => !s.connected)).toBe(true);
    });
  });

  describe('markReconnected (FR-010/012)', () => {
    it('setzt Zug-Timer mit Restzeit fort, wenn beide verbunden sind', () => {
      const paused = markDisconnected(record({ turnDeadline: 10_000 }), 'B', 6_000, 60_000);
      const resumed = markReconnected(paused, 'B', 20_000);
      const b = resumed.seats.find((s) => s.playerId === 'B')!;
      expect(b.connected).toBe(true);
      expect(b.reconnectDeadline).toBeNull();
      expect(resumed.paused).toBe(false);
      expect(resumed.turnDeadline).toBe(24_000); // 20000 + 4000 Restzeit
      expect(resumed.pausedTurnRemainingMs).toBeNull();
    });

    it('bleibt pausiert, solange der andere Sitz getrennt ist', () => {
      const bothOut = markDisconnected(markDisconnected(record(), 'A', 6_000, 60_000), 'B', 6_000, 60_000);
      const onlyA = markReconnected(bothOut, 'A', 20_000);
      expect(onlyA.paused).toBe(true);
      expect(onlyA.turnDeadline).toBeNull();
    });

    it('Timer „aus": Resume hält turnDeadline auf null', () => {
      const paused = markDisconnected(record({ turnDeadline: null, settings: { allowTouching: true, turnTimerSeconds: null, extraTurnOnHit: true } }), 'B', 6_000, 60_000);
      const resumed = markReconnected(paused, 'B', 20_000);
      expect(resumed.paused).toBe(false);
      expect(resumed.turnDeadline).toBeNull();
    });
  });

  describe('resolveAbandon (FR-014/014a/016)', () => {
    it('wertet den getrennten Spieler als aufgegeben, Gegner gewinnt', () => {
      const paused = markDisconnected(record(), 'B', 6_000, 60_000);
      const res = resolveAbandon(paused, 'B');
      expect(res).not.toBeNull();
      expect(res!.winner).toBe('A');
      expect(res!.record.status).toBe('finished');
      expect(res!.record.game!.winner).toBe('A');
    });

    it('No-Op, wenn der Sitz wieder verbunden ist (Race/Idempotenz)', () => {
      const paused = markDisconnected(record(), 'B', 6_000, 60_000);
      const resumed = markReconnected(paused, 'B', 7_000);
      expect(resolveAbandon(resumed, 'B')).toBeNull();
    });

    it('No-Op, wenn die Partie bereits beendet ist', () => {
      expect(resolveAbandon(record({ status: 'finished' }), 'B')).toBeNull();
    });

    it('beide getrennt → das zuerst ausgelöste Fenster entscheidet (der andere gewinnt)', () => {
      const bothOut = markDisconnected(markDisconnected(record(), 'A', 6_000, 60_000), 'B', 7_000, 60_000);
      // A's Fenster läuft zuerst ab → A gilt als aufgegeben, B gewinnt.
      const res = resolveAbandon(bothOut, 'A');
      expect(res!.winner).toBe('B');
    });
  });
});
