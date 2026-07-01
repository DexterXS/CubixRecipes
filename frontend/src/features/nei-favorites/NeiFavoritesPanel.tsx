import { type ReactNode, useState } from 'react';

import { Panel } from '../../components/Panel';
import { type NeiFavoriteTab, type NeiFavoritesProfile } from '../../types';

interface NeiFavoritesPanelProps {
  profile: NeiFavoritesProfile;
  activeTab: NeiFavoriteTab;
  status: string;
  hiddenPatternsDraft: string;
  newTabName: string;
  renderFavoriteItem: (raw: string) => ReactNode;
  onSelectTab: (tabId: string) => void;
  onRenameActiveTab: (name: string) => void;
  onNewTabNameChange: (name: string) => void;
  onAddTab: () => void;
  onDeleteActiveTab: () => void;
  onFavoriteHotkeyChange: (value: string) => void;
  onHiddenPatternsChange: (value: string) => void;
}

export function NeiFavoritesPanel({
  profile,
  activeTab,
  status,
  hiddenPatternsDraft,
  newTabName,
  renderFavoriteItem,
  onSelectTab,
  onRenameActiveTab,
  onNewTabNameChange,
  onAddTab,
  onDeleteActiveTab,
  onFavoriteHotkeyChange,
  onHiddenPatternsChange
}: NeiFavoritesPanelProps) {
  const [creatingTab, setCreatingTab] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleAddTab = () => {
    onAddTab();
    setCreatingTab(false);
  };

  return (
    <div className="workspace-panel-shell panel-nei-favorites">
      <Panel title="Избранное NEI" subtitle={`Хоткей: ${profile.favoriteHotkey || 'A'}`} className="nei-favorites-panel">
        <div className="favorite-panel-toolbar">
          <div className="favorite-browser-tabs" role="tablist" aria-label="favorite-tabs">
            {profile.tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tab.id === profile.activeTabId}
                className={`favorite-browser-tab ${tab.id === profile.activeTabId ? 'active' : ''}`.trim()}
                onClick={() => onSelectTab(tab.id)}
              >
                <span>{tab.name}</span>
                <strong>{tab.items.length}</strong>
              </button>
            ))}
            <button
              type="button"
              className="favorite-browser-tab favorite-browser-tab-add"
              aria-label="favorite-add-tab-open"
              onClick={() => setCreatingTab(true)}
            >
              +
            </button>
          </div>
          <div className="favorite-settings-menu">
            <button
              type="button"
              className="favorite-settings-trigger"
              aria-label="favorite-settings-menu"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((current) => !current)}
            >
              ...
            </button>
            {settingsOpen ? (
              <div className="favorite-settings-panel">
              <label className="field-block">
                <span>Название вкладки</span>
                <input
                  aria-label="favorite-active-tab-name"
                  type="text"
                  value={activeTab.name}
                  onChange={(event) => onRenameActiveTab(event.target.value)}
                />
              </label>
              <label className="field-block">
                <span>Хоткей избранного</span>
                <input
                  aria-label="nei-favorite-hotkey-panel"
                  type="text"
                  value={profile.favoriteHotkey}
                  onChange={(event) => onFavoriteHotkeyChange(event.target.value)}
                  placeholder="A или Ctrl+A"
                />
              </label>
              <label className="field-block">
                <span>Скрывать из NEI</span>
                <textarea
                  aria-label="nei-hidden-patterns-panel"
                  rows={4}
                  value={hiddenPatternsDraft}
                  onChange={(event) => onHiddenPatternsChange(event.target.value)}
                  placeholder="<mod:item> или часть имени"
                />
              </label>
              <div className="favorite-settings-actions">
                <button
                  type="button"
                  className="ghost-button danger-lite-button"
                  aria-label="favorite-delete-tab"
                  disabled={profile.tabs.length <= 1}
                  onClick={onDeleteActiveTab}
                >
                  Удалить вкладку
                </button>
              </div>
              </div>
            ) : null}
          </div>
        </div>

        {creatingTab ? (
          <div className="favorite-create-tab">
            <input
              aria-label="favorite-new-tab-name"
              type="text"
              value={newTabName}
              onChange={(event) => onNewTabNameChange(event.target.value)}
              placeholder="Название новой вкладки"
              autoFocus
            />
            <button type="button" className="secondary-button" aria-label="favorite-add-tab" onClick={handleAddTab}>
              Создать
            </button>
            <button type="button" className="ghost-button" onClick={() => setCreatingTab(false)}>
              Отмена
            </button>
          </div>
        ) : null}

        <div className="favorite-help-line">
          <span>Наведи или удержи предмет для информации</span>
          <strong>{activeTab.items.length}</strong>
        </div>
        <div className="favorite-items nei-list" aria-label="nei-favorites-items">
          {activeTab.items.length ? activeTab.items.map((item) => renderFavoriteItem(item.raw)) : (
            <div className="favorite-empty">Пока пусто</div>
          )}
        </div>
        {status ? <div className="inline-status inline-status-default">{status}</div> : null}
      </Panel>
    </div>
  );
}
