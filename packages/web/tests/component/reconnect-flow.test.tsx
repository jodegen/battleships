import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import OnlinePage from '../../app/online/page';
import { api } from '@/api/client';
import type { LobbyView } from '@/realtime/socket-client';

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

function lobby(status: LobbyView['status']): LobbyView {
  return {
    code: '7K3-Q9X',
    status,
    settings: SETTINGS,
    players: [{ seat: 0, playerId: 'A', displayName: 'Alice', isGuest: false, connected: true, placed: false }],
    turn: null,
  };
}

beforeEach(() => {
  h.fake = new FakeSocket();
  localStorage.clear();
  (api.profile as Mock).mockResolvedValue({ displayName: 'Alice', stats: { gamesPlayed: 0, wins: 0, losses: 0, winRate: 0 } });
});

describe('Reconnect-UI: Token-Persistenz & Auto-Resume (005, US1)', () => {
  it('speichert das Token (überlebt Reload), reconnectet automatisch und räumt bei game:over', async () => {
    (api.me as Mock).mockResolvedValue({ kind: 'user', displayName: 'Alice' });
    h.fake.setAck('lobby:create', () => ({ ok: true, code: '7K3-Q9X', lobby: lobby('waiting'), reconnectToken: 'tok-123' }));

    render(<OnlinePage />);
    await act(async () => h.fake.serverEmit('connect', undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Lobby erstellen' }));

    // Token persistiert (übersteht einen Reload).
    const stored = JSON.parse(localStorage.getItem('schiffe.reconnect') ?? '{}');
    expect(stored).toMatchObject({ code: '7K3-Q9X', token: 'tok-123', playerId: 'A' });

    // Erneutes `connect` (Auto-Reconnect des Transports) → automatisch reconnect:resume.
    await act(async () => h.fake.serverEmit('connect', undefined));
    const resume = h.fake.emitted.find((e) => e.event === 'reconnect:resume');
    expect(resume?.payload).toMatchObject({ code: '7K3-Q9X', token: 'tok-123' });

    // Partie beendet → Token wird verworfen.
    await act(async () => h.fake.serverEmit('game:over', { code: '7K3-Q9X', winner: 'A', reason: 'forfeit' }));
    expect(localStorage.getItem('schiffe.reconnect')).toBeNull();
  });
});
