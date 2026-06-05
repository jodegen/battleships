import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthPanel } from '@/components/AuthPanel';
import { useIdentity } from '@/auth/useIdentity';

vi.mock('@/api/client', () => {
  class ApiError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    ApiError,
    api: {
      me: vi.fn(),
      register: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      guest: vi.fn(),
      profile: vi.fn(),
      stats: vi.fn(),
    },
  };
});

import { api } from '@/api/client';

function Harness(): JSX.Element {
  const identity = useIdentity();
  return <AuthPanel identity={identity} />;
}

const mocked = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Gast-Flow (US3)', () => {
  it('Als Gast fortfahren zeigt den Gast und KEINE Statistik (FR-014)', async () => {
    mocked.me.mockResolvedValue({ kind: 'anonymous' });
    mocked.guest.mockResolvedValue({ kind: 'guest', displayName: 'Gast' });

    render(<Harness />);
    await userEvent.click(await screen.findByRole('button', { name: 'Als Gast fortfahren' }));

    await waitFor(() => expect(mocked.guest).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Als Gast:/)).toBeInTheDocument();
    // Gäste haben keine Statistik und kein Profil (US4-4).
    expect(screen.queryByLabelText('Statistik')).not.toBeInTheDocument();
    expect(mocked.profile).not.toHaveBeenCalled();
  });

  it('ein eingeloggter Gast sieht keine eingeloggt-only-Profilanzeige', async () => {
    mocked.me.mockResolvedValue({ kind: 'guest', displayName: 'Gast' });

    render(<Harness />);
    expect(await screen.findByText(/Als Gast:/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Statistik')).not.toBeInTheDocument();
  });
});
