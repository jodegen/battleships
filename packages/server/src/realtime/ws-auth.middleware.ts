import type { Socket } from 'socket.io';

import type { GuestTokenService } from '../auth/guest-token.service';
import type { Identity } from '../auth/identity';
import type { SessionService } from '../auth/session.service';
import { resolveSocketIdentity } from './ws-identity';

export interface SocketData {
  identity: Identity;
  lobby?: { code: string; playerId: 'A' | 'B' };
  /** `true`, solange dieser Socket in der Quick-Play-Warteschlange wartet (006, FR-013). */
  inQueue?: boolean;
}

/** Socket.IO-Handshake-Middleware: löst die Identität aus den Cookies (research.md §3). */
export function createWsAuthMiddleware(sessions: SessionService, guests: GuestTokenService) {
  return (socket: Socket, next: (err?: Error) => void): void => {
    void (async () => {
      try {
        const identity = await resolveSocketIdentity(socket.handshake.headers.cookie, {
          resolveSession: (t) => sessions.validateAndRotate(t),
          verifyGuest: (t) => guests.verify(t),
        });
        (socket.data as SocketData).identity = identity;
        next();
      } catch {
        next(new Error('ws-auth-failed'));
      }
    })();
  };
}
