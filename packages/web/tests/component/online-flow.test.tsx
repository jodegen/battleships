import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import OnlinePage from '../../app/online/page';
import { api } from '@/api/client';
import type { GameViewMsg, LobbyView } from '@/realtime/socket-client';

// ── Kontrollierbarer Fake-Socket (kein echter Server in jsdom) ──────────────────
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
  // Test-Steuerung
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

function lobby(status: LobbyView['status'], players: number, turn: LobbyView['turn'] = null): LobbyView {
  return {
    code: '7K3-Q9X',
    status,
    settings: SETTINGS,
    players: [
      { seat: 0, playerId: 'A', displayName: 'Alice', isGuest: false, connected: true, placed: status !== 'placing' },
      ...(players === 2
        ? [{ seat: 1 as const, playerId: 'B' as const, displayName: 'Bob', isGuest: true, connected: true, placed: status !== 'placing' }]
        : []),
    ],
    turn,
  };
}

beforeEach(() => {
  h.fake = new FakeSocket();
  (api.profile as Mock).mockResolvedValue({ displayName: 'Alice', stats: { gamesPlayed: 0, wins: 0, losses: 0, winRate: 0 } });
});

describe('Online-Flow: Lobby (US1)', () => {
  it('eingeloggter Spieler erstellt eine Lobby → Code wird angezeigt', async () => {
    (api.me as Mock).mockResolvedValue({ kind: 'user', displayName: 'Alice' });
    h.fake.setAck('lobby:create', () => ({ ok: true, code: '7K3-Q9X', lobby: lobby('waiting', 1) }));

    render(<OnlinePage />);
    await act(async () => h.fake.serverEmit('connect', undefined));

    await userEvent.click(await screen.findByRole('button', { name: 'Lobby erstellen' }));

    expect(await screen.findByText('7K3-Q9X')).toBeInTheDocument();
    expect(screen.getByText(/Code zum Teilen/)).toBeInTheDocument();
    // create-Intent wurde mit den gewählten Einstellungen gesendet
    expect(h.fake.emitted.length).toBe(0); // create geht über emitWithAck, nicht emit
  });

  it('Gast tritt per Code bei → Lobby-Status placing wird sichtbar', async () => {
    (api.me as Mock).mockResolvedValue({ kind: 'guest', displayName: 'Bob' });
    h.fake.setAck('lobby:join', () => ({ ok: true, lobby: lobby('placing', 2) }));

    render(<OnlinePage />);
    await act(async () => h.fake.serverEmit('connect', undefined));

    await userEvent.type(await screen.findByPlaceholderText('7K3-Q9X'), '7K3-Q9X');
    await userEvent.type(screen.getByPlaceholderText('Dein Name'), 'Bob');
    await userEvent.click(screen.getByRole('button', { name: 'Beitreten' }));

    expect(await screen.findByText('7K3-Q9X')).toBeInTheDocument();
    expect(screen.getByText(/placing/)).toBeInTheDocument();
    expect(screen.getByText(/Schiffe platzieren/)).toBeInTheDocument();
  });
});

describe('Online-Flow: Platzierung → Start (US2)', () => {
  it('bestätigt Aufstellung, wartet auf Gegner, zeigt dann das Brett & „am Zug"', async () => {
    (api.me as Mock).mockResolvedValue({ kind: 'user', displayName: 'Alice' });
    h.fake.setAck('lobby:create', () => ({ ok: true, code: '7K3-Q9X', lobby: lobby('waiting', 1) }));
    h.fake.setAck('fleet:place', () => ({ ok: true }));

    render(<OnlinePage />);
    await act(async () => h.fake.serverEmit('connect', undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Lobby erstellen' }));

    // Gegner tritt bei → placing
    await act(async () => h.fake.serverEmit('lobby:state', lobby('placing', 2)));
    const confirm = await screen.findByRole('button', { name: 'Zufällige Aufstellung bestätigen' });
    await userEvent.click(confirm);

    // nach erfolgreichem fleet:place → „Warte auf Gegner …"
    expect(await screen.findByRole('button', { name: 'Warte auf Gegner …' })).toBeDisabled();

    // Server startet die Partie (in_progress) und sendet die Fog-of-War-Sicht
    const view: GameViewMsg = {
      code: '7K3-Q9X',
      you: 'A',
      own: { ships: [], shotsReceived: [] },
      opponentShots: [],
      turn: 'A',
      turnDeadline: null,
    };
    await act(async () => {
      h.fake.serverEmit('lobby:state', lobby('in_progress', 2, 'A'));
      h.fake.serverEmit('game:view', view);
    });

    await waitFor(() => expect(screen.getByText('Dein Brett')).toBeInTheDocument());
    expect(screen.getByText('Angriff')).toBeInTheDocument();
    expect(screen.getByText(/Du bist am Zug/)).toBeInTheDocument();
  });
});
