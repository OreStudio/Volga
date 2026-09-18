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
import { LandingPage } from './pages/LandingPage.js';
import { SignUpPage } from './pages/SignUpPage.js';
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
        <Route path="/login" element={<SignInRoute />} />
        <Route path="/signup" element={<SignUpPage />} />
        {/* The deployment's plumbing is only for whoever is signed in. */}
        <Route
          path="/deployment"
          element={
            state.status === 'authenticated' ? <DeveloperPage /> : <Navigate to="/login" replace />
          }
        />
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
