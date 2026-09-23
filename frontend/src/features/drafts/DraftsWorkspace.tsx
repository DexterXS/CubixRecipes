import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react';

import { Panel } from '../../components/Panel';
import { RecipeGrid } from '../../components/RecipeGrid';
import { IconSurfaceSettingsHost } from '../icon-settings/IconSurfaceSettingsHost';
import type { DisplayMode, ItemPanelAtlas, RecipeDraftTemplate } from '../../types';

export type DraftItemAvailability = 'available' | 'missing' | 'unknown';

export type DraftCloudSelectionMode = 'primary-or-single' | 'selected';

export interface DraftCloudSelection {
  itemRaws: string[];
  selectedTemplateIds: string[];
  primaryTemplateIds: Record<string, string>;
  mode: DraftCloudSelectionMode;
}
interface DraftItemSummary {
  raw: string;
  draftCount: number;
  hasNbt: boolean;
}

interface DraftGroupSummary {
  name: string;
  key: string;
  items: DraftItemSummary[];
}

interface Props {
  email: string;
  selectedDraftItemRaw: string | null;
  draftItemEntries: DraftItemSummary[];
  groupedDraftItems: DraftGroupSummary[];
  draftItemSearchQuery: string;
  draftItemSortMode: string;
  draftItemGroupMode: string;
  collapsedDraftGroups: Record<string, boolean>;
  draftItemPage: number;
  draftItemPageCount: number;
  selectedDraftTemplates: RecipeDraftTemplate[];
  itemPanelAtlas?: ItemPanelAtlas | null;
  draftPreviewAtlasUrl: string;
  displayMode: DisplayMode;
  animationsEnabled: boolean;
  canManageCloudFiles: boolean;
  resolveCellTitle: (raw: string) => string;
  renderDraftCatalogIcon: (raw: string) => ReactNode;
  renderCraftItemIcon: (raw: string, iconUrl?: string | null, animated?: boolean, frameTime?: number, title?: string) => ReactNode;
  renderItemTooltip: (raw: string) => ReactNode;
  resolveRecipeGridIconStyle: (raw: string) => CSSProperties | undefined;
  getRecipeAvailability: (raw: string) => DraftItemAvailability;
  onSelectDraftItem: (raw: string) => void;
  onChangeDraftSearch: (value: string) => void;
  onChangeDraftSort: (value: string) => void;
  onChangeDraftGroup: (value: string) => void;
  onChangeDraftPage: (delta: number) => void;
  onToggleDraftGroup: (key: string) => void;
  onOpenDraft: (draft: RecipeDraftTemplate) => void;
  onOpenDraftContextMenu: (draftId: string, x: number, y: number) => void;
  onExportDrafts: (selection: DraftCloudSelection) => void;
  onItemHover?: (raw: string | null) => void;
}

function primaryStorageKey(email: string): string {
  return `cubixrecipes:draft-primary:v1:${encodeURIComponent(email.trim().toLowerCase())}`;
}

function loadPrimaryTemplateIds(email: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(primaryStorageKey(email));
    const value = raw ? JSON.parse(raw) as unknown : null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
    );
  } catch {
    return {};
  }
}

function persistPrimaryTemplateIds(email: string, value: Record<string, string>) {
  try {
    window.localStorage.setItem(primaryStorageKey(email), JSON.stringify(value));
  } catch {
    // Primary draft selection is a best-effort local preference.
  }
}

function draftTemplateDisplayName(draft: RecipeDraftTemplate, resolveCellTitle: (raw: string) => string): string {
  const exactTitle = resolveCellTitle(draft.outputRaw).trim();
  const generatedSuffix = draft.name.match(/(\s+#\d+)\s*$/)?.[1];
  if (!generatedSuffix || !exactTitle || exactTitle === draft.outputRaw) {
    return draft.name;
  }
  return `${exactTitle}${generatedSuffix}`;
}

export function DraftsWorkspace({
  email,
  selectedDraftItemRaw,
  draftItemEntries,
  groupedDraftItems,
  draftItemSearchQuery,
  draftItemSortMode,
  draftItemGroupMode,
  collapsedDraftGroups,
  draftItemPage,
  draftItemPageCount,
  selectedDraftTemplates,
  itemPanelAtlas,
  draftPreviewAtlasUrl,
  displayMode,
  animationsEnabled,
  canManageCloudFiles,
  resolveCellTitle,
  renderDraftCatalogIcon,
  renderCraftItemIcon,
  renderItemTooltip,
  resolveRecipeGridIconStyle,
  getRecipeAvailability,
  onSelectDraftItem,
  onChangeDraftSearch,
  onChangeDraftSort,
  onChangeDraftGroup,
  onChangeDraftPage,
  onToggleDraftGroup,
  onOpenDraft,
  onOpenDraftContextMenu,
  onExportDrafts,
  onItemHover
}: Props) {
  const [selectedItemRaws, setSelectedItemRaws] = useState<string[]>(() => selectedDraftItemRaw ? [selectedDraftItemRaw] : []);
  const [previewDraftTemplateId, setPreviewDraftTemplateId] = useState<string | null>(null);
  const [primaryTemplateIds, setPrimaryTemplateIds] = useState<Record<string, string>>(() => loadPrimaryTemplateIds(email));
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Record<string, boolean>>({});
  const [templatesExpanded, setTemplatesExpanded] = useState(true);
  const [cloudSelectionMode, setCloudSelectionMode] = useState<DraftCloudSelectionMode>('primary-or-single');

  const activeDraftPreview = useMemo(() => (
    selectedDraftTemplates.find((draft) => draft.id === previewDraftTemplateId) ?? selectedDraftTemplates[0] ?? null
  ), [previewDraftTemplateId, selectedDraftTemplates]);

  const selectedTemplateCount = useMemo(
    () => selectedDraftTemplates.filter((draft) => selectedTemplateIds[draft.id]).length,
    [selectedDraftTemplates, selectedTemplateIds]
  );

  const activeGridSize = activeDraftPreview
    ? Math.max(activeDraftPreview.recipe.matrix.length, activeDraftPreview.recipe.matrix[0]?.length ?? 0)
    : 3;
  const activeGridMode = activeGridSize >= 9 ? '9' : '3';
  const selectedTitle = selectedDraftItemRaw ? resolveCellTitle(selectedDraftItemRaw) : 'Предмет не выбран';

  useEffect(() => {
    setPrimaryTemplateIds(loadPrimaryTemplateIds(email));
  }, [email]);

  useEffect(() => {
    persistPrimaryTemplateIds(email, primaryTemplateIds);
  }, [email, primaryTemplateIds]);

  useEffect(() => {
    setTemplatesExpanded(true);
    setPreviewDraftTemplateId(null);
    setSelectedTemplateIds((current) => {
      if (selectedDraftTemplates.some((draft) => current[draft.id])) return current;
      const first = selectedDraftTemplates[0];
      return first ? { ...current, [first.id]: true } : current;
    });
  }, [selectedDraftItemRaw, selectedDraftTemplates]);

  useEffect(() => {
    if (!previewDraftTemplateId || !selectedDraftTemplates.some((draft) => draft.id === previewDraftTemplateId)) {
      setPreviewDraftTemplateId(selectedDraftTemplates[0]?.id ?? null);
    }
  }, [previewDraftTemplateId, selectedDraftTemplates]);

  function handleItemClick(raw: string, additive: boolean) {
    setSelectedItemRaws((current) => {
      if (!additive) return [raw];
      return current.includes(raw) ? current.filter((item) => item !== raw) : [...current, raw];
    });
    onSelectDraftItem(raw);
  }

  function setTemplateSelected(templateId: string, selected: boolean) {
    setSelectedTemplateIds((current) => ({ ...current, [templateId]: selected }));
  }

  function setPrimaryTemplate(template: RecipeDraftTemplate) {
    setPrimaryTemplateIds((current) => ({ ...current, [template.outputRaw]: template.id }));
    setPreviewDraftTemplateId(template.id);
  }

  function isPrimaryTemplate(template: RecipeDraftTemplate): boolean {
    const configured = primaryTemplateIds[template.outputRaw];
    return configured ? configured === template.id : template.id === selectedDraftTemplates[0]?.id;
  }

  function openDraftContextMenu(event: React.MouseEvent, draft: RecipeDraftTemplate) {
    event.preventDefault();
    onOpenDraftContextMenu(draft.id, event.clientX, event.clientY);
  }

  function requestCloudExport(mode: DraftCloudSelectionMode) {
    onExportDrafts({
      itemRaws: selectedItemRaws,
      selectedTemplateIds: Object.entries(selectedTemplateIds).filter(([, selected]) => selected).map(([id]) => id),
      primaryTemplateIds,
      mode
    });
  }

  return (
    <div className="workspace-layout workspace-layout-drafts">
      <div className="workspace-column workspace-left">
        <div className="workspace-panel-shell panel-draft-items">
          <Panel title="Черновики" subtitle="Только предметы с сохранёнными шаблонами" className="draft-items-panel">
            <div className="draft-filter-grid">
              <input aria-label="draft-item-search" type="search" value={draftItemSearchQuery} onChange={(event) => onChangeDraftSearch(event.target.value)} placeholder="Поиск шаблона, mod:item или ID" />
              <select aria-label="draft-item-sort" value={draftItemSortMode} onChange={(event) => onChangeDraftSort(event.target.value)}>
                <option value="date-desc">Сначала новые</option>
                <option value="date-asc">Сначала старые</option>
                <option value="drafts-desc">Сначала больше черновиков</option>
                <option value="drafts-asc">Сначала меньше черновиков</option>
                <option value="name">По названию</option>
              </select>
              <select aria-label="draft-item-group" value={draftItemGroupMode} onChange={(event) => onChangeDraftGroup(event.target.value)}>
                <option value="none">Без группировки</option>
                <option value="mod">По моду</option>
                <option value="author">По персоналу</option>
                <option value="date">По дате</option>
                <option value="grid-size">По типу сетки</option>
              </select>
            </div>
            <div className="nei-pager" aria-label="draft-item-pagination">
              <button type="button" className="ghost-button icon-button" aria-label="draft-items-prev-page" disabled={draftItemPage <= 0} onClick={() => onChangeDraftPage(-1)}>‹</button>
              <strong>{draftItemPage + 1}/{draftItemPageCount}</strong>
              <button type="button" className="ghost-button icon-button" aria-label="draft-items-next-page" disabled={draftItemPage >= draftItemPageCount - 1} onClick={() => onChangeDraftPage(1)}>›</button>
            </div>
            <IconSurfaceSettingsHost surfaceId="draftItems" title="Настроить иконки черновиков">
            <div className="draft-item-list" aria-label="draft-item-list">
              {draftItemEntries.length === 0 ? (
                <div className="draft-empty-state">Нет сохранённых шаблонов.</div>
              ) : groupedDraftItems.map((group) => {
                const isCollapsed = Boolean(collapsedDraftGroups[group.key]);
                return (
                  <div key={group.key} className="draft-item-group">
                    {draftItemGroupMode !== 'none' ? (
                      <button type="button" className={`draft-group-header${isCollapsed ? ' is-collapsed' : ''}`} onClick={() => onToggleDraftGroup(group.key)}>
                        <span className="draft-group-chevron" aria-hidden="true">▼</span>
                        {group.name}
                      </button>
                    ) : null}
                    {!isCollapsed ? (
                      <div className={`draft-group-items${draftItemGroupMode !== 'none' ? ' has-header' : ''}`}>
                        {group.items.map((entry) => {
                          const selected = selectedItemRaws.includes(entry.raw);
                          const availability = getRecipeAvailability(entry.raw);
                          const icon = renderDraftCatalogIcon(entry.raw);
                          return (
                            <button
                              key={entry.raw}
                              type="button"
                              className={`draft-item-button recipe-${availability} ${entry.hasNbt ? 'has-nbt' : 'no-nbt'} ${entry.draftCount > 0 ? 'has-drafts' : ''} ${selected ? 'active' : ''} ${selected && selectedItemRaws.length > 1 ? 'multi-selected' : ''}`.trim()}
                              aria-label={`draft-item-${entry.raw}`}
                              aria-pressed={selected}
                              data-item-raw={entry.raw}
                              onMouseEnter={() => onItemHover?.(entry.raw)}
                              onFocus={() => onItemHover?.(entry.raw)}
                              onMouseLeave={() => onItemHover?.(null)}
                              onBlur={() => onItemHover?.(null)}
                              onClick={(event) => handleItemClick(entry.raw, event.ctrlKey || event.metaKey)}
                            >
                              <span className={`nei-icon ${icon ? 'has-icon' : 'is-loading'}`}>
                                {icon}
                              </span>
                              {entry.draftCount > 0 ? <span className="draft-count-badge">{entry.draftCount}</span> : null}
                              {renderItemTooltip(entry.raw)}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            </IconSurfaceSettingsHost>
            {selectedItemRaws.length ? (
              <div className="draft-selection-bar" aria-label="draft-cloud-selection-bar">
                <strong aria-label="draft-selected-count">Выбрано: {selectedItemRaws.length}</strong>
                <span>Ctrl+клик — мультивыбор</span>
                <select aria-label="draft-cloud-selection-mode" value={cloudSelectionMode} onChange={(event) => setCloudSelectionMode(event.target.value as DraftCloudSelectionMode)}>
                  <option value="primary-or-single">Все ★ / если один рецепт</option>
                  <option value="selected">Только отмеченные рецепты</option>
                </select>
                <button type="button" disabled={!canManageCloudFiles} onClick={() => requestCloudExport(cloudSelectionMode)}>Добавить рецепты в облако</button>
                <button type="button" className="ghost-button icon-button" aria-label="clear-draft-selection" onClick={() => setSelectedItemRaws(selectedDraftItemRaw ? [selectedDraftItemRaw] : [])}>×</button>
              </div>
            ) : null}
          </Panel>
        </div>
      </div>

      <div className="workspace-column workspace-right">
        <div className="workspace-panel-shell panel-draft-templates">
          <Panel title="Шаблоны" subtitle={selectedDraftItemRaw ?? 'Выберите предмет'} className="draft-templates-panel">
            {selectedDraftItemRaw ? (
              <div className="draft-selected-item">
                <IconSurfaceSettingsHost surfaceId="draftSelected" title="Настроить выбранный предмет">
                  <span className="output-icon-slot draft-selected-icon">{renderCraftItemIcon(selectedDraftItemRaw, undefined, false, 1, selectedTitle)}</span>
                </IconSurfaceSettingsHost>
                <div>
                  <strong>{selectedTitle}</strong>
                  <span>{selectedDraftItemRaw}</span>
                </div>
              </div>
            ) : null}
            {selectedDraftTemplates.length ? (
              <>
                {activeDraftPreview ? (
                  <div className="draft-template-preview" aria-label="draft-template-preview">
                    <div className="draft-preview-header">
                      <div className="draft-preview-meta">
                        <strong>{activeDraftPreview.name}</strong>
                        <span>{activeDraftPreview.outputRaw}</span>
                        <small>Создал: {activeDraftPreview.createdByEmail}</small>
                        <small>Обновлён: {new Date(activeDraftPreview.updatedAt).toLocaleString()}</small>
                      </div>
                      <div className="draft-preview-tools">
                        <div className="draft-grid-mode" aria-label="draft-grid-mode">
                          <button type="button" aria-label="draft-grid-mode-3" aria-pressed={activeGridMode === '3'} disabled={activeGridMode === '9'}>3×3</button>
                          <button type="button" aria-label="draft-grid-mode-9" aria-pressed={activeGridMode === '9'} disabled={activeGridMode !== '9'}>9×9</button>
                        </div>
                        <span className="draft-fit-label">Вписать в область</span>
                        <button type="button" className="secondary-button draft-template-edit" aria-label="edit-selected-draft-template" onClick={() => onOpenDraft(activeDraftPreview)}>Редактировать рецепт</button>
                      </div>
                    </div>
                    <IconSurfaceSettingsHost surfaceId={activeGridMode === '9' ? 'draftPreview9' : 'draftPreview'} title="Настроить превью черновика">
                      <div className="draft-preview-grid">
                        <RecipeGrid matrix={activeDraftPreview.recipe.matrix} atlas={itemPanelAtlas} atlasImageUrl={draftPreviewAtlasUrl} displayMode={displayMode} animationsEnabled={animationsEnabled} editorMode="view" tooltipsDisabled extremeGroupGap={3} heldItemRaw={null} resolveCellTitle={resolveCellTitle} resolveIconStyle={resolveRecipeGridIconStyle} onItemHover={() => undefined} onCellClick={() => undefined} onCellContextMenu={() => undefined} onCellChange={() => undefined} />
                      </div>
                    </IconSurfaceSettingsHost>
                  </div>
                ) : null}
                <div className="draft-template-list-shell">
                  <div className="draft-template-list-toolbar">
                    {selectedDraftTemplates.length > 1 ? (
                      <button type="button" className="draft-template-disclosure" aria-label="draft-template-disclosure" aria-expanded={templatesExpanded} onClick={() => setTemplatesExpanded((current) => !current)}>
                        <span aria-hidden="true">{templatesExpanded ? '⌄' : '›'}</span>
                        <strong>Рецепты ({selectedDraftTemplates.length})</strong>
                      </button>
                    ) : <strong>Рецепт</strong>}
                    <span>Отмечено: {selectedTemplateCount}</span>
                  </div>
                  {templatesExpanded ? (
                    <div className="draft-template-list" aria-label="draft-template-list">
                      {selectedDraftTemplates.map((draft) => {
                        const active = draft.id === activeDraftPreview?.id;
                        const primary = isPrimaryTemplate(draft);
                        const displayName = draftTemplateDisplayName(draft, resolveCellTitle);
                        return (
                          <div
                            key={draft.id}
                            className={`draft-template-card ${active ? 'active' : ''} ${selectedTemplateIds[draft.id] ? 'is-selected' : ''}`.trim()}
                            tabIndex={0}
                            aria-label={`draft-template-${draft.outputRaw}-${draft.id}`}
                            aria-selected={active}
                            onMouseEnter={() => setPreviewDraftTemplateId(draft.id)}
                            onFocus={() => setPreviewDraftTemplateId(draft.id)}
                            onClick={() => setPreviewDraftTemplateId(draft.id)}
                            onKeyDown={(event) => {
                              if (event.target !== event.currentTarget) return;
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                setPreviewDraftTemplateId(draft.id);
                              }
                            }}
                            onContextMenu={(event) => openDraftContextMenu(event, draft)}
                          >
                            <div className="draft-template-card-row">
                              <input type="checkbox" aria-label={`draft-template-select-${draft.id}`} checked={Boolean(selectedTemplateIds[draft.id])} onChange={(event) => setTemplateSelected(draft.id, event.target.checked)} onClick={(event) => event.stopPropagation()} />
                              <span className="draft-template-icon">{renderCraftItemIcon(draft.outputRaw, draft.recipe.output_resolution?.icon_url, draft.recipe.output_resolution?.animated, draft.recipe.output_resolution?.animation_meta?.frametime, resolveCellTitle(draft.outputRaw))}</span>
                              <div className="draft-template-main">
                                <strong>{displayName}</strong>
                                <span>{draft.outputRaw}</span>
                                <small><span>Создал: </span><span>{draft.createdByEmail}</span><span> · {new Date(draft.updatedAt).toLocaleString()}</span></small>
                              </div>
                              <div className="draft-template-actions">
                                {primary ? (
                                  <button type="button" className="draft-primary-button is-primary" aria-label={`draft-template-primary-${draft.id}`} title="Главный рецепт">★ Главный</button>
                                ) : (
                                  <button type="button" className="draft-primary-button" aria-label={`draft-template-primary-${draft.id}`} title="Сделать главным" onClick={(event) => { event.stopPropagation(); setPrimaryTemplate(draft); }}>☆</button>
                                )}
                                <button type="button" className="secondary-button draft-template-edit" aria-label={`edit-draft-template-${draft.id}`} onClick={(event) => { event.stopPropagation(); onOpenDraft(draft); }}>Редактировать</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </>
            ) : <div className="inline-hint inline-hint-warning">Нет шаблонов для выбранного предмета.</div>}
          </Panel>
        </div>
      </div>
    </div>
  );
}
