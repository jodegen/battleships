import { describe, expect, it } from 'vitest';

import { loadAppConfig } from '../../src/config/app-config';

// Minimale Pflicht-Umgebung (Secrets sind required).
const BASE = { COOKIE_SECRET: 's', GUEST_TOKEN_SECRET: 'g' } satisfies NodeJS.ProcessEnv;

describe('app-config — M3-Felder (Redis, Timer, Anti-Abuse)', () => {
  it('nutzt Defaults, wenn die M3-Variablen fehlen', () => {
    const c = loadAppConfig({ ...BASE });
    expect(c.redisUrl).toBe('redis://localhost:6380');
    expect(c.turnTimerDefaultSeconds).toBe(30);
    expect(c.maxOpenLobbiesPerUser).toBe(5);
    expect(c.joinRateLimitWindowSeconds).toBe(60);
    expect(c.joinRateLimitMaxFails).toBe(10);
  });

  it('liest gesetzte Werte aus der Umgebung', () => {
    const c = loadAppConfig({
      ...BASE,
      REDIS_URL: 'redis://cache:6379',
      TURN_TIMER_DEFAULT_SECONDS: '15',
      MAX_OPEN_LOBBIES_PER_USER: '2',
      JOIN_RATE_LIMIT_WINDOW_SECONDS: '30',
      JOIN_RATE_LIMIT_MAX_FAILS: '4',
    });
    expect(c.redisUrl).toBe('redis://cache:6379');
    expect(c.turnTimerDefaultSeconds).toBe(15);
    expect(c.maxOpenLobbiesPerUser).toBe(2);
    expect(c.joinRateLimitWindowSeconds).toBe(30);
    expect(c.joinRateLimitMaxFails).toBe(4);
  });

  it('fällt bei nicht-numerischen Werten auf den Default zurück', () => {
    const c = loadAppConfig({ ...BASE, TURN_TIMER_DEFAULT_SECONDS: 'abc' });
    expect(c.turnTimerDefaultSeconds).toBe(30);
  });
});
