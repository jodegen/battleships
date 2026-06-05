import { Injectable, Optional, type OnModuleDestroy } from '@nestjs/common';

/**
 * Serverseitiger Zug-Timer (FR-020–022). Pro Lobby ein In-Process-Watcher, der bei Erreichen
 * der Deadline einen Callback auslöst. Die Wahrheit ist die Deadline im Lobby-Record; der
 * Callback prüft atomar (im GameService/Gateway) gegen den aktuellen Zustand. Die Zeitquelle
 * ist injizierbar (Tests), Default `Date.now`.
 */
@Injectable()
export class TurnTimerService implements OnModuleDestroy {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly now: () => number;

  constructor(@Optional() now?: () => number) {
    this.now = now ?? ((): number => Date.now());
  }

  /**
   * Plant den Ablauf-Callback für `code` auf `deadline` (absoluter ms-Zeitstempel).
   * `deadline === null` (Timer „aus", FR-023) löscht einen evtl. laufenden Watcher.
   */
  schedule(code: string, deadline: number | null, onExpire: () => void): void {
    this.clear(code);
    if (deadline === null) return;
    const delay = Math.max(0, deadline - this.now());
    this.timers.set(
      code,
      setTimeout(() => {
        this.timers.delete(code);
        onExpire();
      }, delay),
    );
  }

  clear(code: string): void {
    const existing = this.timers.get(code);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(code);
    }
  }

  onModuleDestroy(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
