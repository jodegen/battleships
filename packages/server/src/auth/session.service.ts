import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';

export interface ResolvedSession {
  readonly userId: string;
  readonly displayName: string;
}

/**
 * Eingeloggte Session als opake DB-Session (contracts/identity-session.md).
 * Roh-Token lebt nur im Cookie; gespeichert wird sein SHA-256-Hash als Zeilen-ID.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private nextExpiry(): Date {
    return new Date(Date.now() + this.config.sessionTtlMs);
  }

  /** Erzeugt eine neue Session und gibt das Roh-Token (für das Cookie) zurück. */
  async issue(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: { id: this.hashToken(token), userId, expiresAt: this.nextExpiry() },
    });
    return token;
  }

  /**
   * Validiert ein Token; bei Erfolg wird die Ablaufzeit rollierend verlängert (FR-009).
   * Abgelaufene Sessions werden gelöscht und als ungültig behandelt.
   */
  async validateAndRotate(token: string): Promise<ResolvedSession | null> {
    const id = this.hashToken(token);
    const session = await this.prisma.session.findUnique({ where: { id }, include: { user: true } });
    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.session.delete({ where: { id } }).catch(() => undefined);
      return null;
    }
    await this.prisma.session.update({
      where: { id },
      data: { expiresAt: this.nextExpiry(), lastUsedAt: new Date() },
    });
    return { userId: session.userId, displayName: session.user.displayName };
  }

  /** Beendet eine Session sofort (Logout, FR-010). */
  async revoke(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: this.hashToken(token) } });
  }
}
