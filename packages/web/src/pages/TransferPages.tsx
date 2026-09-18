import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useConnectionsCatalog } from '../api/connections-queries.js';
import { connectionsApi } from '../api/connections.js';
import { ApiFailure } from '../api/transport.js';
import { useSession } from '../session/SessionProvider.js';
import type { ImportReport } from '@volga/contracts';

/**
 * Moving connections between machines.
 *
 * The browser owns both directions. Export hands the bytes to the browser,
 * which saves them wherever the person's dialog points. Import reads a file
 * they picked and posts the bytes. Neither direction lets the server choose a
 * path, so there is nothing here that can write somewhere unintended.
 */

export function ExportPage(): ReactNode {
  const { catalog } = useConnectionsCatalog();
  const { state } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const signedIn = state.status === 'authenticated';

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
    <section>
      <header className="page__header">
        <div>
          <h1 className="page__title">Export connections</h1>
          <p className="page__subtitle">
            Take your connections to another machine, or keep a copy.
          </p>
        </div>
      </header>

      {catalog !== undefined && (
        <div className="store-banner">
          <div>
            <span className="detail-panel__term">Database</span>
            <div className="mono">{catalog.store.databasePath}</div>
            <p className="signin__hint">
              {catalog.environments.length} environments, {catalog.connections.length} connections.
            </p>
          </div>
        </div>
      )}

      {error !== null && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {done !== null && (
        <div className="notice" role="status">
          {done}
        </div>
      )}

      <div className="cards">
        <article className="card">
          <h2 className="card__title">Copy the database</h2>
          <p className="card__body">
            The exact store, as a single file. Your browser asks where to save it, so it lands
            wherever you choose. This is the one to use to set up another machine.
          </p>
          <p className="card__note">
            The saved passwords travel with it, protected by the master password you set here.
          </p>
          <button
            className="button button--primary"
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void run(
                () => connectionsApi.downloadDatabase(),
                'database',
                'Saved. Keep that file somewhere safe.',
              )
            }
          >
            {busy === 'database' ? 'Preparing...' : 'Save database file'}
          </button>
        </article>

        <article className="card">
          <h2 className="card__title">Copy as a readable file</h2>
          <p className="card__body">
            A JSON snapshot of the same contents. Useful for reviewing changes, keeping it in
            version control, or merging into a store that already has data.
          </p>
          <div className="card__actions">
            <button
              className="button button--ghost"
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  () => connectionsApi.downloadSnapshot(true),
                  'snapshot',
                  'Saved.',
                )
              }
            >
              {busy === 'snapshot' ? 'Preparing...' : 'Save with passwords'}
            </button>
            <button
              className="button button--ghost"
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  () => connectionsApi.downloadSnapshot(false),
                  'snapshot-plain',
                  'Saved. This copy has no saved passwords in it.',
                )
              }
            >
              {busy === 'snapshot-plain' ? 'Preparing...' : 'Save without passwords'}
            </button>
          </div>
          <p className="card__note">
            Without passwords, the file is safe to share: it carries the environments and the
            usernames, and nothing anyone can sign in with.
          </p>
        </article>
      </div>

      {!signedIn && (
        <p className="signin__hint">
          You do not need to be signed in to export. The store is yours.
        </p>
      )}
    </section>
  );
}

export function ImportPage(): ReactNode {
  const { catalog, refresh } = useConnectionsCatalog();
  const inputRef = useRef<HTMLInputElement>(null);
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
    <section>
      <header className="page__header">
        <div>
          <h1 className="page__title">Import connections</h1>
          <p className="page__subtitle">
            Bring connections in from another Volga database. Nothing is written until you
            confirm.
          </p>
        </div>
      </header>

      {error !== null && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      <div className="detail-panel">
        <div className="editor-grid">
          <label className="field field--wide">
            <span className="field__label">File to import</span>
            <input
              ref={inputRef}
              className="field__input"
              type="file"
              accept=".db,application/vnd.sqlite3,application/octet-stream"
              onChange={chooseFile}
            />
            <p className="signin__hint">
              The file is read by your browser and sent to the server to be read. Nothing is
              written to it.
            </p>
          </label>

          <label className="field">
            <span className="field__label">
              Master password of the imported file
              {!includeCredentials && ' (not needed)'}
            </span>
            <input
              className="field__input"
              type="password"
              value={sourcePassword}
              disabled={!includeCredentials}
              onChange={(event) => setSourcePassword(event.target.value)}
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span className="field__label">
              Master password for this store
              {unlocked && ' (already unlocked)'}
            </span>
            <input
              className="field__input"
              type="password"
              value={targetPassword}
              disabled={unlocked}
              onChange={(event) => setTargetPassword(event.target.value)}
              autoComplete="off"
            />
            {uninitialised && (
              <p className="signin__hint">
                This store has no master password yet. Whatever you type here becomes it.
              </p>
            )}
          </label>

          <label className="field">
            <span className="field__label">If a name already exists</span>
            <select
              className="field__input"
              value={conflict}
              onChange={(event) => setConflict(event.target.value as typeof conflict)}
            >
              <option value="skip">Keep what I have</option>
              <option value="rename">Bring both, renaming the new one</option>
              <option value="replace">Replace mine with the imported one</option>
            </select>
          </label>

          <label className="checkbox field--wide">
            <input
              type="checkbox"
              checked={includeCredentials}
              onChange={(event) => setIncludeCredentials(event.target.checked)}
            />
            <span>Bring the saved passwords across</span>
          </label>
        </div>

        <div className="editor-actions">
          <button
            className="button button--ghost"
            type="button"
            disabled={busy || file === null}
            onClick={() => void run(true)}
          >
            {busy ? 'Checking...' : 'Check first'}
          </button>
          <button
            className="button button--primary"
            type="button"
            disabled={busy || file === null || (!unlocked && targetPassword.length === 0)}
            onClick={() => void run(false)}
          >
            {busy ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>

      {report !== null && <ReportCard report={report} />}
    </section>
  );
}

function ReportCard({ report }: { readonly report: ImportReport }): ReactNode {
  return (
    <aside className="detail-panel" aria-label="Import report">
      <h2 className="section__title">
        {report.dryRun ? 'What would happen' : 'What happened'}
      </h2>
      <dl className="detail-panel__grid">
        <Field label="Environments" value={String(report.environments)} />
        <Field label="Connections" value={String(report.connections)} />
        <Field label="Passwords brought across" value={String(report.passwordsImported)} />
        <Field label="Passwords left behind" value={String(report.passwordsDropped)} />
      </dl>
      {report.renamed.length > 0 && (
        <p className="signin__hint">
          Renamed to avoid a clash: {report.renamed.map((item) => `${item.from} → ${item.to}`).join(', ')}
        </p>
      )}
      {report.skipped.length > 0 && (
        <p className="signin__hint">Left alone because the name exists: {report.skipped.join(', ')}</p>
      )}
      {report.replaced.length > 0 && (
        <p className="signin__hint">Replaced: {report.replaced.join(', ')}</p>
      )}
      {report.passwordsDropped > 0 && !report.dryRun && (
        <p className="signin__hint">
          {report.passwordsDropped} saved password(s) were not brought across, so those
          connections will ask for a password when used.
        </p>
      )}
    </aside>
  );
}

function Field({ label, value }: { readonly label: string; readonly value: string }): ReactNode {
  return (
    <div>
      <dt className="detail-panel__term">{label}</dt>
      <dd className="detail-panel__value" style={{ margin: 0 }}>
        {value}
      </dd>
    </div>
  );
}
