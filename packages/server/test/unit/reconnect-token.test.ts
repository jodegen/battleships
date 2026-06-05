import { describe, expect, it } from 'vitest';

import type { Identity } from '../../src/auth/identity';
import type { Seat } from '../../src/lobby/lobby-types';
import {
  authorizeResume,
  createReconnectToken,
  verifyReconnectToken,
} from '../../src/reconnect/reconnect-token';

function userSeat(token: string, userId = 'u1'): Seat {
  return {
    playerId: 'A',
    identity: { kind: 'user', userId, displayName: 'Alice' },
    connected: false,
    placed: true,
    reconnectToken: token,
    reconnectDeadline: 1000,
  };
}

function guestSeat(token: string): Seat {
  return {
    playerId: 'B',
    identity: { kind: 'guest', displayName: 'Bob' },
    connected: false,
    placed: true,
    reconnectToken: token,
    reconnectDeadline: 1000,
  };
}

describe('Reconnect-Token (005, FR-001/002/003a)', () => {
  it('createReconnectToken erzeugt nicht-leere, eindeutige Tokens', () => {
    const a = createReconnectToken();
    const b = createReconnectToken();
    expect(a.length).toBeGreaterThan(20);
    expect(a).not.toBe(b);
  });

  it('verifyReconnectToken akzeptiert das passende und lehnt falsche/leere ab', () => {
    const seat = userSeat('secret-token');
    expect(verifyReconnectToken(seat, 'secret-token')).toBe(true);
    expect(verifyReconnectToken(seat, 'wrong')).toBe(false);
    expect(verifyReconnectToken(seat, '')).toBe(false);
  });

  it('authorizeResume: Token-Pfad erlaubt Rückkehr (FR-002)', () => {
    const seat = guestSeat('tok-b');
    const guest: Identity = { kind: 'guest', displayName: 'Bob' };
    expect(authorizeResume(seat, 'tok-b', guest)).toBe(true);
    expect(authorizeResume(seat, 'nope', guest)).toBe(false);
  });

  it('authorizeResume: eingeloggter Nutzer kehrt per Konto-Identität zurück, auch ohne Token (FR-003a)', () => {
    const seat = userSeat('tok-a', 'user-42');
    const sameUser: Identity = { kind: 'user', userId: 'user-42', displayName: 'Alice' };
    const otherUser: Identity = { kind: 'user', userId: 'user-99', displayName: 'Eve' };
    expect(authorizeResume(seat, 'no-token', sameUser)).toBe(true);
    expect(authorizeResume(seat, 'no-token', otherUser)).toBe(false);
  });

  it('authorizeResume: Gast ohne passendes Token wird abgelehnt (kein Identitäts-Bypass)', () => {
    const seat = guestSeat('tok-b');
    const anon: Identity = { kind: 'anonymous' };
    const guest: Identity = { kind: 'guest', displayName: 'Bob' };
    expect(authorizeResume(seat, 'wrong', anon)).toBe(false);
    expect(authorizeResume(seat, 'wrong', guest)).toBe(false);
  });
});
