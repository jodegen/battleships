// Reines Zulassungsprädikat für die Quick-Play-Warteschlange (006, FR-001/015).
// Framework-/I/O-frei und vollständig unit-testbar; die Kontextflags liefert das Gateway.

import type { Identity } from '../auth/identity';
import type { ErrorCode } from '../realtime/events';

export interface QueueContext {
  /** Dieser Socket ist bereits in einer Lobby (socket.data.lobby gesetzt). */
  readonly inLobby: boolean;
  /** Der Nutzer ist konto-weit bereits in einer aktiven Partie/offenen Lobby (game-of-user). */
  readonly hasActiveGame: boolean;
}

export type GuardResult = { readonly ok: true } | { readonly ok: false; readonly error: ErrorCode };

/**
 * Nur eingeloggte Spieler dürfen suchen (FR-001); wer bereits in einer Lobby/Partie ist, wird
 * abgelehnt (FR-015). Gast → `forbidden`, anonym → `unauthenticated`.
 */
export function canEnterQueue(identity: Identity, ctx: QueueContext): GuardResult {
  if (identity.kind === 'guest') return { ok: false, error: 'forbidden' };
  if (identity.kind === 'anonymous') return { ok: false, error: 'unauthenticated' };
  if (ctx.inLobby || ctx.hasActiveGame) return { ok: false, error: 'already-in-game' };
  return { ok: true };
}
