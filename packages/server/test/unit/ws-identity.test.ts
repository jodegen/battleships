import { describe, expect, it } from 'vitest';

import { canCreateLobby } from '../../src/auth/identity';
import { parseCookies, resolveSocketIdentity, type IdentityResolvers } from '../../src/realtime/ws-identity';

const noGuest: IdentityResolvers['verifyGuest'] = () => null;
const noSession: IdentityResolvers['resolveSession'] = async () => null;

describe('parseCookies', () => {
  it('parst mehrere Cookies und dekodiert Werte', () => {
    expect(parseCookies('sid=abc; guest=John%20Doe')).toEqual({ sid: 'abc', guest: 'John Doe' });
  });
  it('liefert leeres Objekt ohne Header', () => {
    expect(parseCookies(undefined)).toEqual({});
  });
});

describe('resolveSocketIdentity (FR-001/002)', () => {
  it('gültiges Session-Cookie → user (Vorrang vor Gast)', async () => {
    const id = await resolveSocketIdentity('sid=tok; guest=gtok', {
      resolveSession: async (t) => (t === 'tok' ? { userId: 'u1', displayName: 'Alice' } : null),
      verifyGuest: () => ({ displayName: 'Gast' }),
    });
    expect(id).toEqual({ kind: 'user', userId: 'u1', displayName: 'Alice' });
    expect(canCreateLobby(id)).toBe(true);
  });

  it('nur gültiges Gast-Token → guest', async () => {
    const id = await resolveSocketIdentity('guest=gtok', {
      resolveSession: noSession,
      verifyGuest: (t) => (t === 'gtok' ? { displayName: 'Bob' } : null),
    });
    expect(id).toEqual({ kind: 'guest', displayName: 'Bob' });
    expect(canCreateLobby(id)).toBe(false);
  });

  it('kein/ungültiges Cookie → anonym', async () => {
    const id = await resolveSocketIdentity('sid=bad', { resolveSession: noSession, verifyGuest: noGuest });
    expect(id).toEqual({ kind: 'anonymous' });
    expect(canCreateLobby(id)).toBe(false);
  });
});
