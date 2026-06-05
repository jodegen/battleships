import { describe, expect, it } from 'vitest';

import { isProcessed, withProcessed } from '../../src/game/move-dedup';

describe('move-dedup (FR-017, SC-008)', () => {
  it('erkennt bereits verarbeitete moveId', () => {
    expect(isProcessed(['a', 'b'], 'b')).toBe(true);
    expect(isProcessed(['a', 'b'], 'c')).toBe(false);
  });

  it('withProcessed fügt neue IDs hinzu, dupliziert aber nie', () => {
    expect(withProcessed(['a'], 'b')).toEqual(['a', 'b']);
    expect(withProcessed(['a', 'b'], 'b')).toEqual(['a', 'b']);
  });
});
