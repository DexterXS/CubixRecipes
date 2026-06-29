import { type ReactNode, useState } from 'react';

export interface MobileAppMenuTab {
  id: string;
  label: string;
}

interface MobileAppMenuProps {
  appName: string;
  userEmail: string;
  userRole: string;
  serverName?: string | null;
  tabs: MobileAppMenuTab[];
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  onResetServer?: () => void;
  language: 'ru' | 'en';
  canManageSettings: boolean;
  canOpenSettings: boolean;
  onLanguageChange: (language: 'ru' | 'en') => void;
  onOpenSettings: () => void;
  onLogout: () => Promise<void>;
  editorTools?: ReactNode;
}

export function MobileAppMenu({
  appName,
  userEmail,
  userRole,
  serverName,
  tabs,
  activeTab,
  onSelectTab,
  onResetServer,
  language,
  canManageSettings,
  canOpenSettings,
  onLanguageChange,
  onOpenSettings,
  onLogout,
  editorTools
}: MobileAppMenuProps) {
  const [open, setOpen] = useState(false);

  const handleSelectTab = (tabId: string) => {
    onSelectTab(tabId);
    setOpen(false);
  };

  return (
    <div className={`mobile-app-menu ${open ? 'is-open' : ''}`.trim()}>
      <button
        type="button"
        className="mobile-app-menu-button"
        aria-label="mobile-app-menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">☰</span>
      </button>
      {open ? (
        <button
          type="button"
          className="mobile-app-menu-backdrop"
          aria-label="mobile-app-menu-close"
          onClick={() => setOpen(false)}
        />
      ) : null}
      {open ? (
        <aside className="mobile-app-menu-panel" aria-label="mobile-app-navigation">
          <div className="mobile-app-menu-head">
            <div>
              <strong>{appName}</strong>
              <span>{userEmail}</span>
            </div>
            <button type="button" className="ghost-button" onClick={() => setOpen(false)}>x</button>
          </div>

          <section className="mobile-menu-section">
            <span className="mobile-menu-section-title">Разделы</span>
            <div className="mobile-menu-items">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`mobile-menu-item ${activeTab === tab.id ? 'active' : ''}`.trim()}
                  onClick={() => handleSelectTab(tab.id)}
                >
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="mobile-menu-section">
            <span className="mobile-menu-section-title">Сервер</span>
            <div className="mobile-menu-items">
              <div className="mobile-menu-info">
                <span>Активный сервер</span>
                <strong>{serverName || 'не выбран'}</strong>
              </div>
              {onResetServer ? (
                <button type="button" className="mobile-menu-item" onClick={() => { setOpen(false); onResetServer(); }}>
                  <span>Сменить сервер</span>
                </button>
              ) : null}
            </div>
          </section>

          {editorTools ? (
            <section className="mobile-menu-section mobile-menu-editor-tools">
              <span className="mobile-menu-section-title">Редактор</span>
              {editorTools}
            </section>
          ) : null}

          <section className="mobile-menu-section">
            <span className="mobile-menu-section-title">Система</span>
            <div className="mobile-menu-items">
              <div className="mobile-menu-info">
                <span>Пользователь</span>
                <strong>{userRole}</strong>
              </div>
              <label className="mobile-menu-field">
                <span>Язык</span>
                <select disabled={!canManageSettings} value={language} onChange={(event) => onLanguageChange(event.target.value as 'ru' | 'en')}>
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </label>
              {canOpenSettings ? (
                <button type="button" className="mobile-menu-item" onClick={() => { setOpen(false); onOpenSettings(); }}>
                  <span>Настройки</span>
                </button>
              ) : null}
              <button type="button" className="mobile-menu-item mobile-menu-logout" onClick={() => { setOpen(false); void onLogout(); }}>
                <span>Logout</span>
              </button>
            </div>
          </section>
        </aside>
      ) : null}
    </div>
  );
}
