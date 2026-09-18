import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { useSession } from './session/SessionProvider.js';
import icon from './assets/ore-studio-icon.png';

/**
 * The application chrome, with menus.
 *
 * The menus are present before sign-in, because managing connections is
 * something a person does in order to be able to sign in at all. That is the
 * whole reason the chrome lives outside the session guard.
 *
 * The menu is a real dropdown rather than a navigation bar of links: the items
 * are commands as much as destinations, and a menu bar is what the desktop
 * client has, so it reads as the same application.
 */

interface MenuItem {
  readonly label: string;
  readonly to: string;
  /** A short explanation, shown beside the label. */
  readonly hint?: string;
}

interface Menu {
  readonly label: string;
  readonly items: readonly MenuItem[];
}

interface MenuBarProps {
  readonly menus: readonly Menu[];
  readonly context: ReactNode;
}

export function MenuBar({ menus, context }: MenuBarProps): ReactNode {
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // A menu that stays open when the person clicks elsewhere is the classic
  // dropdown bug, so a click outside and Escape both close it.
  useEffect(() => {
    if (open === null) {
      return;
    }
    function onPointerDown(event: MouseEvent): void {
      if (barRef.current !== null && !barRef.current.contains(event.target as Node)) {
        setOpen(null);
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(null);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function activate(item: MenuItem): void {
    setOpen(null);
    void navigate(item.to);
  }

  return (
    <div className="menubar" ref={barRef}>
      <img className="menubar__icon" src={icon} alt="" />
      <span className="menubar__brand">ORE Studio</span>

      <nav className="menubar__menus" aria-label="Main">
        {menus.map((menu) => (
          <div className="menu" key={menu.label}>
            <button
              className="menu__button"
              type="button"
              aria-expanded={open === menu.label}
              aria-haspopup="menu"
              onClick={() => setOpen(open === menu.label ? null : menu.label)}
            >
              {menu.label}
            </button>
            {open === menu.label && (
              <div className="menu__dropdown" role="menu">
                {menu.items.map((item) => (
                  <button
                    className="menu__item"
                    key={`${item.to}:${item.label}`}
                    type="button"
                    role="menuitem"
                    onClick={() => activate(item)}
                  >
                    <span className="menu__item-label">{item.label}</span>
                    {item.hint !== undefined && (
                      <span className="menu__item-hint">{item.hint}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="menubar__context">{context}</div>
    </div>
  );
}

/** The menus available before anyone has signed in. */
export const ANONYMOUS_MENUS: readonly Menu[] = [
  {
    label: 'Connections',
    items: [
      { label: 'Manage connections', to: '/connections' },
      { label: 'Import from a file', to: '/connections/import' },
      { label: 'Export to a file', to: '/connections/export' },
    ],
  },
  {
    label: 'Login',
    items: [{ label: 'Sign in', to: '/login' }],
  },
];

/** The menus available once signed in. */
export const SESSION_MENUS: readonly Menu[] = [
  {
    label: 'Connections',
    items: [
      { label: 'Manage connections', to: '/connections' },
      { label: 'Import from a file', to: '/connections/import' },
      { label: 'Export to a file', to: '/connections/export' },
    ],
  },
  {
    label: 'Accounts',
    items: [{ label: 'All accounts', to: '/accounts' }],
  },
];

/** The signed-in person and their party, shown at the right of the menu bar. */
export function SessionContext({ onSignOut }: { readonly onSignOut: () => void }): ReactNode {
  const { state } = useSession();
  const [busy, setBusy] = useState(false);

  if (state.status !== 'authenticated') {
    return null;
  }
  const { session } = state;

  return (
    <>
      <span className="shell__party" title={`Party id ${session.party.id}`}>
        {session.party.name.length > 0 ? session.party.name : session.tenantName}
      </span>
      <span>{session.username}</span>
      <button
        className="button button--ghost"
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          try {
            onSignOut();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Signing out...' : 'Sign out'}
      </button>
    </>
  );
}
