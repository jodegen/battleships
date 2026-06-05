// Reconnect-Token clientseitig so halten, dass es einen Reload übersteht (005, FR-003).
// localStorage überdauert Reload und kurze Aussetzer; geht der Browser-Storage verloren
// (z. B. Inkognito geschlossen), kann ein Gast nicht zurückkehren — das ist gewolltes Verhalten.

import type { PlayerId } from './socket-client';

export interface ReconnectInfo {
  code: string;
  token: string;
  playerId: PlayerId;
}

const KEY = 'schiffe.reconnect';

export function saveReconnect(info: ReconnectInfo): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(info));
  } catch {
    /* Storage nicht verfügbar (z. B. verweigert) — Reconnect bleibt für diese Sitzung aus. */
  }
}

export function loadReconnect(): ReconnectInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ReconnectInfo) : null;
  } catch {
    return null;
  }
}

export function clearReconnect(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
