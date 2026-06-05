import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import OnlinePage from '../../app/online/page';
import { api } from '@/api/client';
import type { GameViewMsg, LobbyView } from '@/realtime/socket-client';

class FakeSocket {
  private handlers = new Map<string, (p: unknown) => void>();
  private acks = new Map<string, (p: unknown) => unknown>();
  emitted: Array<{ event: string; payload: unknown }> = [];
  on(event: string, cb: (p: unknown) => void): this {
    this.handlers.set(event, cb);
    return this;
  }
  emit(event: string, payload?: unknown): boolean {
    this.emitted.push({ event, payload });
    return true;
  }
  async emitWithAck(event: string, payload: unknown): Promise<unknown> {
    const responder = this.acks.get(event);
    return responder ? responder(payload) : { ok: false, error: 'no-responder' };
  }
  disconnect(): void {
    /* noop */
  }
  setAck(event: string, responder: (p: unknown) => unknown): void {
    this.acks.set(event, responder);
  }
  serverEmit(event: string, payload: unknown): void {
    this.handlers.get(event)?.(payload);
  }
}

const h = vi.hoisted(() => ({ fake: null as unknown as FakeSocket }));

vi.mock('@/realtime/socket-client', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, createSocket: () => h.fake };
});

vi.mock('@/api/client', () => {
  class ApiError extends Error {}
  return {
    ApiError,
    api: { me: vi.fn(), profile: vi.fn(), stats: vi.fn(), register: vi.fn(), login: vi.fn(), guest: vi.fn(), logout: vi.fn() },
  };
});

const SETTINGS = { allowTouching: true, turnTimerSeconds: 30, extraTurnOnHit: true } as const;

function lobby(status: LobbyView['status'], turn: LobbyView['turn'] = null): LobbyView {
  return {
    code: '7K3-Q9X',
    status,
    settings: SETTINGS,
    players: [
      { seat: 0, playerId: 'A', displayName: 'Alice', isGuest: false, connected: true, placed: status !== 'placing' },
      { seat: 1, playerId: 'B', displayName: 'Bob', isGuest: true, connected: status !== 'in_progress', placed: status !== 'placing' },
    ],
    turn,
  };
}

beforeEach(() => {
  h.fake = new FakeSocket();
  localStorage.clear();
  (api.profile as Mock).mockResolvedValue({ displayName: 'Alice', stats: { gamesPlayed: 0, wins: 0, losses: 0, winRate: 0 } });
});

describe('Reconnect-UI: Gegner-Countdown (005, US2)', () => {
  it('zeigt „Gegner getrennt – wartet (xx s)" und entfernt den Hinweis bei Rückkehr', async () => {
    (api.me as Mock).mockResolvedValue({ kind: 'user', displayName: 'Alice' });
    h.fake.setAck('lobby:create', () => ({ ok: true, code: '7K3-Q9X', lobby: lobby('waiting'), reconnectToken: 'tok' }));

    render(<OnlinePage />);
    await act(async () => h.fake.serverEmit('connect', undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Lobby erstellen' }));

    const view: GameViewMsg = {
      code: '7K3-Q9X',
      you: 'A',
      own: { ships: [], shotsReceived: [] },
      opponentShots: [],
      turn: 'A',
      turnDeadline: null,
    };
    await act(async () => {
      h.fake.serverEmit('lobby:state', lobby('in_progress', 'A'));
      h.fake.serverEmit('game:view', view);
    });

    // Gegner (B) getrennt → Countdown sichtbar.
    await act(async () => {
      h.fake.serverEmit('opponent:disconnected', { code: '7K3-Q9X', playerId: 'B', graceDeadline: Date.now() + 60_000 });
    });
    expect(await screen.findByText(/Gegner getrennt – wartet/)).toBeInTheDocument();

    // Gegner zurück → Hinweis verschwindet.
    await act(async () => {
      h.fake.serverEmit('opponent:reconnected', { code: '7K3-Q9X', playerId: 'B' });
    });
    await waitFor(() => expect(screen.queryByText(/Gegner getrennt – wartet/)).not.toBeInTheDocument());
  });
});
