import { createRng, generateFleet, shipCells } from '@schiffe/engine';
import { describe, expect, it } from 'vitest';

import { settingsToGameConfig } from '../../src/game/game-config';
import { GameService } from '../../src/game/game.service';
import { createLobbyRecord, joinAsSecond, setPlaced } from '../../src/lobby/lobby-state';
import type { LobbyRecord } from '../../src/lobby/lobby-types';
import type { LobbySettings } from '../../src/realtime/events';

const svc = new GameService();

function startedGame(settings: LobbySettings): { record: LobbyRecord; bCells: { x: number; y: number }[] } {
  const cfg = settingsToGameConfig(settings);
  const fa = generateFleet(cfg, createRng(7));
  const fb = generateFleet(cfg, createRng(99));
  if (!fa.ok || !fb.ok) throw new Error('fleet');
  const rec = joinAsSecond(
    createLobbyRecord({
      code: 'C',
      host: { kind: 'user', userId: 'u1', displayName: 'A' },
      settings,
      matchKey: 'mk',
      reconnectToken: 'rt-a',
      now: 0,
    }),
    { kind: 'user', userId: 'u2', displayName: 'B' },
    'rt-b',
  );
  if (!rec.ok) throw new Error('join');
  let record = setPlaced(setPlaced(rec.record, 'A', fa.ships), 'B', fb.ships);
  record = svc.start(record, 1000);
  return { record, bCells: fb.ships.flatMap((s) => shipCells(s)) };
}

const SETTINGS_EXTRA: LobbySettings = { allowTouching: true, turnTimerSeconds: 30, extraTurnOnHit: true };
const SETTINGS_NOEXTRA: LobbySettings = { allowTouching: true, turnTimerSeconds: null, extraTurnOnHit: false };

describe('GameService (US3/US4 server-autoritativ)', () => {
  it('start setzt in_progress, Startspieler A und Deadline bei aktivem Timer', () => {
    const { record } = startedGame(SETTINGS_EXTRA);
    expect(record.status).toBe('in_progress');
    expect(record.game?.turn).toBe('A');
    expect(record.turnDeadline).toBe(1000 + 30_000);
  });

  it('Timer „aus" → keine Deadline (FR-023)', () => {
    const { record } = startedGame(SETTINGS_NOEXTRA);
    expect(record.turnDeadline).toBeNull();
  });

  it('lehnt Schuss außer der Reihe ab (FR-014)', () => {
    const { record } = startedGame(SETTINGS_EXTRA);
    const r = svc.applyShot(record, 'B', 'm1', { x: 0, y: 0 }, 2000);
    expect(r).toEqual({ kind: 'rejected', error: 'not-your-turn' });
  });

  it('lehnt bereits beschossenes Feld ab und out-of-bounds (FR-014)', () => {
    const { record, bCells } = startedGame(SETTINGS_EXTRA);
    const a1 = svc.applyShot(record, 'A', 'm1', bCells[0], 2000);
    expect(a1.kind).toBe('applied');
    if (a1.kind !== 'applied') return;
    expect(svc.applyShot(a1.record, 'A', 'm2', bCells[0], 2100)).toEqual({ kind: 'rejected', error: 'already-shot' });
    expect(svc.applyShot(a1.record, 'A', 'm3', { x: 99, y: 99 }, 2200)).toEqual({ kind: 'rejected', error: 'out-of-bounds' });
  });

  it('Extrazug-Regel: Treffer behält Zug + neue Deadline (FR-016/022)', () => {
    const { record, bCells } = startedGame(SETTINGS_EXTRA);
    const r = svc.applyShot(record, 'A', 'm1', bCells[0], 5000);
    expect(r.kind).toBe('applied');
    if (r.kind !== 'applied') return;
    expect(['hit', 'sunk']).toContain(r.result.outcome);
    expect(r.record.game?.turn).toBe('A'); // bleibt am Zug
    expect(r.record.turnDeadline).toBe(5000 + 30_000); // Deadline neu gestartet
  });

  it('idempotenter Schuss: gleiche moveId zählt einmal (FR-017/SC-008)', () => {
    const { record, bCells } = startedGame(SETTINGS_EXTRA);
    const first = svc.applyShot(record, 'A', 'dup', bCells[0], 2000);
    expect(first.kind).toBe('applied');
    if (first.kind !== 'applied') return;
    const again = svc.applyShot(first.record, 'A', 'dup', bCells[0], 2100);
    expect(again.kind).toBe('duplicate');
    if (again.kind !== 'duplicate') return;
    expect(again.result).toEqual(first.result);
    expect(first.record.moves).toHaveLength(1); // nicht doppelt protokolliert
  });

  it('Sieg: alle gegnerischen Schiffe versenkt → finished + winner', () => {
    const { record, bCells } = startedGame(SETTINGS_EXTRA);
    let rec = record;
    for (let i = 0; i < bCells.length; i++) {
      const r = svc.applyShot(rec, 'A', `m${i}`, bCells[i], 3000 + i);
      if (r.kind === 'applied') rec = r.record;
    }
    expect(rec.status).toBe('finished');
    expect(rec.game?.winner).toBe('A');
    expect(rec.turnDeadline).toBeNull();
  });

  it('passTurnOnTimeout: Zugwechsel ohne Schuss, neue Deadline (FR-021)', () => {
    const { record } = startedGame(SETTINGS_EXTRA);
    const after = svc.passTurnOnTimeout(record, 9000);
    expect(after?.game?.turn).toBe('B'); // war A
    expect(after?.turnDeadline).toBe(9000 + 30_000);
    expect(after?.moves).toHaveLength(0); // kein Schuss
  });
});
