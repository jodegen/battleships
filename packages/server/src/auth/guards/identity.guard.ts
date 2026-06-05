import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig } from '../../config/app-config';
import { GUEST_COOKIE, setSessionCookie, SESSION_COOKIE } from '../cookies';
import { GuestTokenService } from '../guest-token.service';
import { ANONYMOUS, type Identity } from '../identity';
import { SessionService } from '../session.service';

export type RequestWithIdentity = Request & { identity?: Identity };

/**
 * Globaler Guard: bestimmt die Identität jeder Anfrage (FR-001/002) und legt sie als
 * `request.identity` ab. Blockiert nie (LoggedInGuard erzwingt Capabilities).
 * Auflösungsreihenfolge: gültiges `sid` → user, sonst anonym. (Gast folgt in US3.)
 */
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly guestTokens: GuestTokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithIdentity>();
    request.identity = await this.resolve(request, http.getResponse<Response>());
    return true;
  }

  private async resolve(request: RequestWithIdentity, response: Response): Promise<Identity> {
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) {
      const session = await this.sessions.validateAndRotate(token);
      if (session) {
        // Cookie-Ablauf clientseitig mitrollen (SC-010).
        setSessionCookie(response, token, this.config);
        return { kind: 'user', userId: session.userId, displayName: session.displayName };
      }
    }
    // Eingeloggt hat Vorrang; sonst gültiges Gast-Token (kein DB-Eintrag).
    const guestToken = request.cookies?.[GUEST_COOKIE] as string | undefined;
    if (guestToken) {
      const guest = this.guestTokens.verify(guestToken);
      if (guest) return { kind: 'guest', displayName: guest.displayName };
    }
    return ANONYMOUS;
  }
}
