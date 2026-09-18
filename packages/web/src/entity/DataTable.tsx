import { useState, type ReactNode } from 'react';
import { MaskIcon } from '../ui/icons/MaskIcon.js';
import { useTranslation } from '../i18n/Provider.js';
import { cx } from '../ui/Primitives.js';
import type { ColumnMeta, ColumnStyle } from './contract.js';

/**
 * A table driven by a column declaration.
 *
 * The declaration is the single source: the header, the alignment, the font and
 * whether a column is shown all come from it. That is what stops a column being
 * styled differently from how it was declared, which is the drift that costs when
 * there are a hundred entities.
 *
 * Cells are rendered by style rather than by a per-entity component, so a new
 * entity adds no rendering code.
 */
export interface DataTableProps<Row> {
  readonly columns: readonly ColumnMeta[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly onOpen?: (row: Row) => void;
  readonly loading?: boolean;
  readonly emptyMessage: string;
}

export function DataTable<Row extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  onOpen,
  loading = false,
  emptyMessage,
}: DataTableProps<Row>): ReactNode {
  const { t } = useTranslation();
  // Audit columns are hidden by default and offered through the header menu.
  const [shown, setShown] = useState<ReadonlySet<string>>(
    () => new Set(columns.filter((c) => !c.hidden || c.name === columns[0]?.name).map((c) => c.name)),
  );
  const [menuOpen, setMenuOpen] = useState(false);

  const visible = columns.filter((column) => shown.has(column.name));

  function toggle(name: string): void {
    setShown((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (rows.length === 0 && !loading) {
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-bg-secondary px-4 py-10 text-center text-sm text-ink-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-bg-secondary">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              {visible.map((column) => (
                <th
                  key={column.name}
                  scope="col"
                  style={column.width === undefined ? undefined : { width: column.width }}
                  className={cx(
                    'px-3 py-2 text-xs font-medium text-ink-muted',
                    alignment(column.style),
                  )}
                >
                  {t(column.headerKey)}
                </th>
              ))}
              <th scope="col" className="w-8 px-2 py-2">
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-label={t('entity.filter')}
                  aria-expanded={menuOpen}
                  className="rounded p-0.5 text-ink-faint hover:text-ink"
                >
                  <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
                    <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                  </svg>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onOpen === undefined ? undefined : () => onOpen(row)}
                className={cx(
                  'border-b border-line/60 last:border-0',
                  onOpen !== undefined && 'cursor-pointer hover:bg-surface-overlay',
                )}
              >
                {visible.map((column) => (
                  <td key={column.name} className={cx('px-3 py-2', alignment(column.style))}>
                    <Cell column={column} value={row[column.name]} />
                  </td>
                ))}
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {menuOpen && (
        <div className="border-t border-line px-3 py-2">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-faint">
            {t('entity.provenance')}
          </p>
          <div className="flex flex-wrap gap-3">
            {columns.map((column) => (
              <label key={column.name} className="flex items-center gap-1.5 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={shown.has(column.name)}
                  onChange={() => toggle(column.name)}
                  className="accent-[var(--color-accent)]"
                />
                {t(column.headerKey)}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Horizontal alignment and font, from the declared style. */
function alignment(style: ColumnStyle): string {
  switch (style) {
    case 'text_center':
    case 'mono_center':
    case 'mono_bold_center':
    case 'icon_centered':
    case 'badge_centered':
      return 'text-center';
    case 'mono_right':
      return 'text-right font-mono tabular-nums';
    case 'mono_left':
    case 'mono_bold_left':
      return 'text-left font-mono tabular-nums';
    case 'icon_text_left':
      return 'text-left';
    default:
      return 'text-left';
  }
}

function isMono(style: ColumnStyle): boolean {
  return style.startsWith('mono');
}

function Cell({ column, value }: { readonly column: ColumnMeta; readonly value: unknown }): ReactNode {
  const text = value === null || value === undefined ? '' : String(value);

  if (text.length === 0) {
    // A blank is never left blank: it is said, so it is not mistaken for a
    // failure to load.
    return <span className="text-ink-faint">—</span>;
  }

  if (column.flag === true) {
    return (
      <span className="flex items-center gap-2">
        <MaskIcon name="flag" className="size-3.5 text-ink-faint" />
        <span className={cx(isMono(column.style) && 'font-mono')}>{text}</span>
      </span>
    );
  }

  if (column.codeDomain !== undefined) {
    return (
      <span className="inline-flex rounded-full border border-line px-2 py-px text-xs text-ink-muted">
        {text}
      </span>
    );
  }

  if (column.temporal === true) {
    return <span className="font-mono text-xs tabular-nums">{text}</span>;
  }

  return <span className={cx(isMono(column.style) && 'font-mono tabular-nums')}>{text}</span>;
}
