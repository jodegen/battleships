import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GraceTimerService } from '../../src/reconnect/grace-timer.service';

describe('GraceTimerService (005, per-Seat)', () => {
  let nowMs = 0;
  let svc: GraceTimerService;

  beforeEach(() => {
    vi.useFakeTimers();
    nowMs = 0;
    svc = new GraceTimerService(() => nowMs);
  });
  afterEach(() => {
    svc.onModuleDestroy();
    vi.useRealTimers();
  });

  it('löst den Callback bei Erreichen der Deadline genau einmal aus', () => {
    const fired = vi.fn();
    svc.schedule('C', 'A', 1_000, fired);
    vi.advanceTimersByTime(999);
    expect(fired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it('clear verhindert das Auslösen', () => {
    const fired = vi.fn();
    svc.schedule('C', 'A', 1_000, fired);
    svc.clear('C', 'A');
    vi.advanceTimersByTime(2_000);
    expect(fired).not.toHaveBeenCalled();
  });

  it('verwaltet zwei Sitze unabhängig (beide getrennt)', () => {
    const a = vi.fn();
    const b = vi.fn();
    svc.schedule('C', 'A', 1_000, a);
    svc.schedule('C', 'B', 2_000, b);
    vi.advanceTimersByTime(1_000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('clearAll stoppt beide Sitz-Watcher', () => {
    const a = vi.fn();
    const b = vi.fn();
    svc.schedule('C', 'A', 1_000, a);
    svc.schedule('C', 'B', 1_000, b);
    svc.clearAll('C');
    vi.advanceTimersByTime(5_000);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });
});
