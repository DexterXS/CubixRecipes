import { createPortal } from 'react-dom';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { IconSettingsProfile } from './IconSurfaceSettingsContext';
import type { IconSurfaceDefinition, IconSurfaceSettings } from './iconSurfaces';

type Props = {
  surface: IconSurfaceDefinition;
  profile: IconSettingsProfile;
  value: IconSurfaceSettings;
  savedValue: IconSurfaceSettings;
  isDirty: boolean;
  isSaving: boolean;
  error: string | null;
  renderSampleIcon?: (surfaceId: IconSurfaceDefinition['id'], settings: IconSurfaceSettings) => ReactNode;
  onChange: (patch: Partial<IconSurfaceSettings>) => void;
  onSave: () => void;
  onCancel: () => void;
  onResetSurface: () => void;
  onResetProfile: () => void;
  onClose: () => void;
};

function rangeControl(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
  ariaLabel: string
) {
  return (
    <label className="icon-settings-field icon-settings-range-field">
      <span>{label}</span>
      <input aria-label={ariaLabel} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <output>{step < 1 ? value.toFixed(2) : `${value}px`}</output>
    </label>
  );
}

export function IconSurfaceSettingsPopover({
  surface,
  profile,
  value,
  savedValue,
  isDirty,
  isSaving,
  error,
  renderSampleIcon,
  onChange,
  onSave,
  onCancel,
  onResetSurface,
  onResetProfile,
  onClose
}: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const firstControlRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      try {
        if (!dialog.open) dialog.showModal();
      } catch {
        dialog.setAttribute('open', '');
      }
    } else {
      dialog.setAttribute('open', '');
    }
    firstControlRef.current?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
    };
  }, []);

  useEffect(() => {
    const handleOutsidePointer = (event: PointerEvent) => {
      const dialog = dialogRef.current;
      if (dialog && !dialog.contains(event.target as Node)) onCancel();
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => document.removeEventListener('pointerdown', handleOutsidePointer);
  }, [onCancel]);

  const previewStyle = {
    '--icon-settings-preview-cell': `${Math.max(56, Math.min(value.cell, 120))}px`,
    '--icon-settings-preview-icon': `${Math.max(24, Math.min(value.icon * value.spriteScale, 82))}px`,
    '--icon-settings-preview-padding': `${value.padding}px`,
    '--icon-settings-preview-border': `${value.borderWidth}px`
  } as CSSProperties;

  const profileLabel = profile === 'mobile' ? 'Телефон' : 'ПК';
  const dialog = (
    <dialog
      ref={dialogRef}
      className={`icon-settings-dialog ${profile === 'mobile' ? 'is-mobile' : ''}`}
      aria-modal="true"
      aria-labelledby="icon-settings-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="icon-settings-dialog-card">
        <header className="icon-settings-dialog-header">
          <div>
            <span className="icon-settings-eyebrow">Настройки иконок · {profileLabel}</span>
            <h2 id="icon-settings-dialog-title">{surface.label}</h2>
            <p>{surface.description}</p>
          </div>
          <button type="button" className="icon-settings-close" aria-label="Закрыть настройки иконок" onClick={onCancel}>×</button>
        </header>

        <div className="icon-settings-dialog-body">
          <section className="icon-settings-live-preview" aria-label="Предпросмотр настроек">
            <div className="icon-settings-preview-surface" style={previewStyle}>
              <span className="icon-settings-preview-icon">
                {renderSampleIcon?.(surface.id, value) ?? <span aria-hidden="true">▧</span>}
              </span>
            </div>
            <strong>{isDirty ? 'Есть несохранённые изменения' : 'Сохранено'}</strong>
            <span>Изменения применяются сразу</span>
          </section>

          <div className="icon-settings-control-groups">
            <section className="icon-settings-control-group">
              <h3>Размеры и расстояния</h3>
              {rangeControl('Ячейка', value.cell, surface.minCell, surface.maxCell, 1, (next) => onChange({ cell: next }), `icon-${surface.id}-cell`)}
              {rangeControl('Иконка', value.icon, surface.minIcon, surface.maxIcon, 1, (next) => onChange({ icon: next }), `icon-${surface.id}-icon`)}
              {rangeControl('Масштаб спрайта', value.spriteScale, 0.5, 2.5, 0.05, (next) => onChange({ spriteScale: next }), `icon-${surface.id}-sprite-scale`)}
              <div className="icon-settings-two-columns">
                {rangeControl('Gap X', value.gapX, 0, 24, 1, (next) => onChange({ gapX: next, gap: Math.round((next + value.gapY) / 2) }), `icon-${surface.id}-gap-x`)}
                {rangeControl('Gap Y', value.gapY, 0, 24, 1, (next) => onChange({ gapY: next, gap: Math.round((value.gapX + next) / 2) }), `icon-${surface.id}-gap-y`)}
                {rangeControl('Внутренний отступ', value.padding, 0, 24, 1, (next) => onChange({ padding: next }), `icon-${surface.id}-padding`)}
                {rangeControl('Толщина рамки', value.borderWidth, 0, 4, 1, (next) => onChange({ borderWidth: next }), `icon-${surface.id}-border`)}
              </div>
            </section>

            <section className="icon-settings-control-group">
              <h3>Позиция и отображение</h3>
              <div className="icon-settings-two-columns">
                {rangeControl('Смещение X', value.offsetX, -24, 24, 1, (next) => onChange({ offsetX: next }), `icon-${surface.id}-offset-x`)}
                {rangeControl('Смещение Y', value.offsetY, -24, 24, 1, (next) => onChange({ offsetY: next }), `icon-${surface.id}-offset-y`)}
              </div>
              <label className="icon-settings-field"><span>Выравнивание</span><select aria-label={`icon-${surface.id}-mode`} value={value.mode} onChange={(event) => onChange({ mode: event.target.value as IconSurfaceSettings['mode'] })}><option value="grid">Сетка</option><option value="absolute">Абсолютное</option><option value="wrapper">Обёртка</option><option value="scale">Масштаб</option></select></label>
              <label className="icon-settings-field"><span>Переполнение</span><select aria-label={`icon-${surface.id}-overflow`} value={value.overflow} onChange={(event) => onChange({ overflow: event.target.value as IconSurfaceSettings['overflow'] })}><option value="visible">Показывать</option><option value="clip">Обрезать</option><option value="scroll">Прокрутка</option></select></label>
              <label className="icon-settings-field"><span>Сглаживание</span><select aria-label={`icon-${surface.id}-smoothing`} value={value.smoothing} onChange={(event) => onChange({ smoothing: event.target.value as IconSurfaceSettings['smoothing'] })}><option value="pixelated">Пиксельное</option><option value="smooth">Плавное</option></select></label>
              <div className="icon-settings-checks">
                <label><input type="checkbox" checked={value.groupRows} onChange={(event) => onChange({ groupRows: event.target.checked })} /> Увеличивать зазор между блоками строк</label>
                <label><input type="checkbox" checked={value.groupColumns} onChange={(event) => onChange({ groupColumns: event.target.checked })} /> Увеличивать зазор между блоками колонок</label>
              </div>
            </section>
          </div>
        </div>

        {error ? <div className="icon-settings-error" role="alert">Не удалось сохранить: {error}</div> : null}
        <footer className="icon-settings-dialog-footer">
          <div className="icon-settings-footer-actions">
            <button type="button" className="ghost-button" onClick={onResetSurface}>Сбросить поверхность</button>
            <button type="button" className="ghost-button" onClick={onResetProfile}>Сбросить профиль</button>
            <span className="icon-settings-saved-hint">Последнее сохранение: {savedValue.cell}px / {savedValue.icon}px</span>
          </div>
          <div className="icon-settings-footer-actions">
            <button type="button" className="secondary-button" onClick={onCancel}>Отмена</button>
            <button type="button" className="primary-button" disabled={!isDirty || isSaving} onClick={onSave}>{isSaving ? 'Сохраняю…' : 'Сохранить глобально'}</button>
          </div>
        </footer>
      </div>
    </dialog>
  );

  return typeof document === 'undefined' ? null : createPortal(dialog, document.body);
}
