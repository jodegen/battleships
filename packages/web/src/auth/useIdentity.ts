'use client';

import { useCallback, useEffect, useState } from 'react';

import { api, ApiError, type Identity, type StatsView } from '@/api/client';

export interface IdentityState {
  identity: Identity;
  stats: StatsView | null;
  loading: boolean;
  error: string | null;
  register: (input: { email: string; password: string; displayName: string }) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  continueAsGuest: (displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshStats: () => Promise<void>;
}

const ANON: Identity = { kind: 'anonymous' };

export function useIdentity(): IdentityState {
  const [identity, setIdentity] = useState<Identity>(ANON);
  const [stats, setStats] = useState<StatsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async (id: Identity) => {
    if (id.kind === 'user') {
      setStats(await api.profile().then((p) => p.stats));
    } else {
      setStats(null);
    }
  }, []);

  // Session-Restore beim Start (SC-010).
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const id = await api.me();
        if (!active) return;
        setIdentity(id);
        await loadStats(id);
      } catch {
        if (active) setIdentity(ANON);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadStats]);

  const run = useCallback(
    async (action: () => Promise<Identity>) => {
      setError(null);
      try {
        const id = await action();
        setIdentity(id);
        await loadStats(id);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Unbekannter Fehler.');
        throw err;
      }
    },
    [loadStats],
  );

  const register = useCallback<IdentityState['register']>(
    (input) => run(() => api.register(input).then((p) => ({ kind: 'user', displayName: p.displayName }))),
    [run],
  );

  const login = useCallback<IdentityState['login']>(
    (input) => run(() => api.login(input).then((p) => ({ kind: 'user', displayName: p.displayName }))),
    [run],
  );

  const continueAsGuest = useCallback<IdentityState['continueAsGuest']>(
    (displayName) => run(() => api.guest(displayName)),
    [run],
  );

  const logout = useCallback(async () => {
    await api.logout();
    setIdentity(ANON);
    setStats(null);
    setError(null);
  }, []);

  const refreshStats = useCallback(async () => {
    if (identity.kind === 'user') setStats(await api.stats());
  }, [identity]);

  return { identity, stats, loading, error, register, login, continueAsGuest, logout, refreshStats };
}
