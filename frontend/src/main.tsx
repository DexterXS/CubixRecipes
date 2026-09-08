import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './pages/App';
import './styles.css';
import './styles/nei.css';
import './styles/mobile.css';
import './styles/mobile-craft-icons.css';
import './styles/mobile-shell.css';
import './styles/cubixcraft.css';
import { installConsoleCapture } from './services/debugLog';
import { AuthGate } from './auth/AuthGate';
import { ServerSelect } from './auth/ServerSelect';
import { CubixCraftWorkspace } from './features/cubixcraft/CubixCraftWorkspace';
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

function isCubixCraftWorkspace() {
  return new URLSearchParams(window.location.search).get('workspace') === 'cubixcraft';
}

function ServerGate({ authUser, onLogout }: ServerGateProps) {
  const [selectedServer, setSelectedServer] = useState<string | null>(() =>
    window.localStorage.getItem('active_server_id')
  );
  const [cubixCraftOpen, setCubixCraftOpen] = useState(isCubixCraftWorkspace);

  useEffect(() => {
    const sync = () => setCubixCraftOpen(isCubixCraftWorkspace());
    const handleWorkspaceChange = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      setCubixCraftOpen(detail?.active ?? isCubixCraftWorkspace());
    };
    window.addEventListener('popstate', sync);
    window.addEventListener('cubixcraft-workspace-change', handleWorkspaceChange as EventListener);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('cubixcraft-workspace-change', handleWorkspaceChange as EventListener);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('cubixcraft-integrated', cubixCraftOpen);
    return () => document.body.classList.remove('cubixcraft-integrated');
  }, [cubixCraftOpen]);

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
