import { describe, expect, it } from 'vitest';

import {
  ANONYMOUS,
  canCreateLobby,
  isGuest,
  isLoggedIn,
  loggedInGate,
  type Identity,
} from '../../src/auth/identity';

const user: Identity = { kind: 'user', userId: 'u1', displayName: 'Alice' };
const guest: Identity = { kind: 'guest', displayName: 'Gast123' };

describe('identity helpers', () => {
  it('erkennt eingeloggte Identität', () => {
    expect(isLoggedIn(user)).toBe(true);
    expect(isLoggedIn(guest)).toBe(false);
    expect(isLoggedIn(ANONYMOUS)).toBe(false);
  });

  it('erkennt Gast-Identität', () => {
    expect(isGuest(guest)).toBe(true);
    expect(isGuest(user)).toBe(false);
    expect(isGuest(ANONYMOUS)).toBe(false);
  });

  it('Capability „Lobby erstellen" nur für eingeloggte Spieler (FR-003)', () => {
    expect(canCreateLobby(user)).toBe(true);
    expect(canCreateLobby(guest)).toBe(false);
    expect(canCreateLobby(ANONYMOUS)).toBe(false);
  });

  describe('loggedInGate (FR-003 Gating)', () => {
    it('lässt eingeloggte durch', () => {
      expect(loggedInGate(user)).toEqual({ allow: true });
    });
    it('sperrt Gäste mit 403', () => {
      expect(loggedInGate(guest)).toEqual({ allow: false, status: 403 });
    });
    it('sperrt anonym mit 401', () => {
      expect(loggedInGate(ANONYMOUS)).toEqual({ allow: false, status: 401 });
    });
  });
});
