// Reconnect-Token & -Autorisierung (005, FR-001/002/003a). Reine Funktionen — kein I/O,
// keine Framework-/Socket-Abhängigkeit. Das Token ist ein opaker Zufallswert pro Sitz; die
// Wahrheit ist der serverseitig gehaltene Seat (Redis). Eingeloggte Spieler dürfen zusätzlich
// per Konto-Identität zurückkehren (konto-weit, jedes Gerät); Gäste nur per Token.

import { randomBytes, timingSafeEqual } from 'node:crypto';

import type { Identity } from '../auth/identity';
import type { Seat } from '../lobby/lobby-types';

/** Erzeugt ein neues geheimes Reconnect-Token (32 Byte, base64url). */
export function createReconnectToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Konstanter Vergleich des übergebenen Tokens mit dem Seat-Token. */
export function verifyReconnectToken(seat: Seat, providedToken: string): boolean {
  if (typeof providedToken !== 'string' || providedToken.length === 0) return false;
  const a = Buffer.from(seat.reconnectToken);
  const b = Buffer.from(providedToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Darf der Verbindende diesen Sitz wieder übernehmen? Erfolgreich, wenn das Token passt ODER
 * (FR-003a) die Identität ein eingeloggter Nutzer ist, dessen `userId` dem Sitz entspricht.
 * Gäste/anonym kommen ausschließlich über den Token-Pfad zurück.
 */
export function authorizeResume(seat: Seat, providedToken: string, identity: Identity): boolean {
  if (verifyReconnectToken(seat, providedToken)) return true;
  if (identity.kind === 'user' && seat.identity.kind === 'user') {
    return identity.userId === seat.identity.userId;
  }
  return false;
}
