import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { useSession } from '../session/SessionProvider.js';
import { Button } from '../ui/Primitives.js';
import { PROJECT_SITE, heroSplash } from '../assets/brand.js';

/**
 * The landing page.
 *
 * The main site at orestudio.github.io links here, so the two have to read as
 * one project: same palette, same type, same content column. Beyond that it is
 * deliberately bare. It says what this is and offers the one thing a person
 * came to do, and the hero is sized to fill the screen rather than to sit in a
 * band at the top of it.
 */
export function LandingPage(): ReactNode {
  const { state } = useSession();
  const authenticated = state.status === 'authenticated';

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center">
      {/* The hero carries the page, so the text and the artwork are sized to
          fill the viewport rather than to sit in a band at the top of it. */}
      <section className="grid w-full items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <div>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Enterprise-grade risk analytics, in the browser.
          </h1>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            {authenticated ? (
              <Link to="/accounts">
                <Button variant="primary" size="xl">
                  Open accounts
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="primary" size="xl">
                    Sign in
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button variant="secondary" size="xl">
                    Sign up
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>

        <figure>
          <img
            src={heroSplash}
            alt="The ORE Studio logo"
            className="w-full rounded-[var(--radius-card)] border border-line shadow-2xl"
          />
        </figure>
      </section>
    </div>
  );
}

/** A placeholder, so the call to action is real before the feature is. */
export function SignUpPage(): ReactNode {
  return (
    <div className="mx-auto max-w-md pt-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Sign up</h1>
      <p className="mt-3 text-sm text-ink-muted">
        Accounts are created by an administrator, or through the provisioning wizard in the
        desktop client. Self-service sign-up is not available yet.
      </p>
      <p className="mt-6 text-sm text-ink-muted">
        To see the project instead, visit{' '}
        <a href={PROJECT_SITE} target="_blank" rel="noreferrer" className="text-accent">
          orestudio.github.io
        </a>
        .
      </p>
    </div>
  );
}
