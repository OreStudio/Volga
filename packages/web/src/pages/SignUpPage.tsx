import { type ReactNode } from 'react';
import { Link } from 'react-router';

/**
 * Sign up.
 *
 * A real destination rather than a dead button. Accounts come from an
 * administrator or from the provisioning wizard, so there is nothing to submit
 * yet, and saying so plainly is better than a form that cannot work.
 */
export function SignUpPage(): ReactNode {
  return (
    <div className="mx-auto max-w-[560px] py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Sign up</h1>
      <p className="mt-4 text-base text-ink-muted">
        Accounts are created by an administrator, or through the provisioning wizard in the
        desktop client. Self-service sign-up is not available yet.
      </p>
      <p className="mt-6 text-sm">
        <Link to="/login" className="text-accent hover:text-accent-bright">
          Already have an account?
        </Link>
      </p>
    </div>
  );
}
