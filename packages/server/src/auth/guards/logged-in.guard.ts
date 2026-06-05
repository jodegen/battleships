import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { ANONYMOUS, type Identity, loggedInGate } from '../identity';

/**
 * FR-003 Capability-Gate: schützt eingeloggt-only-Routen.
 * Liest die vom IdentityGuard gesetzte `request.identity` (Default: anonym).
 * eingeloggt → durchlassen, Gast → 403, anonym → 401.
 *
 * Erweiterungsnaht (M3): die spätere Lobby-Erstellung nutzt denselben Guard.
 */
@Injectable()
export class LoggedInGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { identity?: Identity }>();
    const identity = request.identity ?? ANONYMOUS;
    const decision = loggedInGate(identity);
    if (decision.allow) return true;
    if (decision.status === 403) {
      throw new ForbiddenException('Diese Aktion ist nur für eingeloggte Spieler verfügbar.');
    }
    throw new UnauthorizedException('Bitte zuerst anmelden.');
  }
}
