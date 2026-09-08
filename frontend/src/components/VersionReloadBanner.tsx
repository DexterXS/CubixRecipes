import { useEffect, useRef, useState } from 'react';
import { apiPath, request } from '../services/api/client';

type VersionResponse = { version: string };

export function VersionReloadBanner() {
  const initialVersion = useRef<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkVersion = async () => {
      try {
        const response = await request<VersionResponse>(apiPath('/version'));
        if (cancelled || !response.version || response.version === 'dev') return;
        if (initialVersion.current === null) {
          initialVersion.current = response.version;
          return;
        }
        if (response.version !== initialVersion.current) setUpdateAvailable(true);
      } catch {
        // Deploys can briefly make the backend unavailable. Retry on the next interval.
      }
    };

    void checkVersion();
    const timer = window.setInterval(() => void checkVersion(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 18,
        zIndex: 100000,
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        background: '#111f33',
        border: '1px solid rgba(255,255,255,.16)',
        boxShadow: '0 8px 30px rgba(0,0,0,.35)'
      }}
    >
      <span>Доступна новая версия сайта.</span>
      <button type="button" className="primary-button" onClick={() => window.location.reload()}>
        Перезапустить
      </button>
    </div>
  );
}
