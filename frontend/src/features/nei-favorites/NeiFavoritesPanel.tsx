import { type DragEvent, type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';

import { Panel } from '../../components/Panel';
import { type NeiFavoriteTab, type NeiFavoritesProfile } from '../../types';

interface NeiFavoritesPanelProps {
  profile: NeiFavoritesProfile;
  activeTab: NeiFavoriteTab;
  status: string;
  hiddenPatternsDraft: string;
  newTabName: string;
  renderFavoriteItem: (raw: string) => ReactNode;
  renderFavoriteTabIcon?: (raw: string) => ReactNode;
  availableFavoriteRaws?: string[];
  onSelectTab: (tabId: string) => void;
  onRenameActiveTab: (name: string) => void;
  onRenameTab?: (tabId: string, name: string) => void;
  onNewTabNameChange: (name: string) => void;
  onAddTab: () => void;
  onDeleteActiveTab: () => void;
  onFavoriteHotkeyChange: (value: string) => void;
  onHiddenPatternsChange: (value: string) => void;
  onAssignTabIconRaw?: (tabId: string, raw: string | null) => void;
}

export function NeiFavoritesPanel({
  profile,
  activeTab,
  status,
  hiddenPatternsDraft,
  newTabName,
  renderFavoriteItem,
  renderFavoriteTabIcon,
  availableFavoriteRaws = [],
  onSelectTab,
  onRenameActiveTab,
  onRenameTab,
  onNewTabNameChange,
  onAddTab,
  onDeleteActiveTab,
  onFavoriteHotkeyChange,
  onHiddenPatternsChange,
  onAssignTabIconRaw
}: NeiFavoritesPanelProps) {
  const [creatingTab, setCreatingTab] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [iconChangeOpen, setIconChangeOpen] = useState(false);
  const [selectedTabId, setSelectedTabId] = useState(activeTab.id);
  const [contextMenu, setContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const [contextNameDraft, setContextNameDraft] = useState(activeTab.name);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const selectedTab = profile.tabs.find((tab) => tab.id === selectedTabId) ?? activeTab;

  useEffect(() => {
    if (!profile.tabs.some((tab) => tab.id === selectedTabId)) {
      setSelectedTabId(activeTab.id);
    }
  }, [activeTab.id, profile.tabs, selectedTabId]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!contextMenuRef.current?.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu]);

  const iconRawOptions = Array.from(new Set([
    ...availableFavoriteRaws,
    ...(selectedTab.iconRaw ? [selectedTab.iconRaw] : []),
    ...(selectedTab.items[0]?.raw ? [selectedTab.items[0].raw] : [])
  ]));

  const handleSelectTab = (tabId: string) => {
    setSelectedTabId(tabId);
    onSelectTab(tabId);
    setIconChangeOpen(false);
  };

  const handleTabContextMenu = (event: MouseEvent<HTMLButtonElement>, tabId: string) => {
    event.preventDefault();
    const tab = profile.tabs.find((candidate) => candidate.id === tabId) ?? selectedTab;
    setContextNameDraft(tab.name);
    setContextMenu({ tabId, x: event.clientX, y: event.clientY });
  };

  const commitContextName = () => {
    if (!contextMenu || !onRenameTab) return;
    onRenameTab(contextMenu.tabId, contextNameDraft);
  };

  const handleSettingsToggle = () => {
    if (settingsOpen) {
      setIconChangeOpen(false);
    }
    setSettingsOpen((current) => !current);
  };

  const handleTabDragOver = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleTabDrop = (event: DragEvent<HTMLButtonElement>, tabId: string) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('text/plain').trim();
    if (raw) {
      onAssignTabIconRaw?.(tabId, raw);
    }
  };

  const handleIconRawChange = (raw: string) => {
    onAssignTabIconRaw?.(selectedTab.id, raw || null);
  };

  const handleAddTab = () => {
    onAddTab();
    setCreatingTab(false);
  };

  return (
    <div className="workspace-panel-shell panel-nei-favorites">
      <Panel title="Избранное NEI" subtitle={`Хоткей: ${profile.favoriteHotkey || 'A'}`} className="nei-favorites-panel">
        <div className="favorite-panel-toolbar">
          <div className="favorite-browser-tabs" role="tablist" aria-label="favorite-tabs">
            {profile.tabs.map((tab) => {
              const tabIconRaw = tab.iconRaw || tab.items[0]?.raw || null;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-label={tab.name}
                  title={tab.name}
                  aria-selected={tab.id === selectedTab.id}
                  className={`favorite-browser-tab ${tab.id === selectedTab.id ? 'active' : ''} ${iconChangeOpen && tab.id === selectedTab.id ? 'icon-drop-target' : ''}`.trim()}
                  onClick={() => handleSelectTab(tab.id)}
                  onContextMenu={(event) => handleTabContextMenu(event, tab.id)}
                  onDragOver={iconChangeOpen && tab.id === selectedTab.id ? handleTabDragOver : undefined}
                  onDrop={iconChangeOpen && tab.id === selectedTab.id ? (event) => handleTabDrop(event, tab.id) : undefined}
                >
                  {tabIconRaw && renderFavoriteTabIcon ? (
                    <span className="favorite-browser-tab-icon" aria-hidden="true">
                      {renderFavoriteTabIcon(tabIconRaw)}
                    </span>
                  ) : <span className="favorite-browser-tab-placeholder" aria-hidden="true" />}
                  <strong>{tab.items.length}</strong>
                </button>
              );
            })}
            <button
              type="button"
              className="favorite-browser-tab favorite-browser-tab-add"
              aria-label="favorite-add-tab-open"
              onClick={() => setCreatingTab(true)}
            >
              +
            </button>
          </div>
          {contextMenu && onRenameTab ? (() => {
            const contextTab = profile.tabs.find((tab) => tab.id === contextMenu.tabId) ?? selectedTab;
            return (
              <div
                ref={contextMenuRef}
                className="favorite-tab-context-menu"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                role="dialog"
                aria-label="favorite-tab-context-menu"
              >
                <strong>Настройки вкладки</strong>
                <label className="field-block">
                  <span>Имя</span>
                  <input
                    aria-label="favorite-context-tab-name"
                    value={contextNameDraft}
                    onChange={(event) => setContextNameDraft(event.target.value)}
                    onBlur={commitContextName}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitContextName();
                        setContextMenu(null);
                      }
                    }}
                    autoFocus
                  />
                </label>
                <label className="field-block">
                  <span>Иконка из NEI</span>
                  <select
                    aria-label="favorite-context-tab-icon"
                    value={contextTab.iconRaw || ''}
                    onChange={(event) => onAssignTabIconRaw?.(contextTab.id, event.target.value || null)}
                  >
                    <option value="">Первый предмет вкладки</option>
                    {iconRawOptions.map((raw) => <option key={raw} value={raw}>{raw}</option>)}
                  </select>
                </label>
                <div className="favorite-tab-context-actions">
                  <button type="button" className="secondary-button" onClick={() => { handleSelectTab(contextTab.id); setContextMenu(null); }}>
                    Открыть вкладку
                  </button>
                  <button type="button" className="ghost-button" onClick={() => { commitContextName(); setContextMenu(null); }}>
                    Готово
                  </button>
                </div>
              </div>
            );
          })() : null}
          <div className="favorite-settings-menu">
            <button
              type="button"
              className="favorite-settings-trigger"
              aria-label="favorite-settings-menu"
              aria-expanded={settingsOpen}
              onClick={handleSettingsToggle}
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
                  value={selectedTab.name}
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
              {onAssignTabIconRaw ? (
                <div className="favorite-icon-settings">
                  {!iconChangeOpen ? (
                    <button
                      type="button"
                      className="secondary-button"
                      aria-label="favorite-change-tab-icon"
                      onClick={() => setIconChangeOpen(true)}
                    >
                      Сменить иконку
                    </button>
                  ) : (
                    <>
                      <label className="field-block">
                        <span>Иконка вкладки</span>
                        <select
                          aria-label="favorite-active-tab-icon-raw"
                          value={selectedTab.iconRaw || ''}
                          onChange={(event) => handleIconRawChange(event.target.value)}
                        >
                          <option value="">Первый предмет вкладки</option>
                          {iconRawOptions.map((raw) => (
                            <option key={raw} value={raw}>{raw}</option>
                          ))}
                        </select>
                      </label>
                      <div
                        className="favorite-tab-icon-drop-target"
                        role="button"
                        tabIndex={0}
                        aria-label="favorite-tab-icon-drop-target"
                        title="Перетащите raw предмета на вкладку"
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'copy';
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const raw = event.dataTransfer.getData('text/plain').trim();
                          if (raw) {
                            handleIconRawChange(raw);
                          }
                        }}
                      >
                        Перетащите raw предмета на вкладку
                      </div>
                    </>
                  )}
                </div>
              ) : null}
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
          <strong>{selectedTab.items.length}</strong>
        </div>
        <div className="favorite-items nei-list" aria-label="nei-favorites-items">
          {selectedTab.items.length ? selectedTab.items.map((item) => renderFavoriteItem(item.raw)) : (
            <div className="favorite-empty">Пока пусто</div>
          )}
        </div>
        {status ? <div className="inline-status inline-status-default">{status}</div> : null}
      </Panel>
    </div>
  );
}
