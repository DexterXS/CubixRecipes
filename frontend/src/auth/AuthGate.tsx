import { useEffect, useState } from 'react';
import { getCurrentUser, getGoogleLoginUrl, logoutCurrentUser } from '../services/api';
import { AuthMeResponse, AuthUser } from '../types';

interface AuthGateProps {
  children: (user: AuthUser, onLogout: () => Promise<void>) => JSX.Element;
}

export function AuthGate({ children }: AuthGateProps) {
  const [auth, setAuth] = useState<AuthMeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshAuth() {
    setLoading(true);
    setError(null);
    try {
      setAuth(await getCurrentUser());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await logoutCurrentUser();
    setAuth((current) => current ? { ...current, authenticated: false, user: null } : current);
  }

  useEffect(() => {
    void refreshAuth();
  }, []);

  if (loading) {
    return <main className="auth-shell"><div className="auth-panel"><strong>CubixRecipes</strong><span>Checking account...</span></div></main>;
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
