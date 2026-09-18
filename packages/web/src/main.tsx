import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppProviders, SessionProvider, useSession, createQueryClient } from './session/SessionProvider.js';
import { AppShell } from './AppShell.js';
import { SignInPage } from './pages/SignInPage.js';
import { AccountsPage } from './pages/AccountsPage.js';
import './styles.css';

/**
 * Application entry point.
 *
 * Routing is guarded in one place: while the session is being resolved nothing
 * is rendered, an anonymous visitor sees the sign-in screen, and an
 * authenticated one gets the shell.
 */

const queryClient = createQueryClient();

function RequireSession({ children }: { readonly children: ReactNode }): ReactNode {
  const { state } = useSession();

  if (state.status === 'loading') {
    return (
      <main className="signin">
        <p className="spinner">Loading session...</p>
      </main>
    );
  }
  if (state.status === 'anonymous') {
    return <SignInPage />;
  }
  return children;
}

function App(): ReactNode {
  return (
    <Routes>
      <Route
        element={
          <RequireSession>
            <AppShell />
          </RequireSession>
        }
      >
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/" element={<Navigate to="/accounts" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
