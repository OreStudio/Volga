import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useConnectionsCatalog } from '../api/connections-queries.js';
import { useSession } from '../session/SessionProvider.js';
import { ApiFailure } from '../api/transport.js';
import { Button, Field, Input, Notice, Select, Tag } from '../ui/Primitives.js';
import type { ConnectionView, EnvironmentView } from '@volga/contracts';
import type { PartySummary } from '@volga/protocol/browser';

/**
 * Signing in.
 *
 * A plain web form: a username, a password, and a submit button. The connection
 * details are a fallback rather than the main event, so they sit behind a
 * disclosure and only the address is shown, since that is the only part anyone
 * changes by hand.
 *
 * Everything about saved connections appears only once the store is unlocked.
 * That is the honest behaviour rather than a convenience: an encrypted password
 * is useless without the master password, so a list of connections that cannot
 * be used would be decoration. Locked, this is an ordinary login form with one
 * extra button offering to unlock.
 */

interface Selection {
  readonly kind: 'manual' | 'environment' | 'connection';
  readonly id?: string;
}

export function SignInPage(): ReactNode {
  const { signIn, chooseParty } = useSession();
  const { catalog } = useConnectionsCatalog();

  const [selection, setSelection] = useState<Selection>({ kind: 'manual' });
  const [label, setLabel] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [server, setServer] = useState('localhost');
  const [port, setPort] = useState(4222);
  const [subjectPrefix, setSubjectPrefix] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingParties, setPendingParties] = useState<readonly PartySummary[] | null>(null);

  const environments = useMemo(() => catalog?.environments ?? [], [catalog]);
  const connections = useMemo(() => catalog?.connections ?? [], [catalog]);
  const unlocked = catalog?.store.unlocked ?? false;

  const labels = useMemo(() => {
    const found = new Set<string>();
    for (const item of [...environments, ...connections]) {
      for (const name of item.tagNames) {
        found.add(name);
      }
    }
    return [...found].sort();
  }, [environments, connections]);

  const visibleEnvironments = environments.filter(
    (item) => label === '' || item.tagNames.includes(label),
  );
  const visibleConnections = connections.filter(
    (item) => label === '' || item.tagNames.includes(label),
  );

  function applyEnvironment(environment: EnvironmentView): void {
    setServer(environment.endpoint.host);
    setPort(environment.endpoint.port);
    setSubjectPrefix(environment.endpoint.subjectPrefix);
  }

  function applyConnection(connection: ConnectionView): void {
    // Choosing a saved connection means "use what is stored", so anything typed
    // for a different attempt is dropped rather than sent in its place.
    setPassword('');
    setError(null);

    const where = connection.environment;
    if (where.kind === 'environment') {
      const environment = environments.find((item) => item.id === where.id);
      if (environment !== undefined) {
        applyEnvironment(environment);
      }
    } else {
      setServer(where.endpoint.host);
      setPort(where.endpoint.port);
      setSubjectPrefix(where.endpoint.subjectPrefix);
    }
    setUsername(connection.username);
  }

  function handleChoice(value: string): void {
    setError(null);
    if (value === '') {
      setSelection({ kind: 'manual' });
      return;
    }
    const separator = value.indexOf(':');
    const kind = value.slice(0, separator);
    const id = value.slice(separator + 1);

    if (kind === 'environment') {
      const environment = environments.find((item) => item.id === id);
      if (environment !== undefined) {
        setSelection({ kind: 'environment', id });
        applyEnvironment(environment);
      }
      return;
    }
    const connection = connections.find((item) => item.id === id);
    if (connection !== undefined) {
      setSelection({ kind: 'connection', id });
      applyConnection(connection);
    }
  }

  const selectionValue = selection.kind === 'manual' ? '' : `${selection.kind}:${selection.id ?? ''}`;
  const chosenConnection =
    selection.kind === 'connection'
      ? connections.find((item) => item.id === selection.id)
      : undefined;
  const usingSavedPassword = chosenConnection?.hasSavedPassword === true;

  const canSubmit =
    username.trim().length > 0 &&
    server.trim().length > 0 &&
    !busy &&
    (password.length > 0 || usingSavedPassword);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn(
        { username: username.trim(), password },
        {
          server: server.trim(),
          port,
          subjectPrefix: subjectPrefix.trim(),
          ...(selection.kind === 'connection' && selection.id !== undefined
            ? { connectionId: selection.id }
            : {}),
        },
      );
      if (result.outcome === 'party-required') {
        setPendingParties(result.parties);
      }
    } catch (cause) {
      setError(cause instanceof ApiFailure ? cause.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  if (pendingParties !== null) {
    return (
      <div className="mx-auto max-w-sm pt-12">
        <h1 className="text-lg font-semibold tracking-tight">Choose a party</h1>
        <p className="mt-1 mb-5 text-sm text-ink-muted">
          This account works in more than one party. Pick the one to open.
        </p>
        {error !== null && <Notice tone="error">{error}</Notice>}
        <ul className="space-y-2">
          {pendingParties.map((party) => (
            <li key={party.id}>
              <button
                type="button"
                disabled={busy}
                className="card flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:border-line-strong hover:bg-surface-hover disabled:opacity-50"
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
    <div className="mx-auto max-w-sm pt-12">
      <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 mb-5 text-sm text-ink-muted">
        {unlocked
          ? 'Pick a saved connection, or enter the details yourself.'
          : 'Enter your credentials. Unlock the store to use a saved connection.'}
      </p>

      {error !== null && <Notice tone="error">{error}</Notice>}

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        {unlocked && (environments.length > 0 || connections.length > 0) && (
          <>
            {labels.length > 0 && (
              <Field label="Filter by label">
                <Select value={label} onChange={(event) => setLabel(event.target.value)}>
                  <option value="">All connections</option>
                  {labels.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field label="Connection">
              <Select value={selectionValue} onChange={(event) => handleChoice(event.target.value)}>
                <option value="">Enter details manually</option>
                {visibleEnvironments.length > 0 && (
                  <optgroup label="Environments">
                    {visibleEnvironments.map((environment) => (
                      <option key={environment.id} value={`environment:${environment.id}`}>
                        {environment.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {visibleConnections.length > 0 && (
                  <optgroup label="Saved connections">
                    {visibleConnections.map((connection) => (
                      <option key={connection.id} value={`connection:${connection.id}`}>
                        {connection.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </Field>
          </>
        )}

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

        <Field
          label="Password"
          {...(usingSavedPassword && password.length === 0
            ? { hint: 'The saved password will be used.' }
            : {})}
        >
          <div className="relative">
            <Input
              name="password"
              type={reveal ? 'text' : 'password'}
              value={password}
              autoComplete="current-password"
              className="pr-16"
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
            />
            {/* A toggle rather than a checkbox, because it acts on this field
                and belongs beside it. */}
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

        <details
          open={advanced}
          onToggle={(event) => setAdvanced((event.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-xs text-ink-faint hover:text-ink-muted">
            Connection details
          </summary>
          <div className="mt-3 space-y-3">
            <Field label="Server">
              <Input
                value={server}
                required
                onChange={(event) => setServer(event.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Port">
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(event) => setPort(Number(event.target.value))}
                />
              </Field>
              <Field label="Namespace">
                <Input
                  value={subjectPrefix}
                  placeholder="ores.dev.local1"
                  onChange={(event) => setSubjectPrefix(event.target.value)}
                />
              </Field>
            </div>
          </div>
        </details>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!canSubmit}
          pending={busy}
          pendingLabel="Signing in..."
        >
          Sign in
        </Button>
      </form>
    </div>
  );
}
