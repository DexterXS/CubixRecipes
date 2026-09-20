import { useEffect, useState } from 'react';
import { getCurrentUser, getGoogleLoginUrl, logoutCurrentUser } from '../services/api';
import { AuthMeResponse, AuthUser } from '../types';

const AUTH_SESSION_CACHE_KEY = 'cubixrecipes:auth-session-v1';

interface AuthGateProps {
  children: (user: AuthUser, onLogout: () => Promise<void>) => JSX.Element;
}

function readCachedAuth(): AuthMeResponse | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(AUTH_SESSION_CACHE_KEY) ?? 'null') as AuthMeResponse | null;
    if (!parsed?.authenticated || !parsed.user?.email || !parsed.user.role) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistAuth(auth: AuthMeResponse): void {
  try {
    if (auth.authenticated && auth.user) {
      window.sessionStorage.setItem(AUTH_SESSION_CACHE_KEY, JSON.stringify(auth));
    } else {
      window.sessionStorage.removeItem(AUTH_SESSION_CACHE_KEY);
    }
  } catch {
    // Session cache is best-effort and never replaces server validation.
  }
}

export function AuthGate({ children }: AuthGateProps) {
  const [auth, setAuth] = useState<AuthMeResponse | null>(() => readCachedAuth());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => readCachedAuth() === null);

  async function refreshAuth() {
    setLoading((current) => current && auth === null);
    setError(null);
    try {
      const nextAuth = await getCurrentUser();
      setAuth(nextAuth);
      persistAuth(nextAuth);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await logoutCurrentUser();
    try {
      window.sessionStorage.removeItem(AUTH_SESSION_CACHE_KEY);
    } catch {
      // Ignore unavailable browser storage.
    }
    setAuth((current) => current ? { ...current, authenticated: false, user: null } : current);
  }

  useEffect(() => {
    void refreshAuth();
  }, []);

  if (loading) {
    return <main className="auth-shell"><div className="auth-panel"><strong>CubixRecipes</strong><span>Checking account...</span></div></main>;
  }

  if (auth?.authenticated && auth.user && auth.access_allowed === false) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div>
            <strong>CubixRecipes</strong>
            <p>Доступ закрыт: ваш аккаунт не добавлен в whitelist.</p>
          </div>
          <div className="inline-hint inline-hint-warning">{auth.user.email}</div>
          <button type="button" onClick={() => void handleLogout()}>Выйти</button>
        </section>
      </main>
    );
  }

  if (auth?.authenticated && auth.user) {
    return children(auth.user, handleLogout);
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div>
          <strong>CubixRecipes</strong>
          <p>Google sign-in is required to use this app.</p>
        </div>
        {auth && !auth.auth_configured ? (
          <div className="inline-hint inline-hint-warning">
            Auth is not configured. Check Railway env: DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SESSION_SECRET, APP_PUBLIC_URL, FRONTEND_PUBLIC_URL.
            {auth.configuration_error ? <><br />{auth.configuration_error}</> : null}
          </div>
        ) : null}
        {error ? <div className="inline-hint inline-hint-warning">{error}</div> : null}
        <button type="button" onClick={() => { window.location.href = getGoogleLoginUrl(); }}>Sign in with Google</button>
      </section>
    </main>
  );
}
