import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import {
  AppProviders,
  SessionProvider,
  createQueryClient,
  useSession,
} from './session/SessionProvider.js';
import { ANONYMOUS_MENUS, MenuBar, SESSION_MENUS, SessionContext } from './AppShell.js';
import { SignInPage } from './pages/SignInPage.js';
import { AccountsPage } from './pages/AccountsPage.js';
import { ConnectionsPage } from './pages/ConnectionsPage.js';
import { ExportPage, ImportPage } from './pages/TransferPages.js';
import './styles.css';

/**
 * Application entry point.
 *
 * The chrome, and therefore the menus, are present whether or not anyone has
 * signed in. Managing connections is a thing a person does in order to be able
 * to sign in at all, so it cannot sit behind the session guard.
 */

const queryClient = createQueryClient();

/**
 * The sign-in screen, which gets out of the way once there is a session.
 *
 * Without this, signing in leaves the person looking at the form that just
 * worked, because nothing told the router to move.
 */
function SignInRoute(): ReactNode {
  const { state } = useSession();
  return state.status === 'authenticated' ? <Navigate to="/accounts" replace /> : <SignInPage />;
}

function Layout(): ReactNode {
  const { state, signOut } = useSession();
  const authenticated = state.status === 'authenticated';

  if (state.status === 'loading') {
    return (
      <div className="shell">
        <MenuBar menus={ANONYMOUS_MENUS} context={null} />
        <main className="shell__main">
          <p className="spinner">Loading...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <MenuBar
        menus={authenticated ? SESSION_MENUS : ANONYMOUS_MENUS}
        context={
          authenticated ? (
            <SessionContext onSignOut={() => void signOut()} />
          ) : (
            <span className="shell__context-note">Not signed in</span>
          )
        }
      />
      <main className="shell__main">
        <Routes>
          {/* Reachable without signing in: this is how you get somewhere to sign in to. */}
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/connections/import" element={<ImportPage />} />
          <Route path="/connections/export" element={<ExportPage />} />
          <Route path="/login" element={<SignInRoute />} />
          <Route path="/" element={<Navigate to={authenticated ? '/accounts' : '/login'} replace />} />

          {/* The rest needs a session. */}
          <Route
            path="/accounts"
            element={authenticated ? <AccountsPage /> : <Navigate to="/login" replace />}
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
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
          <Layout />
        </BrowserRouter>
      </SessionProvider>
    </AppProviders>
  </StrictMode>,
);
