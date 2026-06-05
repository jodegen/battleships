// Reine Handshake-Identitäts-Auflösung für den WebSocket-Layer (research.md §3).
// Framework-/Socket-unabhängig: Cookies parsen + Reihenfolge user→guest→anonym über
// injizierte Resolver. Die tatsächlichen DB-/HMAC-Aufrufe liegen in den injizierten
// Funktionen (in der Middleware mit SessionService/GuestTokenService verdrahtet).

import { GUEST_COOKIE, SESSION_COOKIE } from '../auth/cookies';
import { ANONYMOUS, type Identity } from '../auth/identity';

/** Parst einen rohen `Cookie:`-Header in ein Schlüssel/Wert-Objekt. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    const value = part.slice(eq + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export interface IdentityResolvers {
  /** Validiert ein Session-Token gegen die DB (rollierend). */
  readonly resolveSession: (token: string) => Promise<{ userId: string; displayName: string } | null>;
  /** Verifiziert ein signiertes Gast-Token (kein DB-Zugriff). */
  readonly verifyGuest: (token: string) => { displayName: string } | null;
}

/**
 * Bestimmt die Identität einer Socket-Verbindung aus dem Cookie-Header.
 * Eingeloggt hat Vorrang; sonst gültiges Gast-Token; sonst anonym (FR-001/002).
 */
export async function resolveSocketIdentity(
  cookieHeader: string | undefined,
  deps: IdentityResolvers,
): Promise<Identity> {
  const cookies = parseCookies(cookieHeader);

  const sessionToken = cookies[SESSION_COOKIE];
  if (sessionToken) {
    const session = await deps.resolveSession(sessionToken);
    if (session) {
      return { kind: 'user', userId: session.userId, displayName: session.displayName };
    }
  }

  const guestToken = cookies[GUEST_COOKIE];
  if (guestToken) {
    const guest = deps.verifyGuest(guestToken);
    if (guest) return { kind: 'guest', displayName: guest.displayName };
  }

  return ANONYMOUS;
}
