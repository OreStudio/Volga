import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from '../i18n/Provider.js';
import { MaskIcon } from '../ui/icons/MaskIcon.js';
import { Notice, cx } from '../ui/Primitives.js';
import type { ColumnMeta, EntityMeta } from './contract.js';

/**
 * The version history of one record.
 *
 * A timeline on the left and a comparison on the right, which is the shape the
 * Qt client settled on and the right one: the timeline answers "what happened",
 * and the comparison answers "what exactly changed".
 *
 * Provenance fields are excluded from the comparison and shown on the timeline
 * entry instead, because the version and the actor differ by definition and
 * diffing them is noise that hides the real change.
 */
export interface HistoryVersion {
  /** The version number, which is the key. */
  readonly version: number;
  readonly modifiedBy: string;
  readonly performedBy: string;
  readonly recordedAt: string;
  readonly changeReasonCode: string;
  readonly changeCommentary: string;
  /** The record's own fields, by wire name, for the diff. */
  readonly values: Readonly<Record<string, unknown>>;
}

export interface EntityHistoryPageProps {
  readonly meta: EntityMeta;
  readonly title: string;
  readonly versions: readonly HistoryVersion[];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly onRetry: () => void;
  readonly onOpenVersion: (version: number) => void;
}

export function EntityHistoryPage({
  meta,
  title,
  versions,
  loading,
  failed,
  onRetry,
  onOpenVersion,
}: EntityHistoryPageProps): ReactNode {
  const { t } = useTranslation();
  // Newest first, so the default selection is the two most recent versions.
  const [selected, setSelected] = useState(0);
  const [showAll, setShowAll] = useState(false);

  /*
   * One row per version.
   *
   * A version is the identity of a history entry, so two entries with the same
   * version are the same entry appearing twice. The service can return that —
   * duplicate rows for one version exist in this data — and rendering them twice
   * shows a person a change that did not happen. Kept rather than hidden: if two
   * differ, the first is the one shown, and the duplication itself is a data
   * problem to fix at the source.
   */
  const entries = useMemo(() => {
    const seen = new Set<number>();
    return versions.filter((version) => {
      if (seen.has(version.version)) return false;
      seen.add(version.version);
      return true;
    });
  }, [versions]);

  const older = entries[selected + 1];
  const newer = entries[selected];

  const rows = useMemo(
    () => (older === undefined || newer === undefined ? [] : diff(older, newer, meta.columns)),
    [older, newer, meta.columns],
  );
  const shown = showAll ? rows : rows.filter((row) => row.changed);

  if (failed) {
    return (
      <div className="mx-auto max-w-[680px] px-5 py-16 text-center">
        <Notice tone="error">
          {t('feedback.unreachable')}{' '}
          <button type="button" onClick={onRetry} className="underline hover:text-ink">
            {t('feedback.retry')}
          </button>
        </Notice>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-7">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('history.description')}</p>
      </header>

      {loading ? (
        <p className="text-sm text-ink-faint">{t('entity.loading')}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('history.empty')}</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(220px,300px)_1fr]">
          <section>
            <h2 className="mb-2 text-sm font-medium text-ink-muted">{t('history.timeline')}</h2>
            <ol className="space-y-1.5">
              {entries.map((version, index) => (
                <li key={version.version}>
                  <button
                    type="button"
                    onClick={() => setSelected(index)}
                    aria-current={index === selected}
                    className={cx(
                      'w-full rounded-[var(--radius-card)] border px-3 py-2 text-left transition-colors',
                      index === selected
                        ? 'border-accent bg-surface-overlay'
                        : 'border-line bg-bg-secondary hover:border-line-strong',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-ink">
                        v{version.version}
                      </span>
                      {index === 0 && (
                        <span className="rounded-full border border-line px-1.5 py-px text-[10px] uppercase tracking-wide text-ink-faint">
                          {t('history.current')}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block font-mono text-xs tabular-nums text-ink-muted">
                      {version.recordedAt}
                    </span>
                    <span className="mt-1 block truncate text-xs text-ink-muted">
                      {version.modifiedBy.length > 0 ? version.modifiedBy : t('account.nobody')}
                    </span>
                    {version.changeReasonCode.length > 0 && (
                      <span className="mt-1 inline-flex rounded-full border border-line px-1.5 py-px text-[10px] text-ink-faint">
                        {version.changeReasonCode}
                      </span>
                    )}
                    {version.changeCommentary.length > 0 && (
                      <span className="mt-1 block text-xs italic text-ink-faint">
                        “{version.changeCommentary}”
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <section className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-medium text-ink-muted">
                {older === undefined
                  ? t('history.initial')
                  : t('history.comparing', { from: older.version, to: newer?.version ?? 0 })}
              </h2>
              <div className="ml-auto flex items-center gap-1 rounded-md border border-line p-0.5">
                {([false, true] as const).map((all) => (
                  <button
                    key={String(all)}
                    type="button"
                    onClick={() => setShowAll(all)}
                    className={cx(
                      'rounded px-2 py-1 text-xs transition-colors',
                      showAll === all ? 'bg-surface-overlay text-ink' : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    {all ? t('history.allFields') : t('history.onlyChanges')}
                  </button>
                ))}
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="rounded-[var(--radius-card)] border border-line bg-bg-secondary px-4 py-6 text-center text-sm text-ink-muted">
                {t('history.noChanges')}
              </p>
            ) : (
              <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-bg-secondary">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-ink-muted">
                      <th scope="col" className="px-3 py-2 text-left font-medium">{t('history.field')}</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">{t('history.before')}</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">{t('history.after')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row) => (
                      <tr key={row.name} className="border-b border-line/60 last:border-0">
                        <td className="px-3 py-2 text-ink-muted">{t(row.headerKey)}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          <Value present={row.changed}>{row.before}</Value>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          <Value present={row.changed}>{row.after}</Value>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {newer !== undefined && (
              <button
                type="button"
                onClick={() => onOpenVersion(newer.version)}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-bright"
              >
                <MaskIcon name="edit" className="size-3.5" />
                {t('history.openVersion')}
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Value({ present, children }: { readonly present: boolean; readonly children: string }): ReactNode {
  if (children.length === 0) {
    // A blank is said rather than shown, so it is not mistaken for a failure.
    return <span className="text-ink-faint">—</span>;
  }
  // A changed value is marked, so a scan finds it without reading every row.
  return present ? <span className="text-ink">{children}</span> : <span className="text-ink-muted">{children}</span>;
}

interface DiffRow {
  readonly name: string;
  readonly headerKey: string;
  readonly before: string;
  readonly after: string;
  readonly changed: boolean;
}

/** Compares two versions across the entity's own columns. */
function diff(
  older: HistoryVersion,
  newer: HistoryVersion,
  columns: readonly ColumnMeta[],
): readonly DiffRow[] {
  return columns
    // The identity and the version are not changes worth listing: one cannot
    // change and the other changes by definition.
    .filter((column) => column.name !== 'version' && column.name !== 'modified_by' && column.name !== 'recorded_at')
    .map((column) => {
      const before = text(older.values[column.name]);
      const after = text(newer.values[column.name]);
      return {
        name: column.name,
        headerKey: column.headerKey,
        before,
        after,
        changed: before !== after,
      };
    });
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}
