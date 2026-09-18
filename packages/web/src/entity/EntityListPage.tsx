import { useMemo, useState, type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { DataTable, type RowAction } from './DataTable.js';
import { MaskIcon } from '../ui/icons/MaskIcon.js';
import { Button, Notice, cx } from '../ui/Primitives.js';
import { useTranslation } from '../i18n/Provider.js';
import type { EntityMeta } from './contract.js';

/**
 * The list screen for every entity.
 *
 * Generated from the entity's declaration plus the collection name, so an entity
 * adds no screen code. Search, filtering and paging are here once, which is the
 * point: a hundred entities with a hundred list screens is a hundred places for
 * the search box to behave differently.
 */
export interface EntityListPageProps<Row> {
  readonly meta: EntityMeta;
  readonly title: string;
  readonly description?: string;
  readonly rows: readonly Row[];
  readonly totalCount: number;
  readonly query: UseQueryResult<{ rows: readonly Row[]; totalCount: number }>;
  readonly page: number;
  readonly pageSize: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (size: number) => void;
  readonly onReload: () => void;
  readonly onOpen?: (row: Row) => void;
  /** Creating a new record. Omitted where the entity has none. */
  readonly onCreate?: () => void;
  /** Reached from the row menu. Empty when the entity offers none. */
  readonly onEdit?: (row: Row) => void;
  readonly onHistory?: (row: Row) => void;
  readonly onDelete?: (row: Row) => void;
  /** Fields the search box matches. */
  readonly searchFields?: readonly string[];
  /**
   * Catalogue key for what the search box searches, so it names the entity's
   * own fields rather than saying "Search" and leaving nobody to guess.
   */
  readonly searchPlaceholderKey?: string;
  /**
   * A message from a failed action, shown above the table.
   *
   * Actions are wired by the entity, so an entity that deletes needs somewhere
   * to report a refusal. The screen owns the reporting because it owns the
   * layout, and a modal for a refused delete is heavier than the news deserves.
   */
  readonly failureMessage?: string;
  /** The field the type filter groups on, and the values present. */
  readonly filterField?: string;
}

const PAGE_SIZES = [25, 50, 100, 200, 500] as const;
const LOAD_ALL_CEILING = 1000;

export function EntityListPage<Row extends Record<string, unknown>>({
  meta,
  title,
  description,
  rows,
  totalCount,
  query,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onReload,
  onOpen,
  onCreate,
  onEdit,
  onHistory,
  onDelete,
  searchFields = [],
  searchPlaceholderKey = 'entity.search',
  failureMessage,
  filterField,
}: EntityListPageProps<Row>): ReactNode {
  const { t, plural } = useTranslation();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');

  // Filtering runs in the browser over the loaded page, because the server's
  // list call takes paging and not a predicate. When the server grows one, the
  // same controls drive the query and this layout does not change.
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter.length > 0 && String(row[filterField ?? '']) !== filter) return false;
      if (needle.length === 0) return true;
      return searchFields.some((field) => String(row[field] ?? '').toLowerCase().includes(needle));
    });
  }, [rows, search, filter, filterField, searchFields]);

  const filterValues = useMemo(() => {
    if (filterField === undefined) return [];
    return [...new Set(rows.map((row) => String(row[filterField] ?? '')))].filter((v) => v.length > 0).sort();
  }, [rows, filterField]);

  // The actions a row offers, in the order a person looks for them. History
  // before Delete, because the destructive one should not be the first thing
  // under the cursor.
  const rowActions: readonly RowAction<Row>[] = [
    ...(onEdit === undefined
      ? []
      : [{ id: 'edit', label: t('entity.edit'), icon: 'edit' as const, onSelect: onEdit }]),
    ...(onHistory === undefined
      ? []
      : [{ id: 'history', label: t('entity.history'), icon: 'history' as const, onSelect: onHistory }]),
    ...(onDelete === undefined
      ? []
      : [
          {
            id: 'delete',
            label: t('entity.delete'),
            icon: 'delete' as const,
            danger: true,
            onSelect: onDelete,
          },
        ]),
  ];

  const pages = Math.max(1, Math.ceil(totalCount / pageSize));
  const loading = query.isPending;
  const isFiltered = search.trim().length > 0 || filter.length > 0;

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-7">
      <header className="mb-5 flex items-start gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description !== undefined && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onReload}
            pending={query.isFetching && !loading}
            pendingLabel={t('accounts.refreshing')}
          >
            <MaskIcon name="arrowSync" className="size-3.5 opacity-70" />
            {t('entity.refresh')}
          </Button>
          {/* Not rendered rather than disabled: a disabled button invites a
              question a missing one does not. */}
          <Button variant="primary" size="sm" disabled title={t('card.notBuilt')}>
            <MaskIcon name="add" className="size-3.5 opacity-70" />
            {t('entity.add')}
          </Button>
        </div>
      </header>

      {failureMessage !== undefined && (
        <div className="mb-4">
          <Notice tone="error">{failureMessage}</Notice>
        </div>
      )}

      {query.isError && (
        <div className="mb-4">
          <Notice tone="error">
            {t('accounts.failed')}{' '}
            <button type="button" onClick={onReload} className="underline hover:text-ink">
              {t('feedback.retry')}
            </button>
          </Notice>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {searchFields.length > 0 && (
          <div className="relative min-w-56 flex-1">
            <MaskIcon name="search" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 opacity-50" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t(searchPlaceholderKey)}
              aria-label={t('accounts.search')}
              className="h-9 w-full rounded-md border border-line bg-bg-secondary pl-8 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong focus:outline-none"
            />
          </div>
        )}

        {filterValues.length > 0 && (
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label={t('accounts.filterByType')}
            className="h-9 rounded-md border border-line bg-bg-secondary px-2.5 text-sm text-ink focus:border-line-strong focus:outline-none"
          >
            <option value="">{t('accounts.allTypes')}</option>
            {filterValues.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        )}

        <span className="ml-auto text-xs tabular-nums text-ink-faint">
          {isFiltered
            ? t('accounts.count', { shown: visible.length, total: rows.length })
            : plural('home.entities', totalCount)}
        </span>
      </div>

      {/* Loading keeps the rows and dims them rather than blanking the table,
          because a table that empties on every refresh is one nobody can read. */}
      <div className={cx(query.isFetching && !loading && 'opacity-60 transition-opacity')}>
        <DataTable
          columns={meta.columns}
          rows={visible}
          rowKey={(row) => String(row[meta.keyField] ?? '')}
          {...(onOpen === undefined ? {} : { onOpen })}
          {...(rowActions.length === 0 ? {} : { rowActions })}
          loading={loading}
          emptyMessage={isFiltered ? t('accounts.empty') : t('entity.noRecords')}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
        <span className="tabular-nums">
          {isFiltered
            ? t('accounts.count', { shown: visible.length, total: rows.length })
            : totalCount === 0
              ? t('entity.noRecords')
              : t('entity.page', { page, pages })}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <PagerButton disabled={page <= 1} onClick={() => onPageChange(1)} label={t('entity.first')} />
          <PagerButton disabled={page <= 1} onClick={() => onPageChange(page - 1)} label={t('entity.previous')} />
          <PagerButton disabled={page >= pages} onClick={() => onPageChange(page + 1)} label={t('entity.next')} />
          <PagerButton disabled={page >= pages} onClick={() => onPageChange(pages)} label={t('entity.last')} />
        </div>

        <label className="flex items-center gap-2">
          {t('entity.pageSize')}
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-8 rounded-md border border-line bg-bg-secondary px-2 text-xs text-ink focus:outline-none"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        {/* Offered only when it is honest: loading a hundred thousand records
            into a browser is a trap, not a feature. */}
        {totalCount > 0 && totalCount <= LOAD_ALL_CEILING && pageSize < totalCount && (
          <button
            type="button"
            onClick={() => onPageSizeChange(totalCount)}
            className="rounded-md border border-line px-2 py-1 text-xs text-ink-muted hover:text-ink"
          >
            {t('entity.loadAll')}
          </button>
        )}
      </div>
    </div>
  );
}

function PagerButton({
  disabled,
  onClick,
  label,
}: {
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly label: string;
}): ReactNode {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-line px-2 py-1 text-xs text-ink-muted transition-colors hover:text-ink disabled:opacity-40 disabled:hover:text-ink-muted"
    >
      {label}
    </button>
  );
}
