import { Injectable, Optional, type OnModuleDestroy } from '@nestjs/common';

import type { PlayerId } from '@schiffe/engine';

/**
 * Reconnect-Grace-Timer (005, FR-006/014). Pro getrenntem Sitz ein In-Process-Watcher, der bei
 * Erreichen der Fenster-Deadline einen Callback auslöst (Aufgabe-Wertung). Die Wahrheit ist die
 * `reconnectDeadline` im Lobby-Record; der Callback prüft atomar gegen den aktuellen Zustand.
 * Zwei gleichzeitige Fenster (beide getrennt) werden unabhängig verwaltet. Zeitquelle injizierbar.
 */
@Injectable()
export class GraceTimerService implements OnModuleDestroy {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly now: () => number;

  constructor(@Optional() now?: () => number) {
    this.now = now ?? ((): number => Date.now());
  }

  private key(code: string, playerId: PlayerId): string {
    return `${code}:${playerId}`;
  }

  /** Plant den Ablauf-Callback für einen Sitz auf `deadline` (absoluter ms-Zeitstempel). */
  schedule(code: string, playerId: PlayerId, deadline: number, onExpire: () => void): void {
    const key = this.key(code, playerId);
    this.clearKey(key);
    const delay = Math.max(0, deadline - this.now());
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        onExpire();
      }, delay),
    );
  }

  clear(code: string, playerId: PlayerId): void {
    this.clearKey(this.key(code, playerId));
  }

  /** Löscht beide Sitz-Watcher einer Lobby (bei Partieende/Aufräumen). */
  clearAll(code: string): void {
    this.clearKey(this.key(code, 'A'));
    this.clearKey(this.key(code, 'B'));
  }

  private clearKey(key: string): void {
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(key);
    }
  }

  onModuleDestroy(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
