import { describe, expect, it } from 'vitest';

import type { LobbySettings } from '../../src/realtime/events';
import {
  bothPlaced,
  createLobbyRecord,
  isExpiredWaiting,
  joinAsSecond,
  removeBeforeStart,
  setPlaced,
  toLobbyView,
} from '../../src/lobby/lobby-state';

const SETTINGS: LobbySettings = { allowTouching: true, turnTimerSeconds: 30, extraTurnOnHit: true };

function baseLobby() {
  return createLobbyRecord({
    code: '7K3-Q9X',
    host: { kind: 'user', userId: 'u1', displayName: 'Alice' },
    settings: SETTINGS,
    matchKey: 'mk-1',
    reconnectToken: 'rt-a',
    now: 1000,
  });
}

describe('Lobby-Zustandsmaschine (FR-007–011a)', () => {
  it('startet in `waiting` mit Host als Seat A', () => {
    const rec = baseLobby();
    expect(rec.status).toBe('waiting');
    expect(rec.seats).toHaveLength(1);
    expect(rec.seats[0]).toMatchObject({ playerId: 'A', connected: true, placed: false });
  });

  it('zweiter Spieler → Seat B, Übergang zu `placing` (FR-008)', () => {
    const r = joinAsSecond(baseLobby(), { kind: 'guest', displayName: 'Bob' }, 'rt-b');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record.status).toBe('placing');
    expect(r.record.seats).toHaveLength(2);
    expect(r.record.seats[1]).toMatchObject({ playerId: 'B', placed: false });
  });

  it('Drittbeitritt wird abgelehnt (FR-004)', () => {
    const joined = joinAsSecond(baseLobby(), { kind: 'guest', displayName: 'Bob' }, 'rt-b');
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    const third = joinAsSecond(joined.record, { kind: 'guest', displayName: 'Eve' }, 'rt-c');
    expect(third).toEqual({ ok: false, error: 'lobby-full' });
  });

  it('Host-Austritt VOR Spielstart schließt die Lobby (FR-011a)', () => {
    const joined = joinAsSecond(baseLobby(), { kind: 'guest', displayName: 'Bob' }, 'rt-b');
    if (!joined.ok) return;
    expect(removeBeforeStart(joined.record, 'A')).toBeNull();
  });

  it('Austritt des zweiten Spielers gibt Sitz frei → zurück zu `waiting` (FR-011a)', () => {
    const joined = joinAsSecond(baseLobby(), { kind: 'guest', displayName: 'Bob' }, 'rt-b');
    if (!joined.ok) return;
    const back = removeBeforeStart(joined.record, 'B');
    expect(back).not.toBeNull();
    expect(back?.status).toBe('waiting');
    expect(back?.seats).toHaveLength(1);
    expect(back?.seats[0].playerId).toBe('A');
  });

  it('bothPlaced erst, wenn beide Seiten platziert haben (FR-009)', () => {
    const joined = joinAsSecond(baseLobby(), { kind: 'guest', displayName: 'Bob' }, 'rt-b');
    if (!joined.ok) return;
    let rec = joined.record;
    expect(bothPlaced(rec)).toBe(false);
    rec = setPlaced(rec, 'A', []);
    expect(bothPlaced(rec)).toBe(false);
    rec = setPlaced(rec, 'B', []);
    expect(bothPlaced(rec)).toBe(true);
  });

  it('isExpiredWaiting nach 10-min-Timeout ohne zweiten Beitritt (FR-011)', () => {
    const rec = baseLobby();
    const tenMin = 10 * 60 * 1000;
    expect(isExpiredWaiting(rec, 1000 + tenMin - 1, tenMin)).toBe(false);
    expect(isExpiredWaiting(rec, 1000 + tenMin, tenMin)).toBe(true);
  });

  it('toLobbyView spiegelt Status, Spieler und Gast-Flag', () => {
    const joined = joinAsSecond(baseLobby(), { kind: 'guest', displayName: 'Bob' }, 'rt-b');
    if (!joined.ok) return;
    const view = toLobbyView(joined.record);
    expect(view.status).toBe('placing');
    expect(view.players).toHaveLength(2);
    expect(view.players[0]).toMatchObject({ seat: 0, playerId: 'A', isGuest: false, displayName: 'Alice' });
    expect(view.players[1]).toMatchObject({ seat: 1, playerId: 'B', isGuest: true, displayName: 'Bob' });
    expect(view.turn).toBeNull();
  });
});
