// Dünner, typisierter API-Client. Cookies werden mitgesendet (credentials: 'include');
// im Dev proxyt Next.js `/api/*` an den Server (Same-Origin, siehe next.config.mjs).

export interface StatsView {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface ProfileView {
  displayName: string;
  stats: StatsView;
}

export type Identity =
  | { kind: 'user'; displayName: string }
  | { kind: 'guest'; displayName: string }
  | { kind: 'anonymous' };

export type Outcome = 'win' | 'loss';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const message = await res
      .json()
      .then((body: { message?: string | string[] }) =>
        Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? res.statusText),
      )
      .catch(() => res.statusText);
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
}

export const api = {
  me: () => request<Identity>('/me'),
  register: (input: { email: string; password: string; displayName: string }) =>
    post<ProfileView>('/auth/register', input),
  login: (input: { email: string; password: string }) => post<ProfileView>('/auth/login', input),
  logout: () => post<void>('/auth/logout'),
  guest: (displayName: string) => post<Identity>('/auth/guest', { displayName }),
  profile: () => request<ProfileView>('/me/profile'),
  stats: () => request<StatsView>('/me/stats'),
  reportMatchResult: (resultId: string, outcome: Outcome) =>
    post<StatsView>('/me/match-results', { resultId, outcome }),
};

export type Api = typeof api;
