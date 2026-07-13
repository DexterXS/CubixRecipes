import { Panel } from '../../components/Panel';
import type { UiLanguage } from '../../types';

export type ItemPanelModSummary = {
  modid: string;
  itemCount: number;
  loadedCount: number;
  completionText: string;
};

type TextureLoadState = 'idle' | 'running' | 'paused';

type ItemTextureToolsPanelProps = {
  language: UiLanguage;
  title: string;
  subtitle: string;
  modsLabel: string;
  loadSelectedLabel: string;
  stopLabel: string;
  resumeLabel: string;
  cancelLabel: string;
  selectAllLabel: string;
  clearAllLabel: string;
  progressLabel: string;
  iconsLabel: string;
  emptyLabel: string;
  isOpen: boolean;
  loadState: TextureLoadState;
  loadStatus: string;
  mods: ItemPanelModSummary[];
  selectedMods: Record<string, boolean>;
  iconsResolved: number;
  iconTotal: number;
  onToggleOpen: () => void;
  onLoadSelected: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onToggleMod: (modid: string, checked: boolean) => void;
};

export function ItemTextureToolsPanel({
  language,
  title,
  subtitle,
  modsLabel,
  loadSelectedLabel,
  stopLabel,
  resumeLabel,
  cancelLabel,
  selectAllLabel,
  clearAllLabel,
  progressLabel,
  iconsLabel,
  emptyLabel,
  isOpen,
  loadState,
  loadStatus,
  mods,
  selectedMods,
  iconsResolved,
  iconTotal,
  onToggleOpen,
  onLoadSelected,
  onPause,
  onResume,
  onCancel,
  onSelectAll,
  onClearAll,
  onToggleMod
}: ItemTextureToolsPanelProps) {
  const firstSelectedProgress = mods.find((summary) => selectedMods[summary.modid] ?? true)?.completionText ?? '0%';

  return (
    <div className="workspace-panel-shell panel-textures">
      <Panel title={title} subtitle={subtitle} className="texture-panel">
        <div className="texture-toolbar">
          <button type="button" className="secondary-button" aria-expanded={isOpen} onClick={onToggleOpen}>{modsLabel}</button>
          <button type="button" onClick={onLoadSelected} disabled={loadState === 'running' || loadState === 'paused'}>{loadSelectedLabel}</button>
          {loadState === 'running' ? (
            <button type="button" className="ghost-button" onClick={onPause}>{stopLabel}</button>
          ) : null}
          {loadState === 'paused' ? (
            <button type="button" className="ghost-button" onClick={onResume}>{resumeLabel}</button>
          ) : null}
          {loadState !== 'idle' ? (
            <button type="button" className="ghost-button" onClick={onCancel}>{cancelLabel}</button>
          ) : null}
        </div>
        {loadStatus ? <div className="inline-status inline-status-default texture-status-line">{loadStatus}</div> : null}
        <div className="texture-menu-header">
          <strong>{language === 'ru' ? 'Моды' : 'Mods'}</strong>
          <div className="view-menu-actions">
            <button type="button" className="ghost-button" onClick={onSelectAll}>{selectAllLabel}</button>
            <button type="button" className="ghost-button" onClick={onClearAll}>{clearAllLabel}</button>
          </div>
        </div>
        {isOpen && mods.length ? (
          <ul className="toolbar-texture-list texture-list-panel">
            {mods.map((summary) => (
              <li key={summary.modid} className="toolbar-texture-item">
                <label className="view-toggle" aria-label={`select-mod-${summary.modid}`}>
                  <input
                    type="checkbox"
                    checked={selectedMods[summary.modid] ?? true}
                    onChange={(event) => onToggleMod(summary.modid, event.target.checked)}
                  />
                  <span>{summary.modid}</span>
                </label>
                <span>{summary.itemCount}</span>
                <span>{progressLabel}: {summary.completionText}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {isOpen && !mods.length ? <p className="toolbar-texture-empty">{emptyLabel}</p> : null}
        {!isOpen ? (
          <div className="kv-grid">
            <div><span>{language === 'ru' ? 'Модов' : 'Mods'}</span><strong>{mods.length}</strong></div>
            <div><span>{iconsLabel}</span><strong>{iconsResolved}/{iconTotal}</strong></div>
            <div><span>{progressLabel}</span><strong>{firstSelectedProgress}</strong></div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
