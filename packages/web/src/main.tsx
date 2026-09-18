import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import {
  AppProviders,
  SessionProvider,
  createQueryClient,
  useSession,
} from './session/SessionProvider.js';
import { AppChrome } from './AppShell.js';
import { LandingPage, SignUpPage } from './pages/LandingPage.js';
import { DeveloperPage } from './pages/DeveloperPage.js';
import { SignInPage } from './pages/SignInPage.js';
import { AccountsPage } from './pages/AccountsPage.js';
import './styles.css';

/**
 * Application entry point.
 *
 * The environment is fixed when the process starts, so there is nothing here
 * about choosing where to connect. A visitor lands, signs in if they have an
 * account, and that is the whole journey.
 */

const queryClient = createQueryClient();

/** The sign-in screen, which gets out of the way once there is a session. */
function SignInRoute(): ReactNode {
  const { state } = useSession();
  return state.status === 'authenticated' ? <Navigate to="/accounts" replace /> : <SignInPage />;
}

function App(): ReactNode {
  const { state } = useSession();

  if (state.status === 'loading') {
    return (
      <div className="grid min-h-full place-items-center">
        <span className="text-sm text-ink-faint">Loading...</span>
      </div>
    );
  }

  return (
    <AppChrome>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/deployment" element={<DeveloperPage />} />
        <Route path="/login" element={<SignInRoute />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route
          path="/accounts"
          element={
            state.status === 'authenticated' ? <AccountsPage /> : <Navigate to="/login" replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppChrome>
  );
}

/**
 * About ORE Studio.
 *
 * The project has a site, so this page's job is to send people there rather
 * than to restate it. A second copy of the same text goes stale.
 */
function AboutPage(): ReactNode {
  return (
    <div className="mx-auto max-w-[680px] py-10">
      <h1 className="border-b border-line pb-4 text-3xl font-semibold tracking-tight">
        About ORE Studio
      </h1>
      <p className="mt-6 text-base text-ink-muted">
        ORE Studio wraps the Open-Source Risk Engine and QuantLib in a graphical interface,
        on a PostgreSQL-native backend.
      </p>
      <p className="mt-4 text-base text-ink-muted">
        This site is the browser interface. The project's own site has the manuals, the
        modelling method, the roadmap and the downloads.
      </p>
      <p className="mt-8">
        <a
          href="https://orestudio.github.io/OreStudio/"
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:text-accent-bright"
        >
          orestudio.github.io/OreStudio
        </a>
      </p>
    </div>
  );
}

const container = document.getElementById('root');
if (container === null) {
  throw new Error('missing #root element');
}

createRoot(container).render(
  <StrictMode>
    <AppProviders queryClient={queryClient}>
      <SessionProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </SessionProvider>
    </AppProviders>
  </StrictMode>,
);
