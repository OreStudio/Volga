import { useState, type FormEvent, type ReactNode } from 'react';
import { useSession } from '../session/SessionProvider.js';
import { useSiteState } from '../api/site.js';
import { ApiFailure } from '../api/transport.js';
import { Button, Field, Input, Notice, Tag } from '../ui/Primitives.js';
import type { PartySummary } from '@volga/protocol/browser';

/**
 * Signing in.
 *
 * An ordinary web application login. A username, a password, and the name of
 * the environment so the person knows where they are. Nothing else, because
 * where the application points is not theirs to choose.
 */
export function SignInPage(): ReactNode {
  const { signIn, chooseParty } = useSession();
  const { site } = useSiteState();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingParties, setPendingParties] = useState<readonly PartySummary[] | null>(null);

  const developerAccounts = site?.developerTools === true ? site.developerAccounts : [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn({ username: username.trim(), password });

      if (result.outcome === 'party-required') {
        setPendingParties(result.parties);
      }
    } catch (cause) {
      setError(cause instanceof ApiFailure ? cause.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function chooseAndSignIn(accountUsername: string): Promise<void> {
    setUsername(accountUsername);
    setError(null);
    // The test accounts share a well-known password, so the form only needs the
    // account chosen. This is a convenience for a developer, and it is a
    // convenience only: it fills the same fields the form would.
    setPassword('');
    document.getElementById('password')?.focus();
  }

  if (pendingParties !== null) {
    return (
      <div className="mx-auto max-w-md pt-10">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Choose a party</h1>
        <p className="mb-6 text-sm text-ink-muted">
          This account works in more than one party. Pick the one to open.
        </p>
        {error !== null && <Notice tone="error">{error}</Notice>}
        <ul className="space-y-2">
          {pendingParties.map((party) => (
            <li key={party.id}>
              <button
                type="button"
                disabled={busy}
                className="card flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:border-line-strong disabled:opacity-50"
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  chooseParty(party.id, pendingParties)
                    .catch((cause: unknown) =>
                      setError(cause instanceof ApiFailure ? cause.message : 'That did not work.'),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                <span>{party.name.length > 0 ? party.name : party.id}</span>
                {party.partyCategory.length > 0 && <Tag>{party.partyCategory}</Tag>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-10 pt-10 md:grid-cols-2">
      <div>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mb-6 text-sm text-ink-muted">
          {site === undefined ? (
            'Loading...'
          ) : (
            <>
              You are signing in to{' '}
              <span className="text-ink">{site.environment.displayName}</span>.
            </>
          )}
        </p>

        {site?.environment.nonProduction === true && (
          <Notice>
            <span className="font-medium">{site.environment.displayName}</span> is not a
            production environment.
          </Notice>
        )}

        {error !== null && <Notice tone="error">{error}</Notice>}

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <Field label="Username">
            <Input
              name="username"
              value={username}
              autoComplete="username"
              autoFocus
              required
              onChange={(event) => {
                setUsername(event.target.value);
                setError(null);
              }}
            />
          </Field>

          <Field label="Password">
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={reveal ? 'text' : 'password'}
                value={password}
                autoComplete="current-password"
                className="pr-16"
                required
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError(null);
                }}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 px-3 text-xs text-ink-faint hover:text-ink"
                aria-pressed={reveal}
                onClick={() => setReveal((value) => !value)}
              >
                {reveal ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={busy || username.trim().length === 0 || password.length === 0}
            pending={busy}
            pendingLabel="Signing in..."
          >
            Sign in
          </Button>
        </form>
      </div>

      {developerAccounts.length > 0 && (
        <aside className="card h-fit p-5">
          <h2 className="text-sm font-semibold">Test accounts</h2>
          <p className="mt-1 mb-4 text-xs text-ink-faint">
            This deployment offers the ACME test accounts. They share a well-known password,
            which you still type above.
          </p>
          <ul className="space-y-1">
            {developerAccounts.map((account) => (
              <li key={account.username}>
                <button
                  type="button"
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-ink-muted hover:bg-surface-hover hover:text-ink"
                  onClick={() => void chooseAndSignIn(account.username)}
                >
                  <span className="block font-mono text-xs text-ink">{account.username}</span>
                  {(account.label.length > 0 || account.description.length > 0) && (
                    <span className="block text-xs text-ink-faint">
                      {account.label.length > 0 ? account.label : account.description}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
