import { useMemo, useState, type ReactNode } from 'react';
import type { Account } from '@volga/protocol/browser';
import { useAccounts } from '../api/queries.js';

/**
 * The accounts screen.
 *
 * The C++ list handler accepts `offset` and `limit` and then ignores them, so
 * this asks for a single large page and filters it in the browser. The moment
 * the server applies pagination this becomes a keyed query again; the seam is
 * the `listRequest` value below.
 */

const PAGE_SIZE = 500;

/** Account types, matching the server's classifications. */
const ACCOUNT_TYPES = ['user', 'service', 'algorithm', 'llm'] as const;

interface Filters {
  readonly search: string;
  readonly accountType: string;
}

export function AccountsPage(): ReactNode {
  const [filters, setFilters] = useState<Filters>({ search: '', accountType: '' });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listRequest = useMemo(() => ({ offset: 0, limit: PAGE_SIZE }), []);
  const { data, isPending, isError, error, isFetching } = useAccounts(listRequest);

  const rows = useMemo(() => {
    const all = data?.accounts ?? [];
    const needle = filters.search.trim().toLowerCase();
    return all.filter((account) => {
      if (filters.accountType !== '' && account.accountType !== filters.accountType) {
        return false;
      }
      if (needle.length === 0) {
        return true;
      }
      return (
        account.username.toLowerCase().includes(needle) ||
        account.fullName.toLowerCase().includes(needle) ||
        account.email.toLowerCase().includes(needle)
      );
    });
  }, [data, filters]);

  const selected = rows.find((account) => account.id === selectedId) ?? null;

  return (
    <section>
      <header className="page__header">
        <div>
          <h1 className="page__title">Accounts</h1>
          <p className="page__subtitle">
            Identities that can sign in or act as a service, scoped to this tenant.
          </p>
        </div>
      </header>

      <div className="toolbar">
        <label className="toolbar__search">
          <span className="field__label">Search</span>
          <input
            className="field__input"
            type="search"
            placeholder="Username, name, or email"
            value={filters.search}
            onChange={(event) =>
              setFilters((previous) => ({ ...previous, search: event.target.value }))
            }
          />
        </label>
        <label>
          <span className="field__label">Type</span>
          <select
            className="field__input"
            value={filters.accountType}
            onChange={(event) =>
              setFilters((previous) => ({ ...previous, accountType: event.target.value }))
            }
          >
            <option value="">All</option>
            {ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <span className="toolbar__count">
          {isPending
            ? 'Loading...'
            : `${rows.length} of ${data?.totalCount ?? 0}${isFetching ? ' (refreshing)' : ''}`}
        </span>
      </div>

      {isError && (
        <div className="alert" role="alert">
          {error instanceof Error ? error.message : 'Could not load accounts.'}
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Username</th>
              <th scope="col">Full name</th>
              <th scope="col">Email</th>
              <th scope="col">Type</th>
              <th scope="col">Job title</th>
              <th scope="col">Recorded</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((account) => (
              <tr
                key={account.id}
                className={account.id === selectedId ? 'table__row--selected' : undefined}
                onClick={() => setSelectedId(account.id === selectedId ? null : account.id)}
              >
                <td className="mono">{account.username}</td>
                <td>{account.fullName.length > 0 ? account.fullName : <span className="tag">none</span>}</td>
                <td>{account.email}</td>
                <td>
                  <span className={account.accountType === 'user' ? 'tag' : 'tag tag--system'}>
                    {account.accountType}
                  </span>
                </td>
                <td>{account.jobTitle.length > 0 ? account.jobTitle : ''}</td>
                <td className="mono">{account.recordedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isPending && rows.length === 0 && (
          <p className="table__empty">No accounts match the current filter.</p>
        )}
      </div>

      {selected !== null && <AccountDetail account={selected} />}
    </section>
  );
}

function AccountDetail({ account }: { readonly account: Account }): ReactNode {
  return (
    <aside className="detail-panel" aria-label={`Details for ${account.username}`}>
      <dl className="detail-panel__grid">
        <Field label="Account id" value={account.id} mono />
        <Field label="Tenant id" value={account.tenantId} mono />
        <Field label="Version" value={String(account.version)} />
        <Field label="Account type" value={account.accountType} />
        <Field label="Full name" value={account.fullName || 'not recorded'} />
        <Field label="Email" value={account.email} />
        <Field label="Job title" value={account.jobTitle || 'not recorded'} />
        <Field label="Default party" value={account.defaultPartyId ?? 'not set'} mono />
        <Field label="Reports to" value={account.reportsToAccountId ?? 'nobody'} mono />
        <Field label="Recorded at" value={account.recordedAt} mono />
        <Field label="Last change by" value={account.modifiedBy || 'unknown'} />
        <Field label="Change reason" value={account.changeReasonCode || 'none'} />
        <Field label="Commentary" value={account.changeCommentary || 'none'} />
      </dl>
    </aside>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}): ReactNode {
  return (
    <div>
      <dt className="detail-panel__term">{label}</dt>
      <dd className={`detail-panel__value${mono ? ' mono' : ''}`} style={{ margin: 0 }}>
        {value}
      </dd>
    </div>
  );
}
