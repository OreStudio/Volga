import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useConnectionsCatalog, useConnectionsMutations } from '../api/connections-queries.js';
import { ApiFailure } from '../api/transport.js';
import type { ConnectionView, EnvironmentView } from '@volga/contracts';

/**
 * The connections manager.
 *
 * This is the screen that makes the rest possible: before anything is saved
 * there is nowhere to connect, so this is reachable from the menu without
 * signing in.
 *
 * Environments and connections are edited in the same panel because a
 * connection usually points at an environment, and moving between two screens
 * to create one then the other is friction for no benefit.
 */

type Editor =
  | { readonly kind: 'none' }
  | { readonly kind: 'environment'; readonly id?: string }
  | { readonly kind: 'connection'; readonly id?: string };

export function ConnectionsPage(): ReactNode {
  const { catalog, isLoading, error } = useConnectionsCatalog();
  const mutations = useConnectionsMutations();
  const [editor, setEditor] = useState<Editor>({ kind: 'none' });
  const [label, setLabel] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const environments = catalog?.environments ?? [];
  const connections = catalog?.connections ?? [];
  const unlocked = catalog?.store.unlocked ?? false;

  const visibleEnvironments = useMemo(
    () => environments.filter((item) => label === '' || item.tagNames.includes(label)),
    [environments, label],
  );
  const visibleConnections = useMemo(
    () => connections.filter((item) => label === '' || item.tagNames.includes(label)),
    [connections, label],
  );

  /** Runs a mutation and reports the outcome in one place. */
  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setNotice(null);
    try {
      await action();
      setNotice(success);
      return true;
    } catch (cause) {
      setNotice(cause instanceof ApiFailure ? cause.message : 'That did not work.');
      return false;
    }
  }

  return (
    <section>
      <header className="page__header">
        <div>
          <h1 className="page__title">Connections</h1>
          <p className="page__subtitle">
            The environments you can connect to, and the credentials saved for them.
          </p>
        </div>
        <div className="page__actions">
          <button
            className="button button--primary"
            type="button"
            disabled={!unlocked}
            onClick={() => setEditor({ kind: 'environment' })}
          >
            Add environment
          </button>
          <button
            className="button button--ghost"
            type="button"
            disabled={!unlocked || environments.length === 0}
            onClick={() => setEditor({ kind: 'connection' })}
          >
            Add connection
          </button>
        </div>
      </header>

      <StoreBanner
        path={catalog?.store.databasePath ?? ''}
        unlocked={unlocked}
        uninitialised={catalog?.store.uninitialised ?? false}
        hasSavedPasswords={catalog?.store.hasSavedPasswords ?? false}
        namespaces={catalog?.environments.length ?? 0}
      />

      {notice !== null && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}

      {isLoading && <p className="spinner">Loading...</p>}
      {error !== undefined && (
        <div className="alert" role="alert">
          {error.message}
        </div>
      )}

      {catalog !== undefined && catalog.tags.length > 0 && (
        <div className="toolbar">
          <label>
            <span className="field__label">Label</span>
            <select
              className="field__input"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            >
              <option value="">All</option>
              {catalog.tags.map((tag) => (
                <option key={tag.id} value={tag.name}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
          <span className="toolbar__count">
            {visibleEnvironments.length} environments, {visibleConnections.length} connections
          </span>
        </div>
      )}

      <h2 className="section__title">Environments</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Server</th>
              <th scope="col">Namespace</th>
              <th scope="col">Labels</th>
              <th scope="col" className="table__actions">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleEnvironments.map((environment) => (
              <tr key={environment.id}>
                <td>{environment.name}</td>
                <td className="mono">
                  {environment.endpoint.host}:{environment.endpoint.port}
                </td>
                <td className="mono">{environment.endpoint.subjectPrefix}</td>
                <td>
                  {environment.tagNames.map((name) => (
                    <span className="tag" key={name}>
                      {name}
                    </span>
                  ))}
                </td>
                <td className="table__actions">
                  <button
                    className="button button--ghost"
                    type="button"
                    disabled={!unlocked}
                    onClick={() => setEditor({ kind: 'environment', id: environment.id })}
                  >
                    Edit
                  </button>{' '}
                  <button
                    className="button button--danger"
                    type="button"
                    disabled={!unlocked}
                    onClick={() =>
                      void run(
                        () => mutations.deleteEnvironment.mutateAsync(environment.id),
                        `Removed ${environment.name}.`,
                      )
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && visibleEnvironments.length === 0 && (
          <p className="table__empty">No environments yet.</p>
        )}
      </div>

      <h2 className="section__title">Connections</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Username</th>
              <th scope="col">Where</th>
              <th scope="col">Password</th>
              <th scope="col" className="table__actions">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleConnections.map((connection) => (
              <tr key={connection.id}>
                <td>{connection.name}</td>
                <td className="mono">{connection.username}</td>
                <td>
                  {connection.environment.kind === 'environment'
                    ? connection.environment.name
                    : `${connection.environment.endpoint.host}:${connection.environment.endpoint.port}`}
                </td>
                <td>
                  {connection.hasSavedPassword ? (
                    <span className="tag">saved</span>
                  ) : (
                    <span className="tag tag--muted">prompt</span>
                  )}
                </td>
                <td className="table__actions">
                  <button
                    className="button button--ghost"
                    type="button"
                    disabled={!unlocked}
                    onClick={() => setEditor({ kind: 'connection', id: connection.id })}
                  >
                    Edit
                  </button>{' '}
                  <button
                    className="button button--danger"
                    type="button"
                    disabled={!unlocked}
                    onClick={() =>
                      void run(
                        () => mutations.deleteConnection.mutateAsync(connection.id),
                        `Removed ${connection.name}.`,
                      )
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && visibleConnections.length === 0 && (
          <p className="table__empty">No connections yet.</p>
        )}
      </div>

      {editor.kind !== 'none' && (
        <EditorPanel
          editor={editor}
          environments={environments}
          connections={connections}
          onClose={() => setEditor({ kind: 'none' })}
          onSaved={(message) => {
            setEditor({ kind: 'none' });
            setNotice(message);
          }}
        />
      )}
    </section>
  );
}

/** The store's location and lock state, because a person needs to find it. */
function StoreBanner({
  path,
  unlocked,
  uninitialised,
  hasSavedPasswords,
  namespaces,
}: {
  readonly path: string;
  readonly unlocked: boolean;
  readonly uninitialised: boolean;
  readonly hasSavedPasswords: boolean;
  readonly namespaces: number;
}): ReactNode {
  return (
    <div className="store-banner">
      <div>
        <span className="detail-panel__term">Database</span>
        <div className="mono">{path}</div>
        <p className="signin__hint">
          This file is your connections. Copy it to another machine to take them with you.
        </p>
      </div>
      <div className="store-banner__state">
        {uninitialised && <span className="tag tag--system">no master password</span>}
        {hasSavedPasswords && !unlocked && <span className="tag tag--system">locked</span>}
        {hasSavedPasswords && unlocked && <span className="tag">unlocked</span>}
        <span className="tag">{namespaces} environments</span>
      </div>
    </div>
  );
}

/** The shared editor for an environment or a connection. */
function EditorPanel({
  editor,
  environments,
  connections,
  onClose,
  onSaved,
}: {
  readonly editor: Editor;
  readonly environments: readonly EnvironmentView[];
  readonly connections: readonly ConnectionView[];
  readonly onClose: () => void;
  readonly onSaved: (message: string) => void;
}): ReactNode {
  const mutations = useConnectionsMutations();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const editingId = editor.kind === 'none' ? undefined : editor.id;
  const existingEnvironment =
    editor.kind === 'environment' && editingId !== undefined
      ? environments.find((item) => item.id === editingId)
      : undefined;
  const existingConnection =
    editor.kind === 'connection' && editingId !== undefined
      ? connections.find((item) => item.id === editingId)
      : undefined;

  // Environment fields.
  const [name, setName] = useState(existingEnvironment?.name ?? existingConnection?.name ?? '');
  const [host, setHost] = useState(
    existingEnvironment?.endpoint.host ??
      (existingConnection?.environment.kind === 'standalone'
        ? existingConnection.environment.endpoint.host
        : 'localhost'),
  );
  const [port, setPort] = useState(
    existingEnvironment?.endpoint.port ??
      (existingConnection?.environment.kind === 'standalone'
        ? existingConnection.environment.endpoint.port
        : 4222),
  );
  const [httpPort, setHttpPort] = useState(existingEnvironment?.endpoint.httpPort ?? 8080);
  const [subjectPrefix, setSubjectPrefix] = useState(
    existingEnvironment?.endpoint.subjectPrefix ?? '',
  );
  const [description, setDescription] = useState(
    existingEnvironment?.description ?? existingConnection?.description ?? '',
  );
  const [labels, setLabels] = useState(
    (existingEnvironment?.tagNames ?? existingConnection?.tagNames ?? []).join(', '),
  );

  // Connection fields.
  const [username, setUsername] = useState(existingConnection?.username ?? '');
  const [password, setPassword] = useState('');
  const existingTarget = existingConnection?.environment;
  const [environmentId, setEnvironmentId] = useState(
    existingTarget?.kind === 'environment' ? existingTarget.id : '',
  );

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const tagNames = labels
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    try {
      if (editor.kind === 'environment') {
        await mutations.saveEnvironment.mutateAsync([
          {
            name: name.trim(),
            host: host.trim(),
            port,
            httpPort,
            subjectPrefix: subjectPrefix.trim(),
            description,
            folderId: null,
            tagNames,
          },
          editor.id,
        ]);
        onSaved(`Saved ${name.trim()}.`);
        return;
      }

      await mutations.saveConnection.mutateAsync([
        {
          name: name.trim(),
          username: username.trim(),
          // Omitting the password leaves a stored one alone; an empty string
          // clears it. That distinction is the whole reason this field is
          // optional rather than defaulted.
          ...(password.length === 0 ? {} : { password }),
          description,
          folderId: null,
          tagNames,
          environmentId: environmentId.length > 0 ? environmentId : null,
          host: environmentId.length > 0 ? null : host.trim(),
          port: environmentId.length > 0 ? null : port,
        },
        editingId,
      ]);
      onSaved(`Saved ${name.trim()}.`);
    } catch (cause) {
      setError(cause instanceof ApiFailure ? cause.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="detail-panel" aria-label="Editor">
      <h2 className="section__title">
        {editingId === undefined ? 'Add' : 'Edit'} {editor.kind}
      </h2>
      {error !== null && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={(event) => void submit(event)}>
        <div className="editor-grid">
          <label className="field">
            <span className="field__label">Name</span>
            <input
              className="field__input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>

          {editor.kind === 'connection' && (
            <>
              <label className="field">
                <span className="field__label">Username</span>
                <input
                  className="field__input"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">
                  Password {editingId !== undefined && '(leave blank to keep)'}
                </span>
                <input
                  className="field__input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <label className="field">
                <span className="field__label">Environment</span>
                <select
                  className="field__input"
                  value={environmentId}
                  onChange={(event) => setEnvironmentId(event.target.value)}
                >
                  <option value="">— its own server —</option>
                  {environments.map((environment) => (
                    <option key={environment.id} value={environment.id}>
                      {environment.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {(editor.kind === 'environment' || environmentId === '') && (
            <>
              <label className="field">
                <span className="field__label">Server</span>
                <input
                  className="field__input"
                  value={host}
                  onChange={(event) => setHost(event.target.value)}
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
            </>
          )}

          {editor.kind === 'environment' && (
            <>
              <label className="field">
                <span className="field__label">HTTP port</span>
                <input
                  className="field__input"
                  type="number"
                  min={1}
                  max={65535}
                  value={httpPort}
                  onChange={(event) => setHttpPort(Number(event.target.value))}
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
            </>
          )}

          <label className="field">
            <span className="field__label">Labels</span>
            <input
              className="field__input"
              value={labels}
              onChange={(event) => setLabels(event.target.value)}
              placeholder="dev, local"
            />
          </label>

          <label className="field field--wide">
            <span className="field__label">Description</span>
            <input
              className="field__input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </div>

        <div className="editor-actions">
          <button className="button button--primary" type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Save'}
          </button>
          <button className="button button--ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </aside>
  );
}
