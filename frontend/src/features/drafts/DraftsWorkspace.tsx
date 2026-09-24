import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';

import { Panel } from '../../components/Panel';
import { RecipeGrid } from '../../components/RecipeGrid';
import { IconSurfaceSettingsHost } from '../icon-settings/IconSurfaceSettingsHost';
import type { DisplayMode, ItemPanelAtlas, RecipeDraftTemplate } from '../../types';
import {
  DraftsWorkspaceStateProvider,
  useDraftsWorkspaceStateContext,
  useOptionalDraftsWorkspaceState,
  type DraftCloudSelection,
  type DraftCloudSelectionMode,
  type DraftsWorkspaceState
} from './useDraftsWorkspaceState';

export {
  DraftsWorkspaceStateProvider,
  useDraftsWorkspaceState
} from './useDraftsWorkspaceState';
export type {
  DraftCloudSelection,
  DraftCloudSelectionMode,
  DraftsWorkspaceState
} from './useDraftsWorkspaceState';

export type DraftItemAvailability = 'available' | 'missing' | 'unknown';

export interface DraftItemSummary {
  raw: string;
  draftCount: number;
  hasNbt: boolean;
}

export interface DraftGroupSummary {
  name: string;
  key: string;
  items: DraftItemSummary[];
}

export type DraftsWorkspaceRegion = 'all' | 'items' | 'recipes';

export interface DraftsWorkspaceProps {
  layout?: 'standalone' | 'regions';
  email: string;
  selectedDraftItemRaw: string | null;
  draftItemEntries: DraftItemSummary[];
  groupedDraftItems: DraftGroupSummary[];
  draftItemSearchQuery: string;
  draftItemSortMode: string;
  draftItemGroupMode: string;
  draftPreferencesStatus?: string;
  collapsedDraftGroups: Record<string, boolean>;
  draftItemPage: number;
  draftItemPageCount: number;
  selectedDraftTemplates: RecipeDraftTemplate[];
  itemPanelAtlas?: ItemPanelAtlas | null;
  draftPreviewAtlasUrl: string;
  heldItemRaw?: string | null;
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
  /** Render one grid-ready region instead of the legacy two-column wrapper. */
  region?: DraftsWorkspaceRegion;
  /** Supply a shared state when multiple region instances are rendered separately. */
  controller?: DraftsWorkspaceState;
  /** Zero-based recipe page. When omitted, the right panel manages its own page. */
  draftTemplatePage?: number;
  /** Total number of recipe pages. Defaults to the local page calculation. */
  draftTemplatePageCount?: number;
  /** Controlled recipe pagination callback receiving the next zero-based page. */
  onChangeDraftTemplatePage?: (page: number) => void;
  draftItemsTitle?: string;
  draftTemplatesTitle?: string;
}

type DraftsWorkspaceRenderProps = Omit<DraftsWorkspaceProps, 'layout' | 'region' | 'controller'> & {
  controller: DraftsWorkspaceState;
  draftItemsTitle: string;
  draftTemplatesTitle: string;
};

const DRAFT_TEMPLATE_PAGE_SIZE = 6;

function draftTemplateDisplayName(draft: RecipeDraftTemplate, resolveCellTitle: (raw: string) => string): string {
  const exactTitle = resolveCellTitle(draft.outputRaw).trim();
  const generatedSuffix = draft.name.match(/(\s+#\d+)\s*$/)?.[1];
  if (!generatedSuffix || !exactTitle || exactTitle === draft.outputRaw) {
    return draft.name;
  }
  return `${exactTitle}${generatedSuffix}`;
}

function clampPage(page: number, pageCount: number): number {
  return Math.max(0, Math.min(Math.floor(page), Math.max(1, pageCount) - 1));
}

export function DraftsWorkspaceItemsPanel({
  controller,
  selectedDraftItemRaw,
  draftItemEntries,
  groupedDraftItems,
  draftItemSearchQuery,
  draftItemSortMode,
  draftItemGroupMode,
  draftPreferencesStatus,
  collapsedDraftGroups,
  draftItemPage,
  draftItemPageCount,
  draftItemsTitle,
  canManageCloudFiles,
  renderDraftCatalogIcon,
  renderItemTooltip,
  getRecipeAvailability,
  onSelectDraftItem,
  onChangeDraftSearch,
  onChangeDraftSort,
  onChangeDraftGroup,
  onChangeDraftPage,
  onToggleDraftGroup,
  onExportDrafts,
  onItemHover
}: DraftsWorkspaceRenderProps) {
  const {
    selectedItemRaws,
    cloudSelectionMode,
    handleItemClick,
    setCloudSelectionMode,
    clearItemSelection
  } = controller;

  function requestCloudExport(mode: DraftCloudSelectionMode) {
    onExportDrafts({
      itemRaws: selectedItemRaws,
      selectedTemplateIds: Object.entries(controller.selectedTemplateIds)
        .filter(([, selected]) => selected)
        .map(([id]) => id),
      primaryTemplateIds: controller.primaryTemplateIds,
      mode
    });
  }

  return (
    <div className="workspace-panel-shell panel-draft-items">
      <Panel title={draftItemsTitle} subtitle="Только предметы с сохранёнными шаблонами" className="draft-items-panel">
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
        {draftPreferencesStatus ? <div className="inline-status inline-status-default draft-preferences-status">{draftPreferencesStatus}</div> : null}
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
                            onClick={(event) => {
                              handleItemClick(entry.raw, event.ctrlKey || event.metaKey);
                              onSelectDraftItem(entry.raw);
                            }}
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
            <button type="button" className="ghost-button icon-button" aria-label="clear-draft-selection" onClick={clearItemSelection}>×</button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

export function DraftsWorkspaceRecipesPanel({
  controller,
  selectedDraftItemRaw,
  selectedDraftTemplates,
  itemPanelAtlas,
  draftPreviewAtlasUrl,
  heldItemRaw = null,
  displayMode,
  animationsEnabled,
  resolveCellTitle,
  renderCraftItemIcon,
  resolveRecipeGridIconStyle,
  onOpenDraft,
  onOpenDraftContextMenu,
  onItemHover,
  draftTemplatePage,
  draftTemplatePageCount,
  onChangeDraftTemplatePage,
  draftTemplatesTitle
}: DraftsWorkspaceRenderProps) {
  const {
    activeDraftPreview,
    activeGridMode,
    selectedTemplateCount,
    selectedTemplateIds,
    templatesExpanded,
    setPreviewDraftTemplateId,
    setTemplateSelected,
    setPrimaryTemplate,
    isPrimaryTemplate,
    toggleTemplatesExpanded
  } = controller;
  const [previewMatrix, setPreviewMatrix] = useState<RecipeDraftTemplate['recipe']['matrix'] | null>(null);
  const [internalTemplatePage, setInternalTemplatePage] = useState(0);

  const calculatedPageCount = Math.max(1, Math.ceil(selectedDraftTemplates.length / DRAFT_TEMPLATE_PAGE_SIZE));
  const templatePageCount = Math.max(1, draftTemplatePageCount ?? calculatedPageCount);
  const templatePage = clampPage(draftTemplatePage ?? internalTemplatePage, templatePageCount);
  const visibleDraftTemplates = selectedDraftTemplates.slice(
    templatePage * DRAFT_TEMPLATE_PAGE_SIZE,
    templatePage * DRAFT_TEMPLATE_PAGE_SIZE + DRAFT_TEMPLATE_PAGE_SIZE
  );
  const selectedTitle = selectedDraftItemRaw ? resolveCellTitle(selectedDraftItemRaw) : 'Предмет не выбран';

  useEffect(() => {
    setPreviewMatrix(activeDraftPreview?.recipe.matrix ?? null);
  }, [activeDraftPreview?.id]);

  useEffect(() => {
    if (draftTemplatePage !== undefined) return;
    setInternalTemplatePage((current) => clampPage(current, templatePageCount));
  }, [draftTemplatePage, templatePageCount]);

  useEffect(() => {
    if (draftTemplatePage === undefined) setInternalTemplatePage(0);
  }, [draftTemplatePage, selectedDraftItemRaw]);

  function updatePreviewCell(row: number, col: number, raw: string) {
    setPreviewMatrix((current) => {
      if (!current?.[row]?.[col]) return current;
      return current.map((currentRow, rowIndex) => rowIndex === row
        ? currentRow.map((cell, colIndex) => colIndex === col ? { ...cell, raw } : cell)
        : currentRow);
    });
  }

  function openDraftContextMenu(event: React.MouseEvent, draft: RecipeDraftTemplate) {
    event.preventDefault();
    onOpenDraftContextMenu(draft.id, event.clientX, event.clientY);
  }

  function changeTemplatePage(nextPage: number) {
    const next = clampPage(nextPage, templatePageCount);
    if (onChangeDraftTemplatePage) {
      onChangeDraftTemplatePage(next);
      return;
    }
    setInternalTemplatePage(next);
  }

  return (
    <div className="workspace-panel-shell panel-draft-templates">
      <Panel title={draftTemplatesTitle} subtitle={selectedDraftItemRaw ?? 'Выберите предмет'} className="draft-templates-panel">
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
                    <strong>{draftTemplateDisplayName(activeDraftPreview, resolveCellTitle)}</strong>
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
                <IconSurfaceSettingsHost surfaceId={activeGridMode === '9' ? 'draftPreview9' : 'draftPreview'} title="Настроить превью черновика" placement="bottom-right">
                  <div className="draft-preview-grid">
                    <RecipeGrid matrix={previewMatrix ?? activeDraftPreview.recipe.matrix} atlas={itemPanelAtlas} atlasImageUrl={draftPreviewAtlasUrl} displayMode={displayMode} animationsEnabled={animationsEnabled} editorMode="edit" tooltipsDisabled extremeGroupGap={3} heldItemRaw={heldItemRaw} resolveCellTitle={resolveCellTitle} resolveIconStyle={resolveRecipeGridIconStyle} onItemHover={onItemHover} onCellClick={(row, col) => { if (heldItemRaw) updatePreviewCell(row, col, heldItemRaw); }} onCellContextMenu={(row, col) => updatePreviewCell(row, col, '')} onCellChange={updatePreviewCell} onCellDrop={(row, col, value) => updatePreviewCell(row, col, value)} />
                  </div>
                </IconSurfaceSettingsHost>
              </div>
            ) : null}
            <div className="draft-template-list-shell">
              <div className="draft-template-list-toolbar">
                {selectedDraftTemplates.length > 1 ? (
                  <button type="button" className="draft-template-disclosure" aria-label="draft-template-disclosure" aria-expanded={templatesExpanded} onClick={toggleTemplatesExpanded}>
                    <span aria-hidden="true">{templatesExpanded ? '⌄' : '›'}</span>
                    <strong>Рецепты ({selectedDraftTemplates.length})</strong>
                  </button>
                ) : <strong>Рецепт</strong>}
                <span>Отмечено: {selectedTemplateCount}</span>
                <div className="nei-pager" aria-label="draft-template-pagination">
                  <button type="button" className="ghost-button icon-button" aria-label="draft-templates-prev-page" disabled={templatePage <= 0} onClick={() => changeTemplatePage(templatePage - 1)}>‹</button>
                  <strong>{templatePage + 1}/{templatePageCount}</strong>
                  <button type="button" className="ghost-button icon-button" aria-label="draft-templates-next-page" disabled={templatePage >= templatePageCount - 1} onClick={() => changeTemplatePage(templatePage + 1)}>›</button>
                </div>
              </div>
              {templatesExpanded ? (
                <div className="draft-template-list" aria-label="draft-template-list">
                  {visibleDraftTemplates.map((draft) => {
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
                          <IconSurfaceSettingsHost surfaceId="draftTemplateIcon" title="Настроить иконку этого рецепта" placement="bottom-right" size="compact">
                            <span className="draft-template-icon">{renderCraftItemIcon(draft.outputRaw, draft.recipe.output_resolution?.icon_url, draft.recipe.output_resolution?.animated, draft.recipe.output_resolution?.animation_meta?.frametime, resolveCellTitle(draft.outputRaw))}</span>
                          </IconSurfaceSettingsHost>
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
  );
}

function renderDraftsWorkspace(props: DraftsWorkspaceProps, controller: DraftsWorkspaceState): ReactNode {
  const regionMode = props.layout === 'regions' || props.region !== undefined;
  const renderProps: DraftsWorkspaceRenderProps = {
    ...props,
    controller,
    draftItemsTitle: props.draftItemsTitle ?? (regionMode ? 'Все черновики' : 'Черновики'),
    draftTemplatesTitle: props.draftTemplatesTitle ?? (regionMode ? 'Крафты выбранного черновика' : 'Шаблоны')
  };

  if (props.region === 'items') {
    return <div className="crafts-region crafts-drafts-region"><DraftsWorkspaceItemsPanel {...renderProps} /></div>;
  }
  if (props.region === 'recipes') {
    return <div className="crafts-region crafts-templates-region"><DraftsWorkspaceRecipesPanel {...renderProps} /></div>;
  }
  if (props.layout === 'regions') {
    return (
      <>
        <div className="crafts-region crafts-drafts-region"><DraftsWorkspaceItemsPanel {...renderProps} /></div>
        <div className="crafts-region crafts-templates-region"><DraftsWorkspaceRecipesPanel {...renderProps} /></div>
      </>
    );
  }

  return (
    <div className="workspace-layout workspace-layout-drafts">
      <div className="workspace-column workspace-left"><DraftsWorkspaceItemsPanel {...renderProps} /></div>
      <div className="workspace-column workspace-right"><DraftsWorkspaceRecipesPanel {...renderProps} /></div>
    </div>
  );
}

function DraftsWorkspaceBound({ props }: { props: DraftsWorkspaceProps }) {
  return renderDraftsWorkspace(props, useDraftsWorkspaceStateContext());
}

export function DraftsWorkspace(props: DraftsWorkspaceProps) {
  const inheritedController = useOptionalDraftsWorkspaceState();
  if (props.controller || inheritedController) {
    return renderDraftsWorkspace(props, props.controller ?? inheritedController!);
  }

  return (
    <DraftsWorkspaceStateProvider email={props.email} selectedDraftItemRaw={props.selectedDraftItemRaw} selectedDraftTemplates={props.selectedDraftTemplates}>
      <DraftsWorkspaceBound props={props} />
    </DraftsWorkspaceStateProvider>
  );
}
