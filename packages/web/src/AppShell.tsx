import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useSession } from './session/SessionProvider.js';
import { useConnectionsCatalog, useConnectionsMutations } from './api/connections-queries.js';
import { ApiFailure } from './api/transport.js';
import { Button, Field, Input, Notice, Tag, cx } from './ui/Primitives.js';
import icon from './assets/ore-studio-icon.png';

/**
 * The application chrome.
 *
 * A web application of this kind does not want a menu bar. A menu bar is a
 * desktop idiom, it costs a click to reveal anything, and it hides which part of
 * the application you are in. Navigation is a sidebar instead: the destinations
 * are visible, the current one is marked, and the connection state sits with the
 * thing it describes rather than in a dialog.
 *
 * The navigation is present before sign-in, because managing connections is how
 * a person gets somewhere to sign in to.
 */

interface NavItem {
  readonly to: string;
  readonly label: string;
}

const CONNECTION_NAV: readonly NavItem[] = [
  { to: '/connections', label: 'Connections' },
  { to: '/connections/import', label: 'Import' },
  { to: '/connections/export', label: 'Export' },
];

const SESSION_NAV: readonly NavItem[] = [{ to: '/accounts', label: 'Accounts' }];

export function AppChrome({ children }: { readonly children: ReactNode }): ReactNode {
  const { state, signOut } = useSession();
  const { catalog } = useConnectionsCatalog();
  const authenticated = state.status === 'authenticated';

  return (
    <div className="flex min-h-full">
      <nav
        className="flex w-56 shrink-0 flex-col border-r border-line bg-surface-raised"
        aria-label="Main"
      >
        <NavLink to="/" className="flex items-center gap-2.5 px-4 py-4 hover:bg-surface-hover">
          <img src={icon} alt="" className="size-7 rounded-md" />
          <span className="text-sm font-semibold tracking-tight">ORE Studio</span>
        </NavLink>

        <div className="flex-1 px-2 py-2">
          <SidebarGroup label="Connections">
            {CONNECTION_NAV.map((item) => (
              <SidebarLink key={item.to} item={item} />
            ))}
          </SidebarGroup>

          {authenticated && (
            <SidebarGroup label="Session">
              {SESSION_NAV.map((item) => (
                <SidebarLink key={item.to} item={item} />
              ))}
            </SidebarGroup>
          )}
        </div>

        <div className="border-t border-line px-3 py-3">
          {authenticated && state.status === 'authenticated' ? (
            <SignedIn
              username={state.session.username}
              party={state.session.party.name || state.session.tenantName}
              partyId={state.session.party.id}
              onSignOut={() => void signOut()}
            />
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-ink-faint">Not signed in</p>
              <NavLink to="/login" className="block">
                <Button variant="primary" size="sm" className="w-full">
                  Sign in
                </Button>
              </NavLink>
            </div>
          )}
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <ConnectionStrip
          path={catalog?.store.databasePath}
          unlocked={catalog?.store.unlocked ?? false}
          uninitialised={catalog?.store.uninitialised ?? false}
          counts={{
            environments: catalog?.environments.length ?? 0,
            connections: catalog?.connections.length ?? 0,
          }}
        />
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

function SidebarGroup({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className="mb-4">
      <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        {label}
      </p>
      <div className="mt-1 space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarLink({ item }: { readonly item: NavItem }): ReactNode {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/connections'}
      className={({ isActive }) =>
        cx(
          'block rounded-md px-2 py-1.5 text-sm transition-colors duration-100',
          isActive
            ? 'bg-accent/12 text-accent-bright'
            : 'text-ink-muted hover:bg-surface-hover hover:text-ink',
        )
      }
    >
      {item.label}
    </NavLink>
  );
}

function SignedIn({
  username,
  party,
  partyId,
  onSignOut,
}: {
  readonly username: string;
  readonly party: string;
  readonly partyId: string;
  readonly onSignOut: () => void;
}): ReactNode {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <div className="min-w-0">
        <p className="truncate text-sm">{username}</p>
        <p className="truncate text-xs text-ink-faint" title={partyId}>
          {party}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full"
        pending={busy}
        pendingLabel="Signing out..."
        onClick={() => {
          setBusy(true);
          onSignOut();
        }}
      >
        Sign out
      </Button>
    </div>
  );
}

/**
 * The connection's state, always visible.
 *
 * The store belongs to the person using it, so where it is and whether it is
 * open are permanent facts about the session rather than something behind a
 * menu. The unlock action lives here because this is where the state is shown.
 */
function ConnectionStrip({
  path,
  unlocked,
  uninitialised,
  counts,
}: {
  readonly path: string | undefined;
  readonly unlocked: boolean;
  readonly uninitialised: boolean;
  readonly counts: { readonly environments: number; readonly connections: number };
}): ReactNode {
  const { unlock } = useConnectionsMutations();
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    try {
      await unlock.mutateAsync(password);
      setPassword('');
      setAsking(false);
    } catch (cause) {
      setError(cause instanceof ApiFailure ? cause.message : 'That did not work.');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface-overlay/40 px-6 py-2 text-xs">
      <span className="text-ink-faint">Database</span>
      <span className="truncate font-mono text-ink-muted" title={path}>
        {path ?? '...'}
      </span>

      <span className="ml-auto flex items-center gap-2">
        <Tag>{counts.environments} environments</Tag>
        <Tag>{counts.connections} connections</Tag>

        {uninitialised ? (
          <Tag tone="warn">no master password</Tag>
        ) : unlocked ? (
          <Tag tone="accent">unlocked</Tag>
        ) : (
          <Tag tone="warn">locked</Tag>
        )}

        {!unlocked && (
          <Button size="sm" variant={uninitialised ? 'primary' : 'secondary'} onClick={() => setAsking(true)}>
            {uninitialised ? 'Set a master password' : 'Unlock'}
          </Button>
        )}
      </span>

      {asking && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-5 shadow-2xl" role="dialog" aria-modal="true">
            <h2 className="text-sm font-semibold">
              {uninitialised ? 'Set a master password' : 'Unlock the connections store'}
            </h2>
            <p className="mt-1 mb-4 text-sm text-ink-muted">
              {uninitialised
                ? 'This protects the passwords saved for your connections. There is no way to recover it, so keep it somewhere safe.'
                : 'Enter the master password to see and change your saved connections.'}
            </p>
            {error !== null && <Notice tone="error">{error}</Notice>}
            <Field label="Master password">
              <Input
                type="password"
                value={password}
                autoFocus
                autoComplete={uninitialised ? 'new-password' : 'current-password'}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && password.length > 0) {
                    void submit();
                  }
                }}
              />
            </Field>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setAsking(false)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={password.length === 0}
                pending={unlock.isPending}
                pendingLabel="Working..."
                onClick={() => void submit()}
              >
                {uninitialised ? 'Set password' : 'Unlock'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
