import type { UiPreferences } from '../../types';

type DiagnosticsRuntimePanelProps = {
  workspaceTab: string;
  uiPreferences: UiPreferences;
  heldItemRaw: string | null;
  hoveredItemRaw: string | null;
  backendAvailable: boolean;
  lastApiStatus: string;
  textureLoadState: string;
  selectedTextureCount: number;
  totalTextureModCount: number;
  cloudStatus: string;
  recipeDraftTemplateCount: number;
  canSaveActions: boolean;
  canClear: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
};

export function DiagnosticsRuntimePanel({
  workspaceTab,
  uiPreferences,
  heldItemRaw,
  hoveredItemRaw,
  backendAvailable,
  lastApiStatus,
  textureLoadState,
  selectedTextureCount,
  totalTextureModCount,
  cloudStatus,
  recipeDraftTemplateCount,
  canSaveActions,
  canClear,
  canGoBack,
  canGoForward
}: DiagnosticsRuntimePanelProps) {
  return (
    <div className="debug-section-grid">
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Интерфейс</h3>
          <span>Текущие режимы и выбранные состояния.</span>
        </div>
        <div className="kv-grid">
          <div><span>Вкладка</span><strong>{workspaceTab}</strong></div>
          <div><span>Тема</span><strong>{uiPreferences.theme_mode}</strong></div>
          <div><span>Масштаб</span><strong>{Math.round(uiPreferences.ui_scale * 100)}%</strong></div>
          <div><span>Режим редактора</span><strong>{uiPreferences.editor_mode}</strong></div>
          <div><span>В мышке</span><strong>{heldItemRaw ?? 'нет'}</strong></div>
          <div><span>Под курсором</span><strong>{hoveredItemRaw ?? 'нет'}</strong></div>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Загрузки</h3>
          <span>API, облако, иконки и локальные данные.</span>
        </div>
        <div className="kv-grid">
          <div><span>Backend</span><strong>{backendAvailable ? 'online' : 'unavailable'}</strong></div>
          <div><span>API</span><strong>{lastApiStatus}</strong></div>
          <div><span>Texture loader</span><strong>{textureLoadState}</strong></div>
          <div><span>Texture mods</span><strong>{selectedTextureCount}/{totalTextureModCount}</strong></div>
          <div><span>Cloud</span><strong>{cloudStatus || 'idle'}</strong></div>
          <div><span>Шаблонов</span><strong>{recipeDraftTemplateCount}</strong></div>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Кнопки</h3>
          <span>Вычисленные состояния основных действий.</span>
        </div>
        <div className="kv-grid">
          <div><span>Save local</span><strong>{canSaveActions ? 'enabled' : 'disabled'}</strong></div>
          <div><span>Save cloud</span><strong>{canSaveActions ? 'enabled' : 'disabled'}</strong></div>
          <div><span>Save draft</span><strong>{canSaveActions ? 'enabled' : 'disabled'}</strong></div>
          <div><span>Clear</span><strong>{canClear ? 'enabled' : 'disabled'}</strong></div>
          <div><span>Back</span><strong>{canGoBack ? 'enabled' : 'disabled'}</strong></div>
          <div><span>Forward</span><strong>{canGoForward ? 'enabled' : 'disabled'}</strong></div>
        </div>
      </section>
    </div>
  );
}
