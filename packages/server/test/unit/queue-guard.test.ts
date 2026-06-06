import { describe, expect, it } from 'vitest';

import type { Identity } from '../../src/auth/identity';
import { canEnterQueue } from '../../src/matchmaking/queue-guard';

const user: Identity = { kind: 'user', userId: 'u1', displayName: 'Alice' };
const guest: Identity = { kind: 'guest', displayName: 'Bob' };
const anon: Identity = { kind: 'anonymous' };
const free = { inLobby: false, hasActiveGame: false };

describe('canEnterQueue (006, FR-001/015)', () => {
  it('lässt eingeloggte, freie Spieler zu', () => {
    expect(canEnterQueue(user, free)).toEqual({ ok: true });
  });

  it('lehnt Gäste ab (FR-001) → forbidden', () => {
    expect(canEnterQueue(guest, free)).toEqual({ ok: false, error: 'forbidden' });
  });

  it('lehnt anonyme Verbindungen ab → unauthenticated', () => {
    expect(canEnterQueue(anon, free)).toEqual({ ok: false, error: 'unauthenticated' });
  });

  it('lehnt eingeloggte Spieler ab, die bereits in einer Lobby sind (FR-015)', () => {
    expect(canEnterQueue(user, { inLobby: true, hasActiveGame: false })).toEqual({
      ok: false,
      error: 'already-in-game',
    });
  });

  it('lehnt eingeloggte Spieler ab, die konto-weit in einer aktiven Partie sind (FR-015)', () => {
    expect(canEnterQueue(user, { inLobby: false, hasActiveGame: true })).toEqual({
      ok: false,
      error: 'already-in-game',
    });
  });
});
