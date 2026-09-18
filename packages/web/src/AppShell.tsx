import { type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useSession } from './session/SessionProvider.js';
import { useSiteState } from './api/site.js';
import { Button, Tag } from './ui/Primitives.js';
import icon from './assets/ore-studio-icon.png';

/**
 * The application chrome.
 *
 * The header names the environment, permanently. That is the one fact a person
 * should never have to wonder about, because the cost of mistaking one
 * environment for another is high and the cost of a persistent label is a few
 * pixels.
 */
export function AppChrome({ children }: { readonly children: ReactNode }): ReactNode {
  const { state, signOut } = useSession();
  const { site } = useSiteState();
  const authenticated = state.status === 'authenticated';

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-line bg-bg-primary/95 backdrop-blur">
        <div className="mx-auto flex max-w-[920px] items-center gap-4 px-5 py-3">
          <NavLink to="/" className="flex items-center gap-2.5">
            <img src={icon} alt="" className="size-7 rounded-md" />
            <span className="text-sm font-semibold tracking-tight">ORE Studio</span>
          </NavLink>

          {site !== undefined && (
            <span className="flex items-center gap-2">
              <span className="text-sm text-ink-muted">{site.environment.displayName}</span>
              {site.environment.nonProduction && <Tag tone="warn">development</Tag>}
            </span>
          )}

          <nav className="ml-auto flex items-center gap-1" aria-label="Main">
            {authenticated ? (
              <>
                <NavItem to="/accounts">Accounts</NavItem>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void signOut()}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <NavLink to="/login">
                <Button variant="primary" size="sm">
                  Sign in
                </Button>
              </NavLink>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[920px] px-5 py-10">{children}</main>

      <footer className="mx-auto max-w-[920px] px-5 pb-10 text-xs text-ink-faint">
        © 2026 ORE Studio contributors.
      </footer>
    </div>
  );
}

function NavItem({ to, children }: { readonly to: string; readonly children: ReactNode }): ReactNode {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-md px-3 py-1.5 text-sm transition-colors ${
          isActive ? 'text-ink' : 'text-ink-muted hover:text-ink'
        }`
      }
    >
      {children}
    </NavLink>
  );
}

/** The signed-in person, for a screen that wants to say who they are. */
export function useCurrentUser(): string | null {
  const { state } = useSession();
  return state.status === 'authenticated' ? state.session.username : null;
}
