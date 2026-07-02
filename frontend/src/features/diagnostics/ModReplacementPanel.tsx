import type { DragEvent, ReactNode } from 'react';
import { Panel } from '../../components/Panel';

type ModReplacementLanguage = 'ru' | 'en';

export type ModReplacementItem = {
  raw: string;
  display_name: string | null;
  icon_url: string | null;
  animated: boolean;
};

export type ModReplacementModSummary = {
  modid: string;
  itemCount: number;
};

type ModReplacementPanelProps = {
  language: ModReplacementLanguage;
  mods: ModReplacementModSummary[];
  selectedMod: string;
  items: ModReplacementItem[];
  mappings: Record<string, string>;
  loading: boolean;
  status: string;
  heldItemRaw: string | null;
  neiPanel: ReactNode;
  renderItemIcon: (raw: string, iconUrl?: string | null, animated?: boolean, frameTime?: number, title?: string) => ReactNode;
  resolveItemTitle: (raw: string) => string;
  getCachedItemIconUrl: (raw: string) => string | null;
  onSelectedModChange: (modid: string) => void;
  onMappingChange: (raw: string, mapped: string) => void;
  onHeldItemChange: (raw: string | null) => void;
  onReplace: () => void;
};

export function ModReplacementPanel({
  language,
  mods,
  selectedMod,
  items,
  mappings,
  loading,
  status,
  heldItemRaw,
  neiPanel,
  renderItemIcon,
  resolveItemTitle,
  getCachedItemIconUrl,
  onSelectedModChange,
  onMappingChange,
  onHeldItemChange,
  onReplace
}: ModReplacementPanelProps) {
  const isRu = language === 'ru';

  return (
    <div className="workspace-layout workspace-layout-admin" style={{ display: 'flex', gap: '16px', height: 'calc(100vh - 120px)' }}>
      <div className="workspace-column workspace-left" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Panel title={isRu ? 'Замена модификации' : 'Mod Replacement'} subtitle={isRu ? 'Позволяет массово заменить все предметы выбранного мода на новые аналоги в рецептах' : 'Allows bulk replacing all items of the selected mod with new counterparts in recipes'}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ marginBottom: '16px' }}>
              <label className="field-block">
                <span>{isRu ? 'Выберите модификацию для замены:' : 'Select modification to replace:'}</span>
                <select
                  value={selectedMod}
                  onChange={(event) => onSelectedModChange(event.target.value)}
                  style={{ width: '100%', padding: '8px', background: 'var(--surface-sunken)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}
                >
                  <option value="">-- {isRu ? 'Выберите мод' : 'Select mod'} --</option>
                  {mods.map((mod) => (
                    <option key={mod.modid} value={mod.modid}>
                      {mod.modid} ({mod.itemCount} {isRu ? 'предм.' : 'items'})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {status ? (
              <div className="inline-status inline-status-default" style={{ marginBottom: '16px' }}>
                <span>{status}</span>
              </div>
            ) : null}

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '4px', background: 'var(--surface-sunken)', minHeight: '300px' }}>
              {items.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {selectedMod ? (isRu ? 'Нет предметов этого мода в рецептах.' : 'No items of this mod found in recipes.') : (isRu ? 'Выберите мод для сканирования.' : 'Select a mod to scan.')}
                </div>
              ) : (
                <table className="case-alias-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ padding: '8px' }}>{isRu ? 'Оригинальный предмет' : 'Original Item'}</th>
                      <th style={{ padding: '8px', width: '40px', textAlign: 'center' }}></th>
                      <th style={{ padding: '8px' }}>{isRu ? 'Новый предмет (замена)' : 'New Item (replacement)'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const mapped = mappings[item.raw] || '';

                      const handleSlotClick = () => {
                        if (heldItemRaw) {
                          onMappingChange(item.raw, heldItemRaw);
                          onHeldItemChange(null);
                        } else if (mapped) {
                          onHeldItemChange(mapped);
                          onMappingChange(item.raw, '');
                        }
                      };

                      const handleSlotDrop = (event: DragEvent<HTMLDivElement>) => {
                        event.preventDefault();
                        const value = event.dataTransfer.getData('text/plain');
                        if (value) {
                          onMappingChange(item.raw, value);
                        }
                      };

                      return (
                        <tr key={item.raw} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '8px', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="output-icon-slot" style={{ display: 'inline-flex', padding: 0, border: 'none', background: 'transparent' }}>
                                {renderItemIcon(item.raw, item.icon_url, item.animated, 1, item.display_name || item.raw)}
                              </span>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <strong>{item.display_name || item.raw}</strong>
                                <code style={{ fontSize: '11px', opacity: 0.7 }}>{item.raw}</code>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', verticalAlign: 'middle', fontSize: '18px', color: 'var(--text-muted)' }}>
                            →
                          </td>
                          <td style={{ padding: '8px', verticalAlign: 'middle' }}>
                            <div
                              className={`output-icon-slot ${mapped ? 'has-item' : 'is-empty-placeholder'}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                border: mapped ? '1px solid var(--border-subtle)' : '2px dashed var(--border-subtle)',
                                borderRadius: '4px',
                                background: mapped ? 'var(--surface-sunken)' : 'transparent',
                                padding: '4px',
                                minWidth: '34px',
                                minHeight: '34px',
                                verticalAlign: 'middle',
                                userSelect: 'none'
                              }}
                              onClick={handleSlotClick}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                onMappingChange(item.raw, '');
                              }}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={handleSlotDrop}
                              title={mapped ? (isRu ? 'Нажмите чтобы взять, правый клик чтобы очистить' : 'Click to pick up, right-click to clear') : (isRu ? 'Положите предмет из NEI сюда' : 'Drop item from NEI here')}
                            >
                              {mapped ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {renderItemIcon(mapped, getCachedItemIconUrl(mapped), false, 1, resolveItemTitle(mapped))}
                                  <span style={{ fontSize: '13px' }}>{resolveItemTitle(mapped) || mapped}</span>
                                </div>
                              ) : (
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{isRu ? 'Пусто' : 'Empty'}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="primary-button"
                disabled={loading || items.length === 0}
                onClick={onReplace}
                style={{ padding: '10px 20px', fontWeight: 'bold' }}
              >
                {loading ? (isRu ? 'Замена...' : 'Replacing...') : (isRu ? 'Заменить все предметы в рецептах' : 'Replace all items in recipes')}
              </button>
            </div>
          </div>
        </Panel>
      </div>
      <div className="workspace-column workspace-right" style={{ width: '380px', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {neiPanel}
      </div>
    </div>
  );
}
