import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiFailure } from '../api/client.js';
import { useSession } from '../session/SessionProvider.js';
import type { PartySummary } from '@volga/protocol/browser';

/**
 * The sign-in screen.
 *
 * A multi-party account needs a second step, so the picker is part of this
 * screen rather than a separate route: the credential has been accepted, and
 * the session is not usable until a party is chosen.
 */
export function SignInPage(): ReactNode {
  const { signIn, chooseParty } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pendingParties, setPendingParties] = useState<readonly PartySummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn({ username, password });
      if (result.outcome === 'party-required') {
        setPendingParties(result.parties);
      }
    } catch (cause) {
      setError(cause instanceof ApiFailure ? cause.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleParty(partyId: string): Promise<void> {
    if (pendingParties === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await chooseParty(partyId, pendingParties);
    } catch (cause) {
      setError(cause instanceof ApiFailure ? cause.message : 'Could not select that party.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="signin">
      <div className="signin__card">
        <h1 className="signin__brand">ORE Studio</h1>
        <p className="signin__tagline">
          {pendingParties === null
            ? 'Sign in to continue.'
            : 'Choose the party to work in.'}
        </p>

        {error !== null && <div className="alert" role="alert">{error}</div>}

        {pendingParties === null ? (
          <form onSubmit={(event) => void handleSubmit(event)}>
            <label className="field">
              <span className="field__label">Username</span>
              <input
                className="field__input"
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </label>
            <label className="field">
              <span className="field__label">Password</span>
              <input
                className="field__input"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button className="button button--primary" type="submit" disabled={busy}>
              {busy ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        ) : (
          <ul className="party-list">
            {pendingParties.map((party) => (
              <li key={party.id}>
                <button
                  className="button button--ghost party-list__button"
                  type="button"
                  disabled={busy}
                  onClick={() => void handleParty(party.id)}
                >
                  {party.name.length > 0 ? party.name : party.id}
                  {party.partyCategory.length > 0 && (
                    <span className="tag">{party.partyCategory}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
