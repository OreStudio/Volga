import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useSession } from './session/SessionProvider.js';

/**
 * The application shell.
 *
 * It shows who is signed in and which party their work is scoped to, and it
 * owns the navigation. A new module is one entry in the navigation list and
 * one route, so adding trading or reference-data screens does not touch this
 * file again beyond that.
 */

interface NavItem {
  readonly to: string;
  readonly label: string;
}

const NAVIGATION: readonly NavItem[] = [{ to: '/accounts', label: 'Accounts' }];

export function AppShell(): ReactNode {
  const { state, signOut } = useSession();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  if (state.status !== 'authenticated') {
    return null;
  }

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      await signOut();
      await navigate('/');
    } finally {
      setSigningOut(false);
    }
  }

  const { session } = state;

  return (
    <div className="shell">
      <header className="shell__header">
        <span className="shell__brand">ORE Studio</span>
        <nav className="shell__nav" aria-label="Modules">
          {NAVIGATION.map((item) => (
            <NavLink key={item.to} to={item.to} className="shell__nav-link">
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="shell__context">
          <span className="shell__party" title={`Party id ${session.party.id}`}>
            {session.party.name.length > 0 ? session.party.name : session.tenantName}
          </span>
          <span>{session.username}</span>
          <button
            className="button button--ghost"
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </header>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
