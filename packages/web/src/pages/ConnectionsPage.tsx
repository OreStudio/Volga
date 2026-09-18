import { useMemo, useState, type ReactNode } from 'react';
import { useConnectionsCatalog, useConnectionsMutations } from '../api/connections-queries.js';
import { ApiFailure } from '../api/transport.js';
import { Button, Dialog, Field, Input, Notice, PageHeader, Select, Tag } from '../ui/Primitives.js';
import type { ConnectionView, EnvironmentView } from '@volga/contracts';

/**
 * The connections manager.
 *
 * The screen that makes the rest possible: before anything is saved there is
 * nowhere to connect. It runs before sign-in for that reason.
 *
 * Environments and connections sit in one screen because a connection usually
 * points at an environment, and making someone create one and then come back for
 * the other is friction for no benefit. Editing opens a dialog rather than
 * expanding a panel, so the tables keep their shape while you work.
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
  const [removing, setRemoving] = useState<{ kind: 'environment' | 'connection'; id: string; name: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

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

  async function remove(): Promise<void> {
    if (removing === null) {
      return;
    }
    setFailure(null);
    try {
      if (removing.kind === 'environment') {
        await mutations.deleteEnvironment.mutateAsync(removing.id);
      } else {
        await mutations.deleteConnection.mutateAsync(removing.id);
      }
      setNotice(`Removed ${removing.name}.`);
      setRemoving(null);
    } catch (cause) {
      setFailure(cause instanceof ApiFailure ? cause.message : 'That did not work.');
    }
  }

  return (
    <section className="mx-auto max-w-6xl">
      <PageHeader
        title="Connections"
        description="The environments you can connect to, and the credentials saved for them."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!unlocked}
              onClick={() => setEditor({ kind: 'connection' })}
            >
              Add connection
            </Button>
            <Button
              variant="primary"
              disabled={!unlocked}
              onClick={() => setEditor({ kind: 'environment' })}
            >
              Add environment
            </Button>
          </>
        }
      />

      {!unlocked && catalog !== undefined && (
        <Notice>
          The store is locked, so it cannot be changed. Unlock it from the bar above.
        </Notice>
      )}
      {notice !== null && <Notice tone="success">{notice}</Notice>}
      {failure !== null && <Notice tone="error">{failure}</Notice>}
      {error !== undefined && <Notice tone="error">{error.message}</Notice>}

      {catalog !== undefined && catalog.tags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Field label="Filter by label" className="w-48">
            <Select value={label} onChange={(event) => setLabel(event.target.value)}>
              <option value="">All</option>
              {catalog.tags.map((tag) => (
                <option key={tag.id} value={tag.name}>
                  {tag.name}
                </option>
              ))}
            </Select>
          </Field>
          <p className="ml-auto self-end pb-2 text-xs text-ink-faint">
            {visibleEnvironments.length} environments, {visibleConnections.length} connections
          </p>
        </div>
      )}

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
        Environments
      </h2>
      <div className="card mb-8 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Server</th>
              <th className="px-4 py-2 font-medium">Namespace</th>
              <th className="px-4 py-2 font-medium">Labels</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {visibleEnvironments.map((environment) => (
              <tr key={environment.id} className="border-b border-line-subtle last:border-0 hover:bg-surface-hover">
                <td className="px-4 py-2">{environment.name}</td>
                <td className="px-4 py-2 font-mono text-xs text-ink-muted">
                  {environment.endpoint.host}:{environment.endpoint.port}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-ink-muted">
                  {environment.endpoint.subjectPrefix || '—'}
                </td>
                <td className="px-4 py-2">
                  <span className="flex flex-wrap gap-1">
                    {environment.tagNames.map((name) => (
                      <Tag key={name}>{name}</Tag>
                    ))}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!unlocked}
                      onClick={() => setEditor({ kind: 'environment', id: environment.id })}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={!unlocked}
                      onClick={() =>
                        setRemoving({ kind: 'environment', id: environment.id, name: environment.name })
                      }
                    >
                      Remove
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && visibleEnvironments.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-ink-faint">
            No environments yet. Add one to get started.
          </p>
        )}
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
        Connections
      </h2>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Username</th>
              <th className="px-4 py-2 font-medium">Where</th>
              <th className="px-4 py-2 font-medium">Password</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {visibleConnections.map((connection) => (
              <tr key={connection.id} className="border-b border-line-subtle last:border-0 hover:bg-surface-hover">
                <td className="px-4 py-2">{connection.name}</td>
                <td className="px-4 py-2 font-mono text-xs text-ink-muted">{connection.username}</td>
                <td className="px-4 py-2 text-ink-muted">
                  {connection.environment.kind === 'environment'
                    ? connection.environment.name
                    : `${connection.environment.endpoint.host}:${connection.environment.endpoint.port}`}
                </td>
                <td className="px-4 py-2">
                  {connection.hasSavedPassword ? <Tag tone="accent">saved</Tag> : <Tag tone="muted">asked</Tag>}
                </td>
                <td className="px-4 py-2">
                  <span className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!unlocked}
                      onClick={() => setEditor({ kind: 'connection', id: connection.id })}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={!unlocked}
                      onClick={() =>
                        setRemoving({ kind: 'connection', id: connection.id, name: connection.name })
                      }
                    >
                      Remove
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && visibleConnections.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-ink-faint">
            No connections yet. Add one to sign in faster.
          </p>
        )}
      </div>

      {editor.kind !== 'none' && (
        <EditorDialog
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

      {removing !== null && (
        <Dialog
          title={`Remove ${removing.name}?`}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Button onClick={() => setRemoving(null)}>Keep it</Button>
              <Button variant="danger" pending={mutations.deleteConnection.isPending || mutations.deleteEnvironment.isPending} onClick={() => void remove()}>
                Remove
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink-muted">
            This only changes your saved connections here. Nothing on the server is touched.
          </p>
        </Dialog>
      )}
    </section>
  );
}

function EditorDialog({
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

  const editingId = editor.kind === 'none' ? undefined : editor.id;
  const existingEnvironment =
    editor.kind === 'environment' && editingId !== undefined
      ? environments.find((item) => item.id === editingId)
      : undefined;
  const existingConnection =
    editor.kind === 'connection' && editingId !== undefined
      ? connections.find((item) => item.id === editingId)
      : undefined;
  const existingTarget = existingConnection?.environment;

  const [name, setName] = useState(existingEnvironment?.name ?? existingConnection?.name ?? '');
  const [host, setHost] = useState(
    existingEnvironment?.endpoint.host ??
      (existingTarget?.kind === 'standalone' ? existingTarget.endpoint.host : 'localhost'),
  );
  const [port, setPort] = useState(
    existingEnvironment?.endpoint.port ??
      (existingTarget?.kind === 'standalone' ? existingTarget.endpoint.port : 4222),
  );
  const [httpPort, setHttpPort] = useState(existingEnvironment?.endpoint.httpPort ?? 8080);
  const [subjectPrefix, setSubjectPrefix] = useState(existingEnvironment?.endpoint.subjectPrefix ?? '');
  const [description, setDescription] = useState(
    existingEnvironment?.description ?? existingConnection?.description ?? '',
  );
  const [labels, setLabels] = useState(
    (existingEnvironment?.tagNames ?? existingConnection?.tagNames ?? []).join(', '),
  );
  const [username, setUsername] = useState(existingConnection?.username ?? '');
  const [password, setPassword] = useState('');
  const [environmentId, setEnvironmentId] = useState(
    existingTarget?.kind === 'environment' ? existingTarget.id : '',
  );

  async function save(): Promise<void> {
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
          editingId,
        ]);
      } else {
        await mutations.saveConnection.mutateAsync([
          {
            name: name.trim(),
            username: username.trim(),
            // Omitting the password leaves a stored one alone; an empty string
            // clears it. That distinction is why the field is optional.
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
      }
      onSaved(`Saved ${name.trim()}.`);
    } catch (cause) {
      setError(cause instanceof ApiFailure ? cause.message : 'That did not work.');
    }
  }

  const pending =
    mutations.saveEnvironment.isPending || mutations.saveConnection.isPending;

  return (
    <Dialog
      title={`${editingId === undefined ? 'Add' : 'Edit'} ${editor.kind}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" pending={pending} pendingLabel="Saving..." onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      {error !== null && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <Input value={name} autoFocus onChange={(event) => setName(event.target.value)} />
        </Field>

        {editor.kind === 'connection' && (
          <>
            <Field label="Username">
              <Input value={username} onChange={(event) => setUsername(event.target.value)} />
            </Field>
            <Field
              label="Password"
              {...(editingId === undefined ? {} : { hint: 'Leave blank to keep the saved one.' })}
            >
              <Input
                type="password"
                value={password}
                autoComplete="new-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Field label="Environment" className="sm:col-span-2">
              <Select value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)}>
                <option value="">Its own server</option>
                {environments.map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {environment.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}

        {(editor.kind === 'environment' || environmentId === '') && (
          <>
            <Field label="Server">
              <Input value={host} onChange={(event) => setHost(event.target.value)} />
            </Field>
            <Field label="Port">
              <Input
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(event) => setPort(Number(event.target.value))}
              />
            </Field>
          </>
        )}

        {editor.kind === 'environment' && (
          <>
            <Field label="HTTP port" hint="The companion server, for uploads.">
              <Input
                type="number"
                min={1}
                max={65535}
                value={httpPort}
                onChange={(event) => setHttpPort(Number(event.target.value))}
              />
            </Field>
            <Field label="Namespace" hint="Isolates this environment on a shared broker.">
              <Input
                value={subjectPrefix}
                placeholder="ores.dev.local1"
                onChange={(event) => setSubjectPrefix(event.target.value)}
              />
            </Field>
          </>
        )}

        <Field label="Labels" hint="Comma separated, for filtering.">
          <Input
            value={labels}
            placeholder="dev, local"
            onChange={(event) => setLabels(event.target.value)}
          />
        </Field>
        <Field label="Description">
          <Input value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
