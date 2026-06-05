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
const profile = { displayName: 'Alice', stats: { gamesPlayed: 2, wins: 1, losses: 1, winRate: 0.5 } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AuthPanel (US1)', () => {
  it('Session-Restore: zeigt eingeloggten Nutzer + Statistik (SC-010)', async () => {
    mocked.me.mockResolvedValue({ kind: 'user', displayName: 'Alice' });
    mocked.profile.mockResolvedValue(profile);

    render(<Harness />);

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByLabelText('Statistik')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('Registrieren meldet an und zeigt das Profil', async () => {
    mocked.me.mockResolvedValue({ kind: 'anonymous' });
    mocked.register.mockResolvedValue(profile);
    mocked.profile.mockResolvedValue(profile);

    render(<Harness />);
    await screen.findByLabelText('Registrieren');

    await userEvent.type(screen.getByLabelText('Anzeigename'), 'Alice');
    await userEvent.type(screen.getByLabelText('E-Mail'), 'alice@example.com');
    await userEvent.type(screen.getByLabelText('Passwort'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Konto erstellen' }));

    await waitFor(() => expect(mocked.register).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Alice')).toBeInTheDocument();
  });

  it('Abmelden kehrt zur Anmeldemaske zurück (FR-010)', async () => {
    mocked.me.mockResolvedValue({ kind: 'user', displayName: 'Alice' });
    mocked.profile.mockResolvedValue(profile);
    mocked.logout.mockResolvedValue(undefined);

    render(<Harness />);
    await userEvent.click(await screen.findByRole('button', { name: 'Abmelden' }));

    expect(await screen.findByLabelText('Registrieren')).toBeInTheDocument();
    expect(mocked.logout).toHaveBeenCalledTimes(1);
  });

  it('zeigt eine Fehlermeldung bei abgelehnter Anmeldung (FR-008)', async () => {
    const { ApiError } = await import('@/api/client');
    mocked.me.mockResolvedValue({ kind: 'anonymous' });
    mocked.login.mockRejectedValue(new ApiError(401, 'Ungültige Zugangsdaten.'));

    render(<Harness />);
    await screen.findByLabelText('Anmelden');
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ungültige Zugangsdaten.');
  });
});
