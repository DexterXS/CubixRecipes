import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './pages/App';
import './styles.css';
import { installConsoleCapture } from './services/debugLog';
import { AuthGate } from './auth/AuthGate';

installConsoleCapture();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>
      {(user, onLogout) => <App authUser={user} onLogout={onLogout} />}
    </AuthGate>
  </React.StrictMode>
);
