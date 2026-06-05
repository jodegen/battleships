import { describe, expect, it } from 'vitest';

import { createLobbyRecord, joinAsSecond } from '../../src/lobby/lobby-state';
import type { LobbyRecord, MoveLogEntry } from '../../src/lobby/lobby-types';
import type { LobbySettings } from '../../src/realtime/events';
import { buildMatchWrite } from '../../src/persistence/pvp-result';

const SETTINGS: LobbySettings = { allowTouching: true, turnTimerSeconds: 30, extraTurnOnHit: true };

function record(secondGuest: boolean): LobbyRecord {
  const base = createLobbyRecord({
    code: '7K3-Q9X',
    host: { kind: 'user', userId: 'host-1', displayName: 'Alice' },
    settings: SETTINGS,
    matchKey: 'mk-42',
    reconnectToken: 'rt-a',
    now: 1000,
  });
  const joined = joinAsSecond(
    base,
    secondGuest ? { kind: 'guest', displayName: 'Gast' } : { kind: 'user', userId: 'user-2', displayName: 'Bob' },
    'rt-b',
  );
  if (!joined.ok) throw new Error('join failed');
  const moves: MoveLogEntry[] = [
    { by: 'A', coord: { x: 0, y: 0 }, outcome: 'hit' },
    { by: 'A', coord: { x: 9, y: 9 }, outcome: 'miss' },
    { by: 'B', coord: { x: 1, y: 1 }, outcome: 'sunk' },
  ];
  return { ...joined.record, status: 'finished', startedAt: 2000, moves };
}

describe('buildMatchWrite (FR-024/025/026, persistence.md)', () => {
  it('vs Gast: nur der eingeloggte Spieler bekommt einen Stat-Schreibvorgang', () => {
    const payload = buildMatchWrite(record(true), { winner: 'A', status: 'FINISHED', endedAt: 5000 });
    expect(payload.match).toMatchObject({
      matchKey: 'mk-42',
      lobbyCode: '7K3-Q9X',
      status: 'FINISHED',
      playerAId: 'host-1',
      playerADisplay: 'Alice',
      playerBId: null, // Gast hat keinen User-Eintrag
      playerBDisplay: 'Gast',
      winnerSeat: 'A',
      startedAt: 2000,
      endedAt: 5000,
    });
    expect(payload.statWrites).toEqual([{ userId: 'host-1', outcome: 'win' }]);
  });

  it('zwei eingeloggte Spieler: Sieger=win, Verlierer=loss', () => {
    const payload = buildMatchWrite(record(false), { winner: 'B', status: 'FINISHED', endedAt: 5000 });
    expect(payload.statWrites).toEqual([
      { userId: 'host-1', outcome: 'loss' },
      { userId: 'user-2', outcome: 'win' },
    ]);
  });

  it('Zug-Ledger → MatchMove-Payload mit fortlaufendem turnIndex und Ergebnis-Enum', () => {
    const payload = buildMatchWrite(record(true), { winner: 'A', status: 'FINISHED', endedAt: 5000 });
    expect(payload.moves).toEqual([
      { turnIndex: 0, byPlayer: 'A', x: 0, y: 0, result: 'HIT' },
      { turnIndex: 1, byPlayer: 'A', x: 9, y: 9, result: 'MISS' },
      { turnIndex: 2, byPlayer: 'B', x: 1, y: 1, result: 'SUNK' },
    ]);
  });

  it('Forfeit wird als Status FORFEITED persistiert', () => {
    const payload = buildMatchWrite(record(true), { winner: 'A', status: 'FORFEITED', endedAt: 5000 });
    expect(payload.match.status).toBe('FORFEITED');
  });
});
