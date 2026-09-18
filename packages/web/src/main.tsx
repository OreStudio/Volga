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
import { SignInPage } from './pages/SignInPage.js';
import { AccountsPage } from './pages/AccountsPage.js';
import { ConnectionsPage } from './pages/ConnectionsPage.js';
import { ExportPage, ImportPage } from './pages/TransferPages.js';
import './styles.css';

/**
 * Application entry point.
 *
 * Navigation is present whether or not anyone has signed in, because managing
 * connections is how a person gets somewhere to sign in to. Only the account
 * screens require a session.
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
        {/* Reachable without signing in: this is how you get somewhere to sign in to. */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/connections" element={<ConnectionsPage />} />
        <Route path="/connections/import" element={<ImportPage />} />
        <Route path="/connections/export" element={<ExportPage />} />
        <Route path="/login" element={<SignInRoute />} />

        {/* The rest needs a session. */}
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
