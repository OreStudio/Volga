import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useSession } from '../session/SessionProvider.js';
import { useSiteState } from '../api/site.js';
import { useTranslation } from '../i18n/Provider.js';
import { LANGUAGE_INFO } from '../i18n/languages.js';
import { findComponent } from './registry.js';
import { humanise, translatedOrHumanised } from './labels.js';
import { MaskIcon } from '../ui/icons/MaskIcon.js';
import { Button, Tag, cx } from '../ui/Primitives.js';
import icon from '../assets/ore-studio-icon.png';

/**
 * The application bar.
 *
 * A horizontal strip for the things that belong to the application rather than to
 * a component: where you are, anything that needs your attention, the language,
 * and signing out. The Qt client put connect, disconnect and switch party here
 * too; in a browser the connection is the deployment's business and party
 * switching belongs with the account.
 *
 * The status bar is folded in rather than kept separate, because on the web a
 * status line pinned to the bottom of the window is a line nobody reads and a
 * footer that fights the scroll. What it carried — the environment, the
 * connection state — is small, permanent and belongs in view.
 */
export function TopBar({ onOpenMenu }: { readonly onOpenMenu: () => void }): ReactNode {
  const { state, signOut } = useSession();
  const { t, language, setLanguage, languages } = useTranslation();
  const { pathname } = useLocation();
  const [languageOpen, setLanguageOpen] = useState(false);

  const authenticated = state.status === 'authenticated';
  const crumbs = breadcrumbs(pathname, t);

  return (
    <header className="flex h-13 shrink-0 items-center gap-3 border-b border-line px-3">
      <button
        type="button"
        onClick={onOpenMenu}
        className="rounded-md p-2 text-ink-muted hover:bg-surface-hover hover:text-ink lg:hidden"
        aria-label={t('nav.menu')}
      >
        <span className="block h-0.5 w-4 bg-current" />
        <span className="mt-1 block h-0.5 w-4 bg-current" />
        <span className="mt-1 block h-0.5 w-4 bg-current" />
      </button>

      <Link to="/" className="flex shrink-0 items-center gap-2">
        <img src={icon} alt="" className="size-6 rounded-md" />
        <span className="hidden text-sm font-semibold tracking-tight sm:block">{t('app.name')}</span>
      </Link>

      {crumbs.length > 0 && (
        <nav className="hidden min-w-0 items-center gap-1.5 text-sm md:flex" aria-label="Breadcrumb">
          <span className="text-ink-faint">/</span>
          {crumbs.map((crumb, index) => (
            <span key={crumb.to ?? crumb.label} className="flex items-center gap-1.5">
              {crumb.to !== undefined && index < crumbs.length - 1 ? (
                <Link to={crumb.to} className="truncate text-ink-muted hover:text-ink">
                  {crumb.label}
                </Link>
              ) : (
                <span className="truncate text-ink">{crumb.label}</span>
              )}
              {index < crumbs.length - 1 && <span className="text-ink-faint">/</span>}
            </span>
          ))}
        </nav>
      )}

      <div className="ml-auto flex items-center gap-1">
        <StatusMarker />

        {authenticated && (
          <>
            <IconButton icon="info" label={t('nav.notifications')} />
            {/*
              Alerts carry a count because an alert without one is a bell nobody
              looks at. Nothing raises alerts yet, so the count is zero and the
              badge is absent rather than showing a permanent nought.
            */}
            <IconButton icon="warning" label={t('nav.alerts')} count={0} />
          </>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setLanguageOpen((open) => !open)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-ink-muted hover:bg-surface-hover hover:text-ink"
            aria-haspopup="listbox"
            aria-expanded={languageOpen}
            title={t('nav.language')}
          >
            <MaskIcon name="globe" className="size-4 opacity-80" />
            <span className="uppercase">{language}</span>
          </button>
          {languageOpen && (
            <>
              {/* Clicking anywhere closes it, which is what a menu should do. */}
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setLanguageOpen(false)}
              />
              <ul
                className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border border-line bg-surface-overlay py-1 shadow-lg"
                role="listbox"
              >
                {languages.map((code) => {
                  const info = LANGUAGE_INFO[code];
                  return (
                    <li key={code}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={code === language}
                        onClick={() => {
                          setLanguage(code);
                          setLanguageOpen(false);
                        }}
                        className={cx(
                          'flex w-full items-center justify-between px-3 py-1.5 text-left text-sm',
                          code === language ? 'text-ink' : 'text-ink-muted hover:bg-surface-hover hover:text-ink',
                        )}
                      >
                        <span>{info.name}</span>
                        <span className="text-xs text-ink-faint">{info.englishName}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {authenticated ? (
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            {t('nav.signOut')}
          </Button>
        ) : (
          <Link to="/login">
            <Button variant="primary" size="sm">
              {t('nav.signIn')}
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}

/**
 * The environment, carried in the bar rather than in a footer.
 *
 * It is small because it is not an action, and permanent because the worst
 * failure mode is not knowing which environment you are looking at.
 */
function StatusMarker(): ReactNode {
  const { site } = useSiteState();
  const { t } = useTranslation();
  if (site === undefined) return null;

  return (
    <span className="mr-1 hidden items-center gap-2 text-xs text-ink-faint sm:flex">
      <span className="size-1.5 rounded-full bg-emerald-500/70" aria-hidden />
      <span className="max-w-40 truncate">{site.environment.displayName}</span>
      {site.environment.nonProduction && <Tag tone="warn">{t('status.development')}</Tag>}
    </span>
  );
}

function IconButton({
  icon,
  label,
  count,
}: {
  readonly icon: 'info' | 'warning';
  readonly label: string;
  readonly count?: number;
}): ReactNode {
  return (
    <button
      type="button"
      className="relative rounded-md p-2 text-ink-muted hover:bg-surface-hover hover:text-ink"
      aria-label={label}
      title={label}
    >
      <MaskIcon name={icon} className="size-4" />
      {count !== undefined && count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-medium text-ink-inverse">
          {count}
        </span>
      )}
    </button>
  );
}

interface Crumb {
  readonly label: string;
  readonly to?: string;
}

/** Where you are, from the route rather than from state. */
function breadcrumbs(pathname: string, t: (key: string) => string): readonly Crumb[] {
  const [componentId, entityPath] = pathname.split('/').filter(Boolean);
  const component = findComponent(componentId);
  if (component === undefined) {
    return [];
  }

  const crumbs: Crumb[] = [{ label: t(component.titleKey), to: `/${component.path}` }];
  if (entityPath !== undefined) {
    const entity = component.entities.find((e) => e.path === entityPath);
    crumbs.push({
      label:
        entity === undefined
          ? humanise(entityPath)
          : translatedOrHumanised(t, `entity.${entity.id}.title`, entity.id),
    });
  }
  return crumbs;
}

