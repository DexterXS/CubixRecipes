import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './pages/App';
import './styles.css';
import './styles/nei.css';
import './styles/mobile.css';
import './styles/mobile-craft-icons.css';
import './styles/mobile-shell.css';
import { installConsoleCapture } from './services/debugLog';
import { AuthGate } from './auth/AuthGate';
import { ServerSelect } from './auth/ServerSelect';
import { AuthUser } from './types';

installConsoleCapture();

interface ServerGateProps {
  authUser: AuthUser;
  onLogout: () => Promise<void>;
}

function ServerGate({ authUser, onLogout }: ServerGateProps) {
  const [selectedServer, setSelectedServer] = useState<string | null>(() =>
    window.localStorage.getItem('active_server_id')
  );

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
    <App
      authUser={authUser}
      onLogout={onLogout}
      onResetServer={handleResetServer}
      activeServerId={selectedServer}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>
      {(user, onLogout) => <ServerGate authUser={user} onLogout={onLogout} />}
    </AuthGate>
  </React.StrictMode>
);

