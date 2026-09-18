import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { useSession } from '../session/SessionProvider.js';
import { useSiteState } from '../api/site.js';
import { Button, Tag } from '../ui/Primitives.js';
import { heroBackground } from '../assets/background.js';

/**
 * The landing page.
 *
 * This sits beside the project site at orestudio.github.io/OreStudio, which is
 * the shop window; a link from there arrives here, so the two have to read as
 * the same project. Same palette, same type scale, same content column.
 *
 * It says what the application is, which environment this deployment serves,
 * and offers the one thing a person came to do.
 */
export function LandingPage(): ReactNode {
  const { state } = useSession();
  const { site, isLoading } = useSiteState();
  const authenticated = state.status === 'authenticated';

  return (
    <div>
      <section className="grid gap-8 border-b border-line pb-10 md:grid-cols-[1.1fr_1fr] md:items-center">
        <div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-balance sm:text-4xl">
            Enterprise-grade risk analytics, in the browser.
          </h1>
          <p className="mt-4 text-base text-ink-muted">
            The ORE Studio interface, served from the same services as the desktop client.
            Nothing to install, nothing to keep up to date on each desk, and the same data
            and permissions underneath.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {authenticated ? (
              <Link to="/accounts">
                <Button variant="primary" size="lg">
                  Open accounts
                </Button>
              </Link>
            ) : (
              <Link to="/login">
                <Button variant="primary" size="lg">
                  Sign in
                </Button>
              </Link>
            )}
            <a href="https://orestudio.github.io/OreStudio/" target="_blank" rel="noreferrer">
              <Button variant="secondary" size="lg">
                About ORE Studio
              </Button>
            </a>
          </div>
        </div>

        <figure className="overflow-hidden rounded-[var(--radius-card)] border border-line">
          <img
            src={heroBackground}
            alt="Traders working at screens showing market data"
            className="aspect-[16/10] w-full object-cover"
          />
        </figure>
      </section>

      <section className="py-10">
        <h2 className="border-b border-line pb-2 text-xl font-semibold tracking-tight">
          This deployment
        </h2>

        <dl className="mt-6 grid gap-6 sm:grid-cols-3">
          <Item
            term="Environment"
            value={isLoading ? '...' : (site?.environment.displayName ?? 'unknown')}
            note={site?.environment.description ?? ''}
            {...(site?.environment.nonProduction === true ? { tag: 'development' } : {})}
          />
          <Item
            term="Sign in with"
            value="Your ORE Studio account"
            note="The same credentials you use in the desktop client and the shell."
          />
          <Item
            term="Developer tools"
            value={site?.developerTools === true ? 'Available' : 'Not available'}
            note={
              site?.developerTools === true
                ? 'This deployment offers the test accounts.'
                : 'Set at deployment, not in the browser.'
            }
          />
        </dl>
      </section>

      <section className="pb-10">
        <h2 className="border-b border-line pb-2 text-xl font-semibold tracking-tight">
          What is here
        </h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Feature
            title="Accounts"
            body="Who can sign in or act as a service, with their party, contact details and reporting line."
          />
          <Feature
            title="More to come"
            body="Reference data, portfolios, trades and analytics are being ported across, a screen at a time."
          />
        </div>
      </section>
    </div>
  );
}

function Item({
  term,
  value,
  note,
  tag,
}: {
  readonly term: string;
  readonly value: string;
  readonly note: string;
  readonly tag?: string;
}): ReactNode {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-faint">{term}</dt>
      <dd className="mt-1 flex items-center gap-2 text-base">
        {value}
        {tag !== undefined && <Tag tone="warn">{tag}</Tag>}
      </dd>
      {note.length > 0 && <p className="mt-1 text-sm text-ink-muted">{note}</p>}
    </div>
  );
}

function Feature({ title, body }: { readonly title: string; readonly body: string }): ReactNode {
  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-bg-secondary p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-ink-muted">{body}</p>
    </article>
  );
}
