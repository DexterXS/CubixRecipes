import type { NeiFavoritesProfile, UiPreferences, UiScale } from '../../types';

type BooleanRecord = Record<string, boolean>;

type AppSettingsModalProps = {
  open: boolean;
  uiPreferences: UiPreferences;
  canManageSettings: boolean;
  canUseNeiFavorites: boolean;
  sharedCraftDraftEnabled: boolean;
  isHotkeyDebugEnabled: boolean;
  debugFilters: BooleanRecord;
  debugLevelFilters: BooleanRecord;
  debugCategoryLabels: Record<string, string>;
  debugLevelLabels: Record<string, string>;
  neiFavorites: NeiFavoritesProfile;
  neiHiddenPatternsDraft: string;
  onClose: () => void;
  onUiScaleChange: (value: UiScale) => void;
  onNeiPageSizeChange: (value: number) => void;
  onSharedCraftDraftChange: (enabled: boolean) => void;
  onHotkeyDebugEnabledChange: (enabled: boolean) => void;
  onDebugFilterChange: (category: string, enabled: boolean) => void;
  onDebugLevelChange: (level: string, enabled: boolean) => void;
  onFavoriteHotkeyChange: (value: string) => void;
  onHiddenPatternsChange: (value: string) => void;
};

const neiPageSizeOptions = [16, 32, 64, 96, 128, 256, 512];

export function AppSettingsModal({
  open,
  uiPreferences,
  canManageSettings,
  canUseNeiFavorites,
  sharedCraftDraftEnabled,
  isHotkeyDebugEnabled,
  debugFilters,
  debugLevelFilters,
  debugCategoryLabels,
  debugLevelLabels,
  neiFavorites,
  neiHiddenPatternsDraft,
  onClose,
  onUiScaleChange,
  onNeiPageSizeChange,
  onSharedCraftDraftChange,
  onHotkeyDebugEnabledChange,
  onDebugFilterChange,
  onDebugLevelChange,
  onFavoriteHotkeyChange,
  onHiddenPatternsChange
}: AppSettingsModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-label="Настройки" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>Настройки</h2>
          <div className="inline-actions">
            <button type="button" onClick={onClose}>Закрыть</button>
          </div>
        </div>
        <div className="settings-modal-body">
          {canManageSettings ? (
            <>
              <label className="field-block settings-scale-control">
                <span>Масштаб интерфейса</span>
                <select aria-label="ui-scale" value={uiPreferences.ui_scale} onChange={(event) => onUiScaleChange(Number(event.target.value) as UiScale)}>
                  <option value={1}>100%</option>
                  <option value={1.15}>115%</option>
                  <option value={1.3}>130%</option>
                  <option value={1.5}>150%</option>
                </select>
              </label>
              <label className="field-block">
                <span>Иконок NEI на страницу</span>
                <select
                  aria-label="nei-page-size"
                  value={uiPreferences.nei_page_size}
                  onChange={(event) => onNeiPageSizeChange(Number(event.target.value))}
                >
                  {neiPageSizeOptions.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
              <label className="switch-field">
                <span>Общий крафтовый стол между серверами</span>
                <input
                  aria-label="shared-craft-draft-enabled"
                  type="checkbox"
                  checked={sharedCraftDraftEnabled}
                  onChange={(event) => onSharedCraftDraftChange(event.target.checked)}
                />
              </label>
              <section className="settings-section">
                <div className="settings-section-title">
                  <h3>Debug режим</h3>
                  <span>События интерфейса, рецепта, API и загрузок видны только админам. Фильтры защищают ленту от лишнего шума.</span>
                </div>
                <label className="switch-field">
                  <span>Включить debug</span>
                  <input
                    aria-label="hotkey-debug-enabled"
                    type="checkbox"
                    checked={isHotkeyDebugEnabled}
                    onChange={(event) => onHotkeyDebugEnabledChange(event.target.checked)}
                  />
                </label>
                <div className="settings-section-title compact">
                  <h3>Категории</h3>
                  <span>{Object.values(debugFilters).filter(Boolean).length}/{Object.keys(debugFilters).length}</span>
                </div>
                <div className="debug-filter-grid">
                  {Object.entries(debugCategoryLabels).map(([category, label]) => (
                    <label key={category} className="view-toggle">
                      <input type="checkbox" checked={Boolean(debugFilters[category])} onChange={(event) => onDebugFilterChange(category, event.target.checked)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <div className="settings-section-title compact">
                  <h3>Уровни</h3>
                  <span>{Object.values(debugLevelFilters).filter(Boolean).length}/{Object.keys(debugLevelFilters).length}</span>
                </div>
                <div className="debug-filter-grid">
                  {Object.entries(debugLevelLabels).map(([level, label]) => (
                    <label key={level} className="view-toggle">
                      <input type="checkbox" checked={Boolean(debugLevelFilters[level])} onChange={(event) => onDebugLevelChange(level, event.target.checked)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </section>
            </>
          ) : null}
          {canUseNeiFavorites ? (
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>NEI избранное и фильтр</h3>
                <span>Сохраняется на backend в data по email пользователя.</span>
              </div>
              <label className="field-block">
                <span>Клавиша избранного</span>
                <input aria-label="nei-favorite-hotkey" type="text" value={neiFavorites.favoriteHotkey} onChange={(event) => onFavoriteHotkeyChange(event.target.value)} placeholder="A или Ctrl+A" />
              </label>
              <label className="field-block">
                <span>Скрывать из NEI</span>
                <textarea
                  aria-label="nei-hidden-patterns"
                  className="compact-textarea"
                  value={neiHiddenPatternsDraft}
                  onChange={(event) => onHiddenPatternsChange(event.target.value)}
                  placeholder={'<botany:pigment:*>\n<mod:item:*>'}
                />
              </label>
              <div className="inline-status inline-status-default">
                <span>Фильтров: {neiFavorites.hiddenPatterns.length}. Вкладок: {neiFavorites.tabs.length}.</span>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
