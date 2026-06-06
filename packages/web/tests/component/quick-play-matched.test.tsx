import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import OnlinePage from '../../app/online/page';
import { api } from '@/api/client';
import type { LobbyView, QueueMatchedMsg } from '@/realtime/socket-client';

// Kontrollierbarer Fake-Socket (kein echter Server in jsdom) — gleiches Muster wie online-flow.test.
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
    api: {
      me: vi.fn(),
      profile: vi.fn(),
      stats: vi.fn(),
      register: vi.fn(),
      login: vi.fn(),
      guest: vi.fn(),
      logout: vi.fn(),
    },
  };
});

const SETTINGS = { allowTouching: true, turnTimerSeconds: 30, extraTurnOnHit: true } as const;
function lobby(status: LobbyView['status']): LobbyView {
  return {
    code: '7K3-Q9X',
    status,
    settings: SETTINGS,
    players: [
      {
        seat: 0,
        playerId: 'A',
        displayName: 'Alice',
        isGuest: false,
        connected: true,
        placed: false,
      },
      {
        seat: 1,
        playerId: 'B',
        displayName: 'Bob',
        isGuest: false,
        connected: true,
        placed: false,
      },
    ],
    turn: null,
  };
}

beforeEach(() => {
  h.fake = new FakeSocket();
  (api.profile as Mock).mockResolvedValue({
    displayName: 'Alice',
    stats: { gamesPlayed: 0, wins: 0, losses: 0, winRate: 0 },
  });
});

describe('Quick Play (006): „Match suchen" → nahtloser Übergang', () => {
  it('eingeloggter Spieler sucht, wartet und wird per queue:matched in die Platzierung überführt', async () => {
    (api.me as Mock).mockResolvedValue({ kind: 'user', displayName: 'Alice' });
    h.fake.setAck('queue:join', () => ({ ok: true, status: 'waiting' }));

    render(<OnlinePage />);
    await act(async () => h.fake.serverEmit('connect', undefined));

    await userEvent.click(await screen.findByRole('button', { name: 'Match suchen' }));

    // Wartestatus + Abbrechen sichtbar (FR-002/008/014).
    expect(await screen.findByText('Suche Gegner …')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
    expect(h.fake.emitted.find((e) => e.event === 'queue:join')).toBeUndefined(); // join geht über emitWithAck

    // Server paart → queue:matched: Lobby-Status placing wird sichtbar (kein paralleler Pfad, FR-007).
    const matched: QueueMatchedMsg = {
      code: '7K3-Q9X',
      you: 'A',
      lobby: lobby('placing'),
      reconnectToken: 'rt-a',
    };
    await act(async () => h.fake.serverEmit('queue:matched', matched));

    expect(await screen.findByText('7K3-Q9X')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/placing/)).toBeInTheDocument());
    expect(screen.getByText(/Schiffe platzieren/)).toBeInTheDocument();
  });

  it('zeigt „kein Match gefunden" bei queue:timeout und erlaubt erneute Suche', async () => {
    (api.me as Mock).mockResolvedValue({ kind: 'user', displayName: 'Alice' });
    h.fake.setAck('queue:join', () => ({ ok: true, status: 'waiting' }));

    render(<OnlinePage />);
    await act(async () => h.fake.serverEmit('connect', undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Match suchen' }));

    await act(async () => h.fake.serverEmit('queue:timeout', { reason: 'no-match' }));

    expect(await screen.findByText(/Kein Match gefunden/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Match suchen' })).toBeInTheDocument();
  });

  it('Abbrechen sendet queue:leave und beendet den Wartestatus (FR-008)', async () => {
    (api.me as Mock).mockResolvedValue({ kind: 'user', displayName: 'Alice' });
    h.fake.setAck('queue:join', () => ({ ok: true, status: 'waiting' }));

    render(<OnlinePage />);
    await act(async () => h.fake.serverEmit('connect', undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Match suchen' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Abbrechen' }));

    expect(h.fake.emitted.some((e) => e.event === 'queue:leave')).toBe(true);
    expect(screen.getByRole('button', { name: 'Match suchen' })).toBeInTheDocument();
  });
});
