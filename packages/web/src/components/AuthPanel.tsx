'use client';

import { useState } from 'react';

import type { IdentityState } from '@/auth/useIdentity';
import { ProfilePanel } from './ProfilePanel';

/**
 * Minimale, bewusst ungestylte Auth-UI: Registrieren / Anmelden / als Gast fortfahren,
 * plus Profil/Abmelden für eingeloggte Spieler. Eingeloggt-only-Affordances (Profil)
 * werden für Gast/anonym nicht gezeigt (US4/FR-003).
 */
export function AuthPanel({ identity }: { identity: IdentityState }): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const { identity: id, stats, loading, error } = identity;

  if (loading) return <section aria-label="Konto">Lädt …</section>;

  if (id.kind === 'user') {
    return (
      <section aria-label="Konto">
        <p>
          Angemeldet als <strong>{id.displayName}</strong>
        </p>
        <ProfilePanel stats={stats} />
        <button type="button" onClick={() => void identity.logout()}>
          Abmelden
        </button>
      </section>
    );
  }

  if (id.kind === 'guest') {
    return (
      <section aria-label="Konto">
        <p>
          Als Gast: <strong>{id.displayName}</strong> (keine Statistik)
        </p>
        <button type="button" onClick={() => void identity.logout()}>
          Verlassen
        </button>
      </section>
    );
  }

  const submit = (action: 'register' | 'login') => (e: React.FormEvent) => {
    e.preventDefault();
    const run =
      action === 'register'
        ? identity.register({ email, password, displayName })
        : identity.login({ email, password });
    void run.catch(() => undefined);
  };

  return (
    <section aria-label="Konto">
      {error && <p role="alert">{error}</p>}

      <form aria-label="Registrieren" onSubmit={submit('register')}>
        <h2>Registrieren</h2>
        <label>
          Anzeigename
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label>
          E-Mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Passwort
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit">Konto erstellen</button>
      </form>

      <form aria-label="Anmelden" onSubmit={submit('login')}>
        <h2>Anmelden</h2>
        <button type="submit">Anmelden</button>
      </form>

      <form
        aria-label="Als Gast"
        onSubmit={(e) => {
          e.preventDefault();
          void identity.continueAsGuest(displayName || 'Gast').catch(() => undefined);
        }}
      >
        <h2>Als Gast spielen</h2>
        <button type="submit">Als Gast fortfahren</button>
      </form>
    </section>
  );
}
