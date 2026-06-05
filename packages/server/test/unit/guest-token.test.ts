import { describe, expect, it } from 'vitest';

import type { AppConfig } from '../../src/config/app-config';
import { GuestTokenService } from '../../src/auth/guest-token.service';

const DAY = 24 * 60 * 60 * 1000;

function service(overrides: Partial<AppConfig> = {}): GuestTokenService {
  const config = {
    port: 3001,
    webOrigin: 'http://localhost:3000',
    cookieSecret: 'c',
    guestTokenSecret: 'guest-secret',
    cookieSecure: false,
    sessionTtlMs: 30 * DAY,
    guestTtlMs: DAY,
    redisUrl: 'redis://localhost:6380',
    turnTimerDefaultSeconds: 30,
    maxOpenLobbiesPerUser: 5,
    joinRateLimitWindowSeconds: 60,
    joinRateLimitMaxFails: 10,
    reconnectWindowMs: 60_000,
    matchmakingTimeoutMs: 120_000,
    ...overrides,
  } satisfies AppConfig;
  return new GuestTokenService(config);
}

describe('guest token (stateless, signiert; FR-014/015)', () => {
  it('issue → verify liefert den Anzeigenamen zurück', () => {
    const svc = service();
    const token = svc.issue('Gast42');
    expect(svc.verify(token)).toEqual({ displayName: 'Gast42' });
  });

  it('manipuliertes Token ist ungültig', () => {
    const svc = service();
    const token = svc.issue('Gast42');
    expect(svc.verify(token + 'x')).toBeNull();
  });

  it('Token eines anderen Secrets ist ungültig', () => {
    const a = service({ guestTokenSecret: 'secret-a' });
    const b = service({ guestTokenSecret: 'secret-b' });
    expect(b.verify(a.issue('Gast42'))).toBeNull();
  });

  it('abgelaufenes Token ist ungültig', () => {
    const svc = service({ guestTtlMs: -1000 });
    expect(svc.verify(svc.issue('Gast42'))).toBeNull();
  });

  it('Unsinn ist ungültig (kein Wurf)', () => {
    const svc = service();
    expect(svc.verify('garbage')).toBeNull();
    expect(svc.verify('')).toBeNull();
  });
});
