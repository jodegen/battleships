// Reine Identitäts-Logik (framework-unabhängig, ohne Nest/HTTP) — contracts/identity-session.md.
// FR-001/002/003: zwei Identitätstypen, eindeutig bestimmbar, Capability-Gating.

export type Identity =
  | { readonly kind: 'user'; readonly userId: string; readonly displayName: string }
  | { readonly kind: 'guest'; readonly displayName: string }
  | { readonly kind: 'anonymous' };

export const ANONYMOUS: Identity = { kind: 'anonymous' };

export function isLoggedIn(id: Identity): id is Extract<Identity, { kind: 'user' }> {
  return id.kind === 'user';
}

export function isGuest(id: Identity): id is Extract<Identity, { kind: 'guest' }> {
  return id.kind === 'guest';
}

/**
 * Beispiel-Capability für die spätere Lobby-Erstellung (M3, §3.2): nur eingeloggte Spieler.
 * In diesem Feature die testbare Naht für FR-003; die Lobby selbst wird hier nicht gebaut.
 */
export function canCreateLobby(id: Identity): boolean {
  return isLoggedIn(id);
}

/** Öffentliche Sicht auf die Identität (ohne interne IDs) — Antwort von GET /me. */
export type PublicIdentity =
  | { readonly kind: 'user'; readonly displayName: string }
  | { readonly kind: 'guest'; readonly displayName: string }
  | { readonly kind: 'anonymous' };

export function toPublicIdentity(id: Identity): PublicIdentity {
  if (id.kind === 'user') return { kind: 'user', displayName: id.displayName };
  if (id.kind === 'guest') return { kind: 'guest', displayName: id.displayName };
  return { kind: 'anonymous' };
}

export type GateDecision = { readonly allow: true } | { readonly allow: false; readonly status: 401 | 403 };

/**
 * Entscheidet das „nur eingeloggt"-Gate (FR-003): eingeloggt → durchlassen,
 * Gast → 403 (Capability fehlt), anonym → 401 (keine Identität).
 */
export function loggedInGate(id: Identity): GateDecision {
  if (id.kind === 'user') return { allow: true };
  if (id.kind === 'guest') return { allow: false, status: 403 };
  return { allow: false, status: 401 };
}
