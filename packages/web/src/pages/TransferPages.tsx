import { useState, type ChangeEvent, type ReactNode } from 'react';
import { useConnectionsCatalog } from '../api/connections-queries.js';
import { connectionsApi } from '../api/connections.js';
import { ApiFailure } from '../api/transport.js';
import { Button, Detail, Field, Input, Notice, PageHeader, Select, Tag } from '../ui/Primitives.js';
import type { ImportReport } from '@volga/contracts';

/**
 * Moving connections between machines.
 *
 * The browser does the file handling in both directions. Export hands bytes to
 * the browser, which saves them where its own dialog points; import reads a file
 * the person picked and posts the bytes. The server never chooses a path, so
 * there is nothing here that can write somewhere unintended.
 */

export function ExportPage(): ReactNode {
  const { catalog } = useConnectionsCatalog();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run(action: () => Promise<void>, label: string, message: string): Promise<void> {
    setBusy(label);
    setError(null);
    setDone(null);
    try {
      await action();
      setDone(message);
    } catch (cause) {
      setError(cause instanceof ApiFailure ? cause.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mx-auto max-w-4xl">
      <PageHeader
        title="Export connections"
        description="Take your connections to another machine, or keep a copy."
      />

      {error !== null && <Notice tone="error">{error}</Notice>}
      {done !== null && <Notice tone="success">{done}</Notice>}

      {catalog !== undefined && (
        <div className="card mb-6 px-4 py-3">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Detail label="Database" value={catalog.store.databasePath} mono />
            <Detail label="Environments" value={String(catalog.environments.length)} />
            <Detail label="Connections" value={String(catalog.connections.length)} />
          </dl>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <article className="card flex flex-col p-5">
          <h2 className="text-sm font-semibold">Copy the database</h2>
          <p className="mt-2 flex-1 text-sm text-ink-muted">
            The exact store, as one file. Your browser asks where to save it, so it lands
            wherever you choose. This is the one to use to set up another machine.
          </p>
          <p className="mt-3 text-xs text-ink-faint">
            Saved passwords travel with it, protected by your master password.
          </p>
          <Button
            variant="primary"
            className="mt-4"
            pending={busy === 'database'}
            pendingLabel="Preparing..."
            onClick={() =>
              void run(() => connectionsApi.downloadDatabase(), 'database', 'Saved. Keep it somewhere safe.')
            }
          >
            Save database file
          </Button>
        </article>

        <article className="card flex flex-col p-5">
          <h2 className="text-sm font-semibold">Copy as a readable file</h2>
          <p className="mt-2 flex-1 text-sm text-ink-muted">
            A JSON snapshot of the same contents, for reviewing changes, keeping in version
            control, or merging into a store that already has data.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              pending={busy === 'snapshot'}
              pendingLabel="Preparing..."
              onClick={() =>
                void run(() => connectionsApi.downloadSnapshot(true), 'snapshot', 'Saved.')
              }
            >
              With passwords
            </Button>
            <Button
              pending={busy === 'snapshot-plain'}
              pendingLabel="Preparing..."
              onClick={() =>
                void run(
                  () => connectionsApi.downloadSnapshot(false),
                  'snapshot-plain',
                  'Saved. This copy has no saved passwords in it.',
                )
              }
            >
              Without passwords
            </Button>
          </div>
          <p className="mt-3 text-xs text-ink-faint">
            Without passwords the file is safe to share: environments and usernames only.
          </p>
        </article>
      </div>
    </section>
  );
}

export function ImportPage(): ReactNode {
  const { catalog, refresh } = useConnectionsCatalog();
  const [file, setFile] = useState<File | null>(null);
  const [sourcePassword, setSourcePassword] = useState('');
  const [includeCredentials, setIncludeCredentials] = useState(true);
  const [targetPassword, setTargetPassword] = useState('');
  const [conflict, setConflict] = useState<'skip' | 'rename' | 'replace'>('skip');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlocked = catalog?.store.unlocked ?? false;
  const uninitialised = catalog?.store.uninitialised ?? false;

  async function run(dryRun: boolean): Promise<void> {
    if (file === null) {
      setError('Choose a file first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await connectionsApi.importDatabase({
        file,
        sourcePassword,
        includeCredentials,
        conflict,
        targetPassword,
        dryRun,
      });
      setReport(result);
      if (!dryRun) {
        await refresh();
      }
    } catch (cause) {
      setError(cause instanceof ApiFailure ? cause.message : 'That did not work.');
      setReport(null);
    } finally {
      setBusy(false);
    }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>): void {
    setFile(event.target.files?.[0] ?? null);
    setReport(null);
    setError(null);
  }

  return (
    <section className="mx-auto max-w-3xl">
      <PageHeader
        title="Import connections"
        description="Bring connections in from another Volga database. Nothing is written until you confirm."
      />

      {error !== null && <Notice tone="error">{error}</Notice>}

      <div className="card p-5">
        <Field
          label="File to import"
          hint="Your browser reads it and sends the contents. Nothing is written to the file."
        >
          <Input type="file" accept=".db,application/vnd.sqlite3" onChange={chooseFile} />
        </Field>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Master password of that file"
            {...(includeCredentials ? {} : { hint: 'Not needed when passwords are left behind.' })}
          >
            <Input
              type="password"
              value={sourcePassword}
              disabled={!includeCredentials}
              autoComplete="off"
              onChange={(event) => setSourcePassword(event.target.value)}
            />
          </Field>

          <Field
            label="Master password for this store"
            {...(unlocked
              ? { hint: 'Already unlocked.' }
              : uninitialised
                ? { hint: 'This store has no master password yet. Whatever you type becomes it.' }
                : {})}
          >
            <Input
              type="password"
              value={targetPassword}
              disabled={unlocked}
              autoComplete="off"
              onChange={(event) => setTargetPassword(event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="If a name already exists">
            <Select
              value={conflict}
              onChange={(event) => setConflict(event.target.value as typeof conflict)}
            >
              <option value="skip">Keep what I have</option>
              <option value="rename">Bring both, renaming the new one</option>
              <option value="replace">Replace mine with the imported one</option>
            </Select>
          </Field>

          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-accent)]"
              checked={includeCredentials}
              onChange={(event) => setIncludeCredentials(event.target.checked)}
            />
            <span>Bring the saved passwords across</span>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button
            disabled={busy || file === null}
            pending={busy}
            pendingLabel="Checking..."
            onClick={() => void run(true)}
          >
            Check first
          </Button>
          <Button
            variant="primary"
            disabled={busy || file === null || (!unlocked && targetPassword.length === 0)}
            pending={busy}
            pendingLabel="Importing..."
            onClick={() => void run(false)}
          >
            Import
          </Button>
        </div>
      </div>

      {report !== null && (
        <div className="card mt-5 p-5">
          <h2 className="mb-3 text-sm font-semibold">
            {report.dryRun ? 'What would happen' : 'What happened'}
            {report.dryRun && <Tag tone="muted">nothing written</Tag>}
          </h2>
          <dl className="grid gap-4 sm:grid-cols-4">
            <Detail label="Environments" value={String(report.environments)} />
            <Detail label="Connections" value={String(report.connections)} />
            <Detail label="Passwords kept" value={String(report.passwordsImported)} />
            <Detail label="Passwords left behind" value={String(report.passwordsDropped)} />
          </dl>

          {report.renamed.length > 0 && (
            <p className="mt-3 text-xs text-ink-muted">
              Renamed to avoid a clash:{' '}
              {report.renamed.map((item) => `${item.from} → ${item.to}`).join(', ')}
            </p>
          )}
          {report.skipped.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              Left alone because the name exists: {report.skipped.join(', ')}
            </p>
          )}
          {report.replaced.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              Replaced: {report.replaced.join(', ')}
            </p>
          )}
          {report.passwordsDropped > 0 && !report.dryRun && (
            <p className="mt-3 text-xs text-warn">
              {report.passwordsDropped} saved password(s) were not brought across, so those
              connections will ask for a password when used.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
