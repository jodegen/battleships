import { createHmac, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';

interface GuestPayload {
  readonly typ: 'guest';
  readonly name: string;
  readonly iat: number;
  readonly exp: number;
}

/**
 * Gast-Identität als kurzlebiges, signiertes Token OHNE DB-Eintrag (FR-014/015).
 * Format: base64url(payload) + "." + base64url(HMAC-SHA256(payload, secret)).
 */
@Injectable()
export class GuestTokenService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private signature(body: string): string {
    return createHmac('sha256', this.config.guestTokenSecret).update(body).digest('base64url');
  }

  issue(displayName: string): string {
    const now = Date.now();
    const payload: GuestPayload = {
      typ: 'guest',
      name: displayName,
      iat: now,
      exp: now + this.config.guestTtlMs,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.signature(body)}`;
  }

  verify(token: string): { displayName: string } | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    if (!this.safeEqual(sig, this.signature(body))) return null;

    let payload: GuestPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as GuestPayload;
    } catch {
      return null;
    }
    if (payload.typ !== 'guest' || typeof payload.name !== 'string') return null;
    if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null;
    return { displayName: payload.name };
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
