import type { CSSProperties, ReactNode } from 'react';
import { defaultIconSurfaceSettings, defaultMobileIconSurfaceSettings, iconSurfaceDefinitions, type IconCenterMode, type IconSurfaceId, type IconSurfaceSettings, type IconSurfaceSettingsMap, normalizeIconSurfaceSettings } from './iconSurfaces';
import './IconSettingsPanel.css';

type IconSettingsPanelProps = {
  profile: 'desktop' | 'mobile';
  settings: IconSurfaceSettingsMap;
  renderSampleIcon: () => ReactNode;
  onProfileChange: (profile: 'desktop' | 'mobile') => void;
  onChange: (surfaceId: IconSurfaceId, next: IconSurfaceSettings) => void;
  onResetAll: () => void;
};

const modes: Array<{ value: IconCenterMode; label: string }> = [
  { value: 'grid', label: 'grid' },
  { value: 'absolute', label: 'absolute' },
  { value: 'wrapper', label: 'wrapper' },
  { value: 'scale', label: 'scale' }
];

export function IconSettingsPanel({ profile, settings, renderSampleIcon, onProfileChange, onChange, onResetAll }: IconSettingsPanelProps) {
  const defaults = profile === 'mobile' ? defaultMobileIconSurfaceSettings : defaultIconSurfaceSettings;
  const normalized = normalizeIconSurfaceSettings(settings, defaults);

  return (
    <div className="icon-settings-panel" aria-label="icon-settings-panel">
      <section className="settings-section">
        <div className="settings-section-title compact">
          <div>
            <h3>Иконки интерфейса</h3>
            <span>Профили ПК и телефона сохраняются отдельно. Новая поверхность добавляется в реестр и автоматически появляется здесь.</span>
            <div className="icon-settings-profile-tabs" aria-label="icon-settings-profile-tabs">
              <button
                type="button"
                className={profile === 'desktop' ? 'active' : ''}
                aria-label="icon-settings-profile-desktop"
                onClick={() => onProfileChange('desktop')}
              >
                ПК
              </button>
              <button
                type="button"
                className={profile === 'mobile' ? 'active' : ''}
                aria-label="icon-settings-profile-mobile"
                onClick={() => onProfileChange('mobile')}
              >
                Телефон
              </button>
            </div>
          </div>
          <button type="button" className="secondary-button" aria-label="icon-settings-reset-all" onClick={onResetAll}>
            Сбросить профиль
          </button>
        </div>
        <div className="icon-settings-list">
          {iconSurfaceDefinitions.map((surface) => {
            const value = normalized[surface.id];
            const previewStyle = {
              '--preview-cell': `${value.cell}px`,
              '--preview-icon': `${value.icon}px`,
              '--preview-gap': `${value.gap}px`,
              '--preview-scale': `${value.icon / 32}`
            } as CSSProperties;

            const patch = (partial: Partial<IconSurfaceSettings>) => {
              onChange(surface.id, normalizeIconSurfaceSettings({
                ...normalized,
                [surface.id]: { ...value, ...partial }
              })[surface.id]);
            };

            return (
              <article key={surface.id} className="icon-settings-card" aria-label={`icon-surface-${surface.id}`}>
                <div className="icon-settings-preview-column">
                  <span className={`icon-settings-preview icon-preview-${value.mode}`} style={previewStyle}>
                    <span className="icon-settings-preview-content">{renderSampleIcon()}</span>
                  </span>
                  <code>{value.cell}px / {value.icon}px</code>
                </div>
                <div className="icon-settings-controls">
                  <div className="icon-settings-card-title">
                    <strong>{surface.label}</strong>
                    <span>{surface.description}</span>
                  </div>
                  <label className="icon-settings-range">
                    <span>Ячейка</span>
                    <input
                      aria-label={`icon-${surface.id}-cell`}
                      type="range"
                      min={surface.minCell}
                      max={surface.maxCell}
                      value={value.cell}
                      onChange={(event) => patch({ cell: Number(event.target.value) })}
                    />
                    <output>{value.cell}px</output>
                  </label>
                  <label className="icon-settings-range">
                    <span>Иконка</span>
                    <input
                      aria-label={`icon-${surface.id}-icon`}
                      type="range"
                      min={surface.minIcon}
                      max={surface.maxIcon}
                      value={value.icon}
                      onChange={(event) => patch({ icon: Number(event.target.value) })}
                    />
                    <output>{value.icon}px</output>
                  </label>
                  <label className="icon-settings-range">
                    <span>Gap</span>
                    <input
                      aria-label={`icon-${surface.id}-gap`}
                      type="range"
                      min={0}
                      max={24}
                      value={value.gap}
                      onChange={(event) => patch({ gap: Number(event.target.value) })}
                    />
                    <output>{value.gap}px</output>
                  </label>
                  <div className="icon-settings-mode-row" aria-label={`icon-${surface.id}-mode`}>
                    {modes.map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        className={value.mode === mode.value ? 'active' : ''}
                        aria-label={`icon-${surface.id}-mode-${mode.value}`}
                        onClick={() => patch({ mode: mode.value })}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`icon-${surface.id}-reset`}
                    onClick={() => onChange(surface.id, defaults[surface.id])}
                  >
                    Сбросить поверхность
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
