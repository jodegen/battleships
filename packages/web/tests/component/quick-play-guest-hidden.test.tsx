import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import OnlinePage from '../../app/online/page';
import { api } from '@/api/client';

class FakeSocket {
  private handlers = new Map<string, (p: unknown) => void>();
  on(event: string, cb: (p: unknown) => void): this {
    this.handlers.set(event, cb);
    return this;
  }
  emit(): boolean {
    return true;
  }
  async emitWithAck(): Promise<unknown> {
    return { ok: false, error: 'no-responder' };
  }
  disconnect(): void {
    /* noop */
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

beforeEach(() => {
  h.fake = new FakeSocket();
});

describe('Quick Play (006): Gäste haben keinen Zugang (US3/FR-001)', () => {
  it('zeigt Gästen KEINEN „Match suchen"-Einstieg, aber den Code-Beitritt', async () => {
    (api.me as Mock).mockResolvedValue({ kind: 'guest', displayName: 'Gus' });

    render(<OnlinePage />);
    await act(async () => h.fake.serverEmit('connect', undefined));

    // Beitritt per Code bleibt verfügbar …
    expect(await screen.findByRole('button', { name: 'Beitreten' })).toBeInTheDocument();
    // … aber Quick Play nicht.
    expect(screen.queryByRole('button', { name: 'Match suchen' })).not.toBeInTheDocument();
    expect(screen.queryByText('Quick Play')).not.toBeInTheDocument();
  });

  it('zeigt eingeloggten Spielern den „Match suchen"-Einstieg', async () => {
    (api.me as Mock).mockResolvedValue({ kind: 'user', displayName: 'Alice' });
    (api.profile as Mock).mockResolvedValue({ displayName: 'Alice', stats: { gamesPlayed: 0, wins: 0, losses: 0, winRate: 0 } });

    render(<OnlinePage />);
    await act(async () => h.fake.serverEmit('connect', undefined));

    expect(await screen.findByRole('button', { name: 'Match suchen' })).toBeInTheDocument();
  });
});
