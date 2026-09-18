import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { useConnectionsCatalog } from '../api/connections-queries.js';
import { useSession } from '../session/SessionProvider.js';
import { Button, Tag } from '../ui/Primitives.js';
import { heroBackground, heroFallback } from '../assets/background.js';
import icon from '../assets/ore-studio-icon.png';

/**
 * The landing page.
 *
 * A dashboard application opens on a landing page rather than on a login form.
 * It says what the application is, shows the state of the connection store, and
 * offers the two things a person actually does next: sign in, or set up the
 * connections they will sign in to.
 *
 * The store's own state drives the calls to action, so a first-time visitor is
 * pointed at setting up connections while someone with a working store is
 * pointed straight at signing in.
 */
export function LandingPage(): ReactNode {
  const { catalog, isLoading } = useConnectionsCatalog();
  const { state } = useSession();

  const authenticated = state.status === 'authenticated';
  const uninitialised = catalog?.store.uninitialised ?? false;
  const environmentCount = catalog?.environments.length ?? 0;
  const connectionCount = catalog?.connections.length ?? 0;
  const unlocked = catalog?.store.unlocked ?? false;

  // A store with nothing in it cannot be signed in to, so the first step is
  // setting it up rather than attempting a login that cannot succeed.
  const needsSetup = !isLoading && environmentCount === 0;

  return (
    <div className="-m-6">
      <section className="relative isolate overflow-hidden border-b border-line">
        {/*
          The artwork is its own layer rather than a background on the section.
          A background utility class and an inline background image compete for
          the same property, and the class wins, so the image silently vanishes.
        */}
        <div
          aria-hidden
          className="absolute inset-0 -z-20 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroBackground})`, backgroundColor: heroFallback }}
        />
        {/* A scrim: solid where the text sits, fading so the artwork shows. */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-surface-base via-surface-base/80 to-surface-base/25" />

        <div className="relative mx-auto max-w-5xl px-8 py-16">
          <div className="flex items-center gap-3">
            <img src={icon} alt="" className="size-9 rounded-lg" />
            <span className="text-sm font-medium tracking-tight text-ink-muted">
              ORE Studio
            </span>
          </div>

          <h1 className="mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-balance">
            Trading operations, in the browser.
          </h1>
          <p className="mt-4 max-w-xl text-base text-ink-muted">
            Reference data, portfolios, trades and analytics, served from the same
            services the desktop client uses. No install, no build step, and nothing to
            keep up to date on each desk.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {authenticated ? (
              <Link to="/accounts">
                <Button variant="primary" size="lg">
                  Open accounts
                </Button>
              </Link>
            ) : needsSetup ? (
              <Link to="/connections">
                <Button variant="primary" size="lg">
                  Set up your connections
                </Button>
              </Link>
            ) : (
              <Link to="/login">
                <Button variant="primary" size="lg">
                  Sign in
                </Button>
              </Link>
            )}
            <Link to="/connections">
              <Button variant="secondary" size="lg">
                Manage connections
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-8 py-12">
        <div className="grid gap-6 sm:grid-cols-3">
          <Feature
            title={
              isLoading
                ? 'Reading your store'
                : `${environmentCount} ${environmentCount === 1 ? 'environment' : 'environments'}`
            }
            body={
              environmentCount === 0
                ? 'No environments yet. Add one, or import a file from another machine.'
                : 'Saved on this machine, and yours to copy, back up or move.'
            }
          />
          <Feature
            title={`${connectionCount} ${connectionCount === 1 ? 'connection' : 'connections'}`}
            body="Each one remembers a user, and the password for it if you chose to save it."
          />
          <Feature
            title={uninitialised ? 'Not protected yet' : unlocked ? 'Store unlocked' : 'Store locked'}
            body="A master password protects the saved passwords. It never leaves this machine."
          />
        </div>
      </section>
    </div>
  );
}

function Feature({ title, body }: { readonly title: string; readonly body: string }): ReactNode {
  return (
    <article className="card p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm text-ink-muted">{body}</p>
    </article>
  );
}

/** The store's state, shown where the landing page explains itself. */
export function StoreStateTag({
  uninitialised,
  unlocked,
}: {
  readonly uninitialised: boolean;
  readonly unlocked: boolean;
}): ReactNode {
  if (uninitialised) {
    return <Tag tone="warn">no master password</Tag>;
  }
  return unlocked ? <Tag tone="accent">unlocked</Tag> : <Tag tone="warn">locked</Tag>;
}
