import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './pages/App';
import './styles.css';
import './styles/nei.css';
import './styles/mobile.css';
import './styles/mobile-craft-icons.css';
import './styles/mobile-shell.css';
import './styles/cubixcraft.css';
import './styles/item-database.css';
import { installConsoleCapture } from './services/debugLog';
import { AuthGate } from './auth/AuthGate';
import { ServerSelect } from './auth/ServerSelect';
import { VersionReloadBanner } from './components/VersionReloadBanner';
import { CubixCraftWorkspace } from './features/cubixcraft/CubixCraftWorkspace';
import { ItemDatabasePage } from './features/item-database/ItemDatabasePage';
import { installCubixCraftActiveStarClickFix } from './features/cubixcraft/activeStarClickFix';
import { installCubixCraftArchivedPositionFix } from './features/cubixcraft/archivedPositionFix';
import { installCubixCraftActiveVariants } from './features/cubixcraft/activeVariantOverlay';
import { installCubixCraftDraftVariants } from './features/cubixcraft/draftVariantOverlay';
import { installCompactCubixAmounts } from './features/cubixcraft/compactAmountOverlay';
import { installCubixVariantInteractionFix } from './features/cubixcraft/variantInteractionFix';
import { installCubixCraftVariantDelete } from './features/cubixcraft/variantDeleteOverlay';
import { AuthUser } from './types';

installConsoleCapture();
installCubixCraftActiveStarClickFix();
installCubixCraftArchivedPositionFix();
installCubixCraftActiveVariants();
installCubixCraftDraftVariants();
installCompactCubixAmounts();
installCubixVariantInteractionFix();
installCubixCraftVariantDelete();

interface ServerGateProps {
  authUser: AuthUser;
  onLogout: () => Promise<void>;
}

type SpecialWorkspace = 'cubixcraft' | 'itemdb' | null;

function getSpecialWorkspace(): SpecialWorkspace {
  const value = new URLSearchParams(window.location.search).get('workspace');
  return value === 'cubixcraft' || value === 'itemdb' ? value : null;
}

function ServerGate({ authUser, onLogout }: ServerGateProps) {
  const [selectedServer, setSelectedServer] = useState<string | null>(() =>
    window.localStorage.getItem('active_server_id')
  );
  const [specialWorkspace, setSpecialWorkspace] = useState<SpecialWorkspace>(getSpecialWorkspace);
  const cubixCraftOpen = specialWorkspace === 'cubixcraft';
  const itemDatabaseOpen = specialWorkspace === 'itemdb';

  useEffect(() => {
    const sync = () => setSpecialWorkspace(getSpecialWorkspace());
    const handleWorkspaceChange = (event: Event) => {
      const detail = (event as CustomEvent<{ workspace?: SpecialWorkspace }>).detail;
      setSpecialWorkspace(detail?.workspace ?? getSpecialWorkspace());
    };
    const handleLegacyCubixCraftChange = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      if (detail?.active) setSpecialWorkspace('cubixcraft');
      else setSpecialWorkspace(getSpecialWorkspace());
    };
    window.addEventListener('popstate', sync);
    window.addEventListener('app-workspace-change', handleWorkspaceChange as EventListener);
    window.addEventListener('cubixcraft-workspace-change', handleLegacyCubixCraftChange as EventListener);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('app-workspace-change', handleWorkspaceChange as EventListener);
      window.removeEventListener('cubixcraft-workspace-change', handleLegacyCubixCraftChange as EventListener);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('cubixcraft-integrated', cubixCraftOpen);
    document.body.classList.toggle('itemdb-integrated', itemDatabaseOpen);
    return () => {
      document.body.classList.remove('cubixcraft-integrated');
      document.body.classList.remove('itemdb-integrated');
    };
  }, [cubixCraftOpen, itemDatabaseOpen]);

  const handleSelectServer = (serverId: string) => {
    window.localStorage.setItem('active_server_id', serverId);
    setSelectedServer(serverId);
  };

  const handleResetServer = () => {
    window.localStorage.removeItem('active_server_id');
    setSelectedServer(null);
  };

  if (!selectedServer) {
    return <ServerSelect authUser={authUser} onSelect={handleSelectServer} />;
  }

  return (
    <>
      <VersionReloadBanner />
      <App
        authUser={authUser}
        onLogout={onLogout}
        onResetServer={handleResetServer}
        activeServerId={selectedServer}
      />
      {cubixCraftOpen ? (
        <div className="cubixcraft-embedded">
          <CubixCraftWorkspace />
        </div>
      ) : null}
      {itemDatabaseOpen ? (
        <div className="item-db-embedded">
          <ItemDatabasePage />
        </div>
      ) : null}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>
      {(user, onLogout) => <ServerGate authUser={user} onLogout={onLogout} />}
    </AuthGate>
  </React.StrictMode>
);
