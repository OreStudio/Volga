import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useConnectionsCatalog, useConnectionsMutations } from '../api/connections-queries.js';
import { useSession } from '../session/SessionProvider.js';
import { ApiFailure } from '../api/transport.js';
import banner from '../assets/ore-studio-banner.png';
import type { ConnectionView, EnvironmentView } from '@volga/contracts';
import type { PartySummary } from '@volga/protocol/browser';

/**
 * The sign-in screen.
 *
 * The shape follows the desktop client, because the people using it already
 * know it: a label filter, a quick-connect chooser that fills the fields below
 * it, an optional unlock for stored credentials, and then the credential.
 *
 * The store is read before anyone signs in, which is what lets the chooser be
 * populated at all. Only stored passwords need unlocking.
 */

/** What the chooser is currently set to. */
type Selection =
  | { readonly kind: 'none' }
  | { readonly kind: 'environment'; readonly id: string }
  | { readonly kind: 'connection'; readonly id: string };

export function SignInPage(): ReactNode {
  const { signIn, chooseParty } = useSession();
  const { catalog, isLoading } = useConnectionsCatalog();
  const { unlock } = useConnectionsMutations();

  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [label, setLabel] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [server, setServer] = useState('localhost');
  const [port, setPort] = useState(4222);
  const [subjectPrefix, setSubjectPrefix] = useState('');
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

  const visibleEnvironments = useMemo(
    () => environments.filter((item) => label === '' || item.tagNames.includes(label)),
    [environments, label],
  );
  const visibleConnections = useMemo(
    () => connections.filter((item) => label === '' || item.tagNames.includes(label)),
    [connections, label],
  );

  function applyEnvironment(environment: EnvironmentView): void {
    setServer(environment.endpoint.host);
    setPort(environment.endpoint.port);
    setSubjectPrefix(environment.endpoint.subjectPrefix);
  }

  function applyConnection(connection: ConnectionView): void {
    // Picking a saved connection means "use what is stored". Anything typed
    // earlier belongs to a different attempt and would otherwise be sent
    // instead of the saved credential, which looks like the saved password
    // being wrong.
    setPassword('');

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

  /** The single chooser, grouped the way the desktop client groups it. */
  function handleChoice(value: string): void {
    if (value === '') {
      setSelection({ kind: 'none' });
      return;
    }
    // Switching away from a saved connection drops its stored credential.
    setPassword('');
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
    if (kind === 'connection') {
      const connection = connections.find((item) => item.id === id);
      if (connection !== undefined) {
        setSelection({ kind: 'connection', id });
        applyConnection(connection);
      }
    }
  }

  const selectionValue = selection.kind === 'none' ? '' : `${selection.kind}:${selection.id}`;

  const chosenConnection =
    selection.kind === 'connection'
      ? connections.find((item) => item.id === selection.id)
      : undefined;
  const needsUnlock = chosenConnection?.hasSavedPassword === true && !unlocked;

  const canSubmit =
    username.trim().length > 0 &&
    server.trim().length > 0 &&
    !busy &&
    (password.length > 0 || (chosenConnection?.hasSavedPassword === true && unlocked));

  useEffect(() => {
    // A label that no longer exists would silently hide everything.
    if (label !== '' && !labels.includes(label)) {
      setLabel('');
    }
  }, [label, labels]);

  async function handleUnlock(): Promise<void> {
    setError(null);
    try {
      await unlock.mutateAsync(masterPassword);
      setMasterPassword('');
    } catch (cause) {
      setError(cause instanceof ApiFailure ? cause.message : 'Could not unlock the store.');
    }
  }

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
          ...(selection.kind === 'connection' ? { connectionId: selection.id } : {}),
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

  if (pendingParties !== null) {
    return (
      <div className="signin">
        <div className="signin__card">
          <h1 className="visually-hidden">Sign in</h1>
          <img className="signin__banner" src={banner} alt="ORE Studio" />
          <p className="signin__tagline">Choose the party to work in.</p>
          {error !== null && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
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
        </div>
      </div>
    );
  }

  return (
    <div className="signin">
      <form className="signin__card" onSubmit={(event) => void handleSubmit(event)}>
        <h1 className="visually-hidden">Sign in</h1>
        <img className="signin__banner" src={banner} alt="ORE Studio" />
        <p className="signin__tagline">Sign in to continue.</p>

        {error !== null && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}

        <label className="field">
          <span className="field__label">Username</span>
          <input
            className="field__input"
            name="username"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setError(null);
            }}
            placeholder="Enter your username"
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
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
            placeholder="Enter your password"
            autoComplete="current-password"
          />
        </label>

        <div className="options-row">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            <span>Show password</span>
          </label>
        </div>

        {isLoading && <p className="spinner">Loading environments...</p>}

        {catalog !== undefined && environments.length === 0 && connections.length === 0 && (
          <p className="signin__hint">
            No environments are saved yet. Use the Connections menu to add one.
          </p>
        )}

        {labels.length > 0 && (
          <label className="field">
            <span className="field__label">Label</span>
            <select
              className="field__input"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            >
              <option value="">All</option>
              {labels.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}

        {(environments.length > 0 || connections.length > 0) && (
          <label className="field">
            <span className="field__label">Quick connect</span>
            <select
              className="field__input"
              value={selectionValue}
              onChange={(event) => handleChoice(event.target.value)}
            >
              <option value="">— connect manually —</option>
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
                <optgroup label="Connections">
                  {visibleConnections.map((connection) => (
                    <option key={connection.id} value={`connection:${connection.id}`}>
                      {connection.name}
                      {connection.description.length > 0 ? ` — ${connection.description}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
        )}

        {needsUnlock && (
          <div className="unlock">
            <span className="field__label">Master password</span>
            <p className="signin__hint">
              This connection has a saved password. Unlock the store to use it.
            </p>
            <div className="unlock__row">
              <input
                className="field__input"
                type="password"
                value={masterPassword}
                onChange={(event) => setMasterPassword(event.target.value)}
                placeholder="Master password"
                autoComplete="off"
              />
              <button
                className="button button--ghost"
                type="button"
                disabled={masterPassword.length === 0 || unlock.isPending}
                onClick={() => void handleUnlock()}
              >
                {unlock.isPending ? 'Unlocking...' : 'Unlock'}
              </button>
            </div>
          </div>
        )}

        <label className="field">
          <span className="field__label">Server</span>
          <input
            className="field__input"
            value={server}
            onChange={(event) => setServer(event.target.value)}
            placeholder="localhost"
            required
          />
        </label>

        <label className="field">
          <span className="field__label">Port</span>
          <input
            className="field__input"
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(event) => setPort(Number(event.target.value))}
            required
          />
        </label>

        <label className="field">
          <span className="field__label">Namespace</span>
          <input
            className="field__input"
            value={subjectPrefix}
            onChange={(event) => setSubjectPrefix(event.target.value)}
            placeholder="ores.dev.local1"
          />
        </label>

        <button className="button button--primary" type="submit" disabled={!canSubmit}>
          {busy ? 'Signing in...' : 'Login'}
        </button>
      </form>
    </div>
  );
}
