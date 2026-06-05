import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OnlineBoards } from '../../src/components/online/OnlineBoards';
import { OpponentStatus } from '../../src/components/online/OpponentStatus';
import { TurnTimer } from '../../src/components/online/TurnTimer';
import type { GameViewMsg, LobbyView } from '../../src/realtime/socket-client';

const lobby: LobbyView = {
  code: '7K3-Q9X',
  status: 'in_progress',
  settings: { allowTouching: true, turnTimerSeconds: 30, extraTurnOnHit: true },
  players: [
    { seat: 0, playerId: 'A', displayName: 'Alice', isGuest: false, connected: true, placed: true },
    { seat: 1, playerId: 'B', displayName: 'Bob', isGuest: true, connected: true, placed: true },
  ],
  turn: 'A',
};

const view: GameViewMsg = {
  code: '7K3-Q9X',
  you: 'A',
  own: { ships: [{ length: 2, origin: { x: 0, y: 0 }, orientation: 'horizontal' }], shotsReceived: [] },
  opponentShots: [{ coord: { x: 5, y: 5 }, outcome: 'hit' }],
  turn: 'A',
  turnDeadline: null,
};

describe('Online-UI (US4/US5)', () => {
  it('OpponentStatus zeigt beide Spieler, Gast-Flag und „am Zug"', () => {
    render(<OpponentStatus lobby={lobby} you="A" />);
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
    expect(screen.getByText(/am Zug/)).toBeInTheDocument();
  });

  it('TurnTimer rendert nichts ohne Deadline und einen Countdown mit Deadline', () => {
    const { container, rerender } = render(<TurnTimer deadline={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<TurnTimer deadline={Date.now() + 12_000} />);
    expect(screen.getByLabelText('Zug-Timer')).toBeInTheDocument();
  });

  it('OnlineBoards macht ungeschossene Angriffsfelder klickbar (Fog of War: nur Server-Daten)', () => {
    render(<OnlineBoards view={view} canFire onFire={() => undefined} />);
    // 100 Angriffsfelder minus 1 bereits beschossenes = 99 klickbare „Schuss"-Felder.
    expect(screen.getAllByRole('button', { name: /^Schuss / })).toHaveLength(99);
  });
});
