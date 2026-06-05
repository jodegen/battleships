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
  /** Redis-Verbindung für Live-State/Pub-Sub (M3/004). */
  readonly redisUrl: string;
  /** Standard-Zug-Timer in Sekunden, wenn die Lobby keinen Wert vorgibt (FR-005/020). */
  readonly turnTimerDefaultSeconds: number;
  /** Obergrenze gleichzeitig offener Lobbys pro eingeloggtem Nutzer (FR-006b). */
  readonly maxOpenLobbiesPerUser: number;
  /** Zeitfenster (s) für die Beitritts-Drosselung gegen Code-Erraten (FR-006a). */
  readonly joinRateLimitWindowSeconds: number;
  /** Maximale fehlgeschlagene Beitritts-Versuche im Fenster, danach Drosselung (FR-006a). */
  readonly joinRateLimitMaxFails: number;
  /** Reconnect-Fenster in ms: reservierter Sitz nach Verbindungsabbruch (005, FR-006). */
  readonly reconnectWindowMs: number;
  /** Wartetimeout der Quick-Play-Suche in ms (006, FR-016). Default 120_000. */
  readonly matchmakingTimeoutMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function intFromEnv(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6380',
    turnTimerDefaultSeconds: intFromEnv(env, 'TURN_TIMER_DEFAULT_SECONDS', 30),
    maxOpenLobbiesPerUser: intFromEnv(env, 'MAX_OPEN_LOBBIES_PER_USER', 5),
    joinRateLimitWindowSeconds: intFromEnv(env, 'JOIN_RATE_LIMIT_WINDOW_SECONDS', 60),
    joinRateLimitMaxFails: intFromEnv(env, 'JOIN_RATE_LIMIT_MAX_FAILS', 10),
    reconnectWindowMs: intFromEnv(env, 'RECONNECT_WINDOW_MS', 60_000),
    matchmakingTimeoutMs: intFromEnv(env, 'MATCHMAKING_TIMEOUT_MS', 120_000),
  };
}
