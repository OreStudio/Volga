import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { useSession } from '../session/SessionProvider.js';
import { Button } from '../ui/Primitives.js';
import { heroSplash } from '../assets/brand.js';

/**
 * The landing page.
 *
 * The same layout as the project site at orestudio.github.io, and deliberately
 * so: a link from there arrives here, and the two should not feel like
 * different products. A large screenshot, then the heading and the text beneath
 * it, with the same links out.
 */
export function LandingPage(): ReactNode {
  const { state } = useSession();
  const authenticated = state.status === 'authenticated';

  return (
    <article className="mx-auto max-w-[920px] pb-16">
      <figure className="mt-4">
        <img
          src={heroSplash}
          alt="ORE Studio"
          className="w-full rounded-[var(--radius-card)] border border-line"
        />
      </figure>

      <h1 className="mt-10 border-b border-line pb-4 text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-[2.75rem]">
        Enterprise-grade risk analytics —<br />
        but visual <em>and</em> open-source.
      </h1>

      <p className="mt-6 text-lg text-ink-muted">
        ORE Studio wraps the{' '}
        <a
          href="https://github.com/OpenSourceRisk"
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:text-accent-bright"
        >
          Open-Source Risk Engine
        </a>{' '}
        (ORE) and{' '}
        <a
          href="https://www.quantlib.org/"
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:text-accent-bright"
        >
          QuantLib
        </a>{' '}
        in an intuitive graphical interface — no Python or C++ required — built on a
        PostgreSQL-native, C++-performance backend.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        {authenticated ? (
          <Link to="/accounts">
            <Button variant="primary" size="xl">
              Open accounts
            </Button>
          </Link>
        ) : (
          <>
            <Link to="/signup">
              <Button variant="secondary" size="xl">
                Sign up
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="primary" size="xl">
                Sign in
              </Button>
            </Link>
          </>
        )}
      </div>
    </article>
  );
}
