// Typisierter, validierter Zugriff auf die Umgebungskonfiguration.
// Reine Funktion (testbar) — liest aus einem Env-Record, Default: process.env.

export interface AppConfig {
  readonly port: number;
  readonly webOrigin: string;
  readonly cookieSecret: string;
  readonly guestTokenSecret: string;
  readonly cookieSecure: boolean;
  /** Lebensdauer der eingeloggten Session in ms (rollierend ~30 Tage, FR-009). */
  readonly sessionTtlMs: number;
  /** Lebensdauer des Gast-Tokens in ms (~24 h, nicht rollierend, FR-015). */
  readonly guestTtlMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (value === undefined || value === '') {
    throw new Error(`Fehlende Umgebungsvariable: ${key}`);
  }
  return value;
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number.parseInt(env.PORT ?? '3001', 10),
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:3000',
    cookieSecret: required(env, 'COOKIE_SECRET'),
    guestTokenSecret: required(env, 'GUEST_TOKEN_SECRET'),
    cookieSecure: (env.COOKIE_SECURE ?? 'false') === 'true',
    sessionTtlMs: 30 * DAY_MS,
    guestTtlMs: DAY_MS,
  };
}
