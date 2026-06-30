import { type CSSProperties, type MouseEvent, type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Panel } from '../components/Panel';
import { RecipeGrid } from '../components/RecipeGrid';
import { StatusBar } from '../components/StatusBar';
import { AnimatedIcon } from '../components/AnimatedIcon';
import { NbtTreeEditor, nbtScalarTypes, type NbtCompoundNode, type NbtNode, type NbtScalarNode, type NbtScalarType } from '../components/NbtTreeEditor';
import { MobileAppMenu } from '../features/mobile-shell/MobileAppMenu';
import { NeiFavoritesPanel } from '../features/nei-favorites/NeiFavoritesPanel';
import { NeiIconItem } from '../features/nei/NeiIconItem';
import { IconScaleLab } from '../features/icon-lab/IconScaleLab';
import { IconSettingsPanel } from '../features/icon-settings/IconSettingsPanel';
import { defaultIconSurfaceSettings, normalizeIconSurfaceSettings, patchIconSurfaceSettings, type IconSurfaceId, type IconSurfaceSettings } from '../features/icon-settings/iconSurfaces';
import { useIconSurfaceCssVars } from '../features/icon-settings/useIconViewport';
import { RecipeTasksBoard, type RecipeTaskItemOption, type RecipeTaskPrefillItem } from '../features/tasks/RecipeTasksBoard';
import { applyTaskTextTemplate, loadTaskDefaultTemplate, taskTemplateDateInputValue, taskTemplateEmails } from '../features/tasks/taskDefaults';
import { MobileRecipeWorkspace } from '../features/recipe-editor/MobileRecipeWorkspace';
import { cloneMatrix, craftModeFromRecipeType, matrixForRecipeSource, maxGridWidth, normalizeGridSize, recipeTypeFromCraftMode, resizeMatrix, toCellMatrix, type RecipeBindingMode, type RecipeCraftMode, type RecipeType } from '../features/recipe-editor/recipeMatrix';
import { apiPath, getBackendTargetHint, getItemPanelFallbackToFirstMetaEnabled } from '../config/runtime';
import { createTranslator, getPanelLabel, getTabLabel } from '../i18n';
import { ApiConflictError, cleanModIconArchive, createRecipeTask, createRecipeTemplate, deleteCustomItem, deleteModIconArchive, deleteRecipeDraftTemplate, deleteZsCloudFile, downloadZsCloudBackup, downloadZsCloudFile, generateItemCaseAliasReport, generateModIconAtlases, getAccessControlSettings, getItemCaseAliasReport, getItemCatalog, getItemPanelAtlas, getItemPanelMergedCsvUrl, getModIconAdminStatus, getModIconArchiveDownloadUrl, getModIconAtlasManifest, getNeiFavorites, getProjectSettings, getOreDictGroups, listCustomItems, listRecipeDraftTemplates, listRecipeTasks, listUsers, listZsCloudBackups, listZsCloudFiles, mergeItemPanelFiles, parseText, renameZsCloudFile, resolveItemRaw, saveCustomItem, saveManualItemCaseAlias, saveNeiFavorites, saveRecipeAs, saveRecipeDraftTemplate, searchRecipesByOutput, searchRecipesByOutputs, searchRecipesUsingItem, updateAccessControlSettings, updateProjectSettings, updateProjectUiPreferences, updateRecipe, updateUserRole, uploadItemCaseAliasFmlLog, uploadItemPanelCsv, uploadItemPanelJson, uploadModIconArchive, uploadOreDictFile, uploadZsCloudFile, scanModReplacement, replaceModItems, listServers, type RecipeTaskPayload } from '../services/api';
import { logFrontendEvent } from '../services/debugLog';
import { can } from '../auth/permissions';
import { AccessControlSettings, AppTab, AuthUser, CellValue, CustomItem, DensityMode, DisplayMode, EditorMode, ItemCaseAliasReport, ItemCatalogEntry, ItemPanelAtlas, ItemPanelAtlasEntry, ModIconAdminStatus, ModIconAtlasEntry, ModIconAtlasManifest, NeiFavoritesProfile, OreDictGroupsResponse, PanelId, PanelLayoutItem, ProjectSettings, RecipeDraftTemplate, RecipeView, ThemeMode, UiLanguage, UiPreferences, UiScale, UserRole, WorkspaceLayout, ZsCloudBackup, ZsCloudFile } from '../types';

const defaultMatrix: CellValue[][] = [
  [null, null, null],
  [null, null, null],
  [null, null, null]
];

const defaultWorkspaceLayout: WorkspaceLayout = {
  columns: 3,
  compact_header: true,
  top_split_ratio: 0.68,
  main_sidebar_ratio: 0.76,
  top_height: 560,
  bottom_height: 260,
  extreme_grid_gap: 8
};

const defaultPanelLayout: PanelLayoutItem[] = [
  { id: 'hero', zone: 'topLeft', order: 0, visible: true, height: 120, width_units: 3 },
  { id: 'toolbar', zone: 'topLeft', order: 1, visible: true, height: 96, width_units: 3 },
  { id: 'input', zone: 'topLeft', order: 2, visible: true, height: 320, width_units: 2 },
  { id: 'output', zone: 'topRight', order: 3, visible: true, height: 320, width_units: 1 },
  { id: 'grid', zone: 'bottom', order: 4, visible: true, height: 380, width_units: 3 },
  { id: 'statusBar', zone: 'topRight', order: 5, visible: false, height: 72, width_units: 3 },
  { id: 'settings', zone: 'bottom', order: 6, visible: false, height: 260, width_units: 1 },
  { id: 'info', zone: 'sidebar', order: 7, visible: false, height: 260, width_units: 1 },
  { id: 'debug', zone: 'sidebar', order: 8, visible: false, height: 260, width_units: 1 },
  { id: 'diagnostics', zone: 'sidebar', order: 9, visible: false, height: 260, width_units: 1 },
  { id: 'preview', zone: 'sidebar', order: 10, visible: false, height: 220, width_units: 1 },
  { id: 'raw', zone: 'sidebar', order: 11, visible: false, height: 260, width_units: 1 }
];

const EMPTY_ITEM_CASE_ALIASES: Record<string, string> = {};
const PERSISTENT_SCRIPTS_DIR = '/data/scripts';

type ModalScaleKey = 'help' | 'layout' | 'craft' | 'nbtTree';
type WorkspaceTab = 'editor' | 'recipe' | 'tasks' | 'technical' | 'cloud';
type CraftBodyTemplate = {
  schemaVersion: 1;
  recipeType: string;
  bindingMode: RecipeBindingMode;
  matrix: CellValue[][];
  copiedAt: number;
};

const CRAFT_BODY_TEMPLATE_STORAGE_KEY = 'cubixrecipes:craft-body-template:v1';

const defaultUiPreferences: UiPreferences = {
  display_mode: 'text',
  animations_enabled: true,
  density_mode: 'normal',
  editor_mode: 'edit',
  theme_mode: 'dark',
  ui_scale: 1.15,
  nei_page_size: 32,
  language: 'ru',
  active_view_tab: 'editor',
  reset_layout_version: 4,
  panel_layout: defaultPanelLayout,
  workspace_layout: defaultWorkspaceLayout,
  icon_surfaces: defaultIconSurfaceSettings
};

const defaultNeiFavoritesProfile: NeiFavoritesProfile = {
  activeTabId: 'default',
  favoriteHotkey: 'A',
  hiddenPatterns: [],
  tabs: [{ id: 'default', name: 'Основное', items: [] }]
};

const defaultRecipe: RecipeView = {
  recipe_uid: 'new-recipe',
  recipe_type: 'ct_shaped',
  binding_mode: 'soft',
  name: null,
  output: { raw: '<minecraft:stone>' },
  output_resolution: null,
  grid_w: 3,
  grid_h: 3,
  matrix: defaultMatrix.map((row) => row.map((cell) => ({ raw: cell }))),
  source: { kind: 'generated', path: null }
};

type ItemPanelEntry = {
  key: string;
  legacyId: number | null;
  meta: number;
  hasNbt: boolean;
  displayRu: string;
  displayEn: string;
  nbtRaw?: string | null;
  hasIcon?: boolean;
  iconUrl?: string | null;
  sources?: string[];
  raw?: string;
  customItemId?: number;
  customScope?: 'global' | 'user';
  customOwnerEmail?: string | null;
  customStorage?: 'local' | 'backend';
  customComment?: string;
};

type ItemPanelModSummary = {
  modid: string;
  itemCount: number;
  loadedCount: number;
  completionText: string;
};

type UploadedDraft = {
  id: string;
  name: string;
  size: number;
  text: string;
  lastModified: number;
};

type RecipeBlockMatch = {
  block: string;
  start: number;
  end: number;
};

type UploadedDraftRecipeMatch = {
  sourceId: string;
  sourceName: string;
  block: string;
  matchedRaw: string;
  createdByEmail?: string;
  templateId?: string;
};

type DraftItemSortMode = 'name' | 'drafts-desc' | 'drafts-asc' | 'date-desc' | 'date-asc';

type DraftItemGroupMode = 'none' | 'mod' | 'author' | 'date' | 'grid-size';

type DraftItemEntry = {
  raw: string;
  draftCount: number;
  title: string;
  hasNbt: boolean;
  searchText: string;
  modid: string;
  maxUpdatedAt: number;
  authors: Set<string>;
  gridSizes: Set<string>;
};

type DraftGroup = {
  /** Human-readable label shown in the group header */
  name: string;
  /** Stable unique key used for collapsing state, never empty */
  key: string;
  items: DraftItemEntry[];
};

type DraftTemplateContextMenuState = {
  draftId: string;
  x: number;
  y: number;
};

type NeiContextMenuState = {
  raw: string;
  x: number;
  y: number;
  customPickerOpen?: boolean;
};

type TouchItemInspectionState = {
  raw: string;
  x: number;
  y: number;
  entry?: ItemPanelEntry | null;
};

type CloudFileContextMenuState = {
  path: string;
  x: number;
  y: number;
};

type RemoveTemplateOption = {
  id: string;
  label: string;
  template: string;
  builtin?: boolean;
};

type LocalSaveMode = 'download' | 'append-uploaded' | 'replace-uploaded';

type CustomItemFormState = {
  mode: 'craft' | 'nei';
  target: CraftEditorTarget | null;
  id: number | null;
  scope: 'global' | 'user';
  storage: 'local' | 'backend';
  sourceRaw: string;
  itemRaw: string;
  displayName: string;
  nbtRaw: string;
  comment: string;
};

type ItemPanelTranslations = {
  byKey: Map<string, string>;
  byKeyMeta: Map<string, Map<number, ItemPanelEntry>>;
  byDisplayRu: Map<string, ItemPanelEntry[]>;
  byDisplayEn: Map<string, ItemPanelEntry[]>;
  entries: ItemPanelEntry[];
  fallbackToFirstMeta: boolean;
};
const ITEMPANEL_CACHE_KEY = 'cubixrecipes:itempanel-cache-v1';
const ITEM_SEARCH_ICON_CACHE_KEY = 'cubixrecipes:item-search-icon-cache-v1';
const SHARED_CRAFT_DRAFT_STORAGE_KEY = 'cubixrecipes:shared-craft-draft:v1';
const NEI_VISIBLE_ROWS = 16;
const NEI_FALLBACK_COLUMNS = 8;
const LOCAL_DRAFT_SCHEMA_VERSION = 1;
const LOCAL_DRAFT_STORAGE_PREFIX = 'cubixrecipes:local-draft:v1';
const LOCAL_DRAFT_SAVE_DELAY_MS = 250;
const LOCAL_DRAFT_MAX_HISTORY = 20;
const LOCAL_DRAFT_MAX_UPLOADED_DRAFTS = 8;
const LOCAL_DRAFT_MAX_UPLOADED_TEXT = 180_000;
const NEI_FAVORITES_SAVE_DELAY_MS = 250;
const HOTKEY_DEBUG_EVENTS_STORAGE_KEY = 'cubixrecipes_hotkey_debug_events';
const HOTKEY_DEBUG_ENABLED_STORAGE_KEY = 'cubixrecipes_hotkey_debug_enabled';
const OREDICT_OVERRIDES_STORAGE_KEY = 'cubixrecipes_oredict_overrides';
const OREDICT_ICON_PRIORITY_STORAGE_KEY = 'cubixrecipes_oredict_icon_priority';
const DEBUG_FILTERS_STORAGE_KEY = 'cubixrecipes:debug-filters:v1';
const DEBUG_LEVEL_FILTERS_STORAGE_KEY = 'cubixrecipes:debug-level-filters:v1';
const RECIPE_DRAFT_STORAGE_PREFIX = 'cubixrecipes:recipe-drafts:v1';
const CUSTOM_ITEMS_STORAGE_PREFIX = 'cubixrecipes:custom-items:v1';
const REMOVE_TEMPLATE_STORAGE_KEY = 'cubixrecipes:remove-templates:v1';
const REMOVE_TEMPLATE_SELECTION_STORAGE_KEY = 'cubixrecipes:remove-template-selection:v1';
const RECIPE_DRAFT_MAX_TEMPLATES = 200;
const DRAFT_ITEM_PAGE_SIZE = 240;
const BUILTIN_REMOVE_TEMPLATES: RemoveTemplateOption[] = [
  { id: 'output-wildcard', label: 'recipes.remove(<item:*>)', template: 'recipes.remove({output_wildcard});', builtin: true },
  { id: 'output-exact', label: 'recipes.remove(<item>)', template: 'recipes.remove({output});', builtin: true },
  { id: 'output-meta0', label: 'recipes.remove(<item:0>)', template: 'recipes.remove({output_meta0});', builtin: true },
  { id: 'shaped-current', label: 'recipes.removeShaped(output, matrix)', template: 'recipes.removeShaped({output}, {matrix});', builtin: true },
  { id: 'shapeless-current', label: 'recipes.removeShapeless(output, items)', template: 'recipes.removeShapeless({output}, {ingredients});', builtin: true }
];
const defaultDebugFilters: DebugFilters = { hotkeys: true, ui: true, recipe: true, api: true, storage: true };
const defaultDebugLevelFilters: DebugLevelFilters = { info: true, success: true, warning: true, error: true };
const debugCategoryLabels: Record<DebugCategory, string> = {
  hotkeys: 'R/U и клавиши',
  ui: 'UI состояния',
  recipe: 'Рецепт',
  api: 'API',
  storage: 'Загрузки/хранилище'
};
const debugLevelLabels: Record<HotkeyDebugLevel, string> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error'
};

type CraftEditorTarget =
  | { kind: 'output' }
  | { kind: 'cell'; row: number; col: number };

type RecipeHistoryEntry = {
  recipe: RecipeView;
  input: string;
};

type RecipeUsesModalState = {
  raw: string;
  matches: RecipeView[];
  page: number;
  status: 'loading' | 'ready' | 'error';
  error?: string;
};

type SimilarRecipeState = {
  raw: string;
  matches: RecipeView[];
  index: number;
};

type CloudUploadConflictMode = 'overwrite' | 'append' | 'cancel';
type CloudUploadConflictState = {
  filename: string;
  resolve: (mode: CloudUploadConflictMode) => void;
};

type HotkeyDebugLevel = 'info' | 'success' | 'warning' | 'error';
type HotkeyDebugDetails = Record<string, string | number | boolean | null | undefined>;
type DebugCategory = 'hotkeys' | 'ui' | 'recipe' | 'api' | 'storage';
type HotkeyDebugEvent = {
  id: number;
  timestamp: string;
  level: HotkeyDebugLevel;
  category: DebugCategory;
  message: string;
  details?: HotkeyDebugDetails;
};
type DebugFilters = Record<DebugCategory, boolean>;
type DebugLevelFilters = Record<HotkeyDebugLevel, boolean>;
type DebugSection = 'overview' | 'modIcons' | 'iconSettings' | 'iconLab' | 'access' | 'caseAliases' | 'oreDictPriority' | 'modReplacement' | 'recipe' | 'runtime' | 'logs' | 'raw';

type ActiveItemInspection = {
  raw: string | null;
  source: 'hover-ref' | 'hover-state' | 'dom' | 'held' | 'none';
  hoveredRef: string | null;
  hoveredState: string | null;
  domRaw: string | null;
  heldRaw: string | null;
  pointElement: string;
  itemElement: string;
  cursor: string;
};

type LocalDraftState = {
  input: string;
  matrix: CellValue[][];
  recipe: RecipeView;
  outputRaw: string;
  strictBinding: boolean;
  metaMode: string;
  workspaceTab: WorkspaceTab;
  itemSearchQuery: string;
  neiSearchQuery: string;
  neiPage: number;
  selectedTextureMods: Record<string, boolean>;
  craftEditorTarget: CraftEditorTarget;
  craftSourceDraft: string;
  itemModDraft: string;
  itemNameDraft: string;
  itemMetaDraft: string;
  nbtRootDraft: NbtCompoundNode;
  collapsedNbtPaths: Record<string, boolean>;
  uploadedDrafts: UploadedDraft[];
  selectedDraftId: string | null;
  recipeBackHistory: RecipeHistoryEntry[];
  recipeForwardHistory: RecipeHistoryEntry[];
  modalScales: Record<ModalScaleKey, number>;
};

type LocalDraftPayload = {
  schemaVersion: typeof LOCAL_DRAFT_SCHEMA_VERSION;
  userHash: string;
  craftHash: string;
  savedAt: number;
  state: LocalDraftState;
};

interface AppProps {
  authUser?: AuthUser;
  onLogout?: () => Promise<void>;
  onResetServer?: () => void;
  activeServerId?: string;
}

const fallbackAuthUser: AuthUser = {
  id: 0,
  email: 'root.user76@gmail.com',
  name: 'Local Admin',
  avatar_url: null,
  role: 'admin',
  is_root_admin: true
};

function itemPanelEntryIdentity(entry: ItemPanelEntry): string {
  if (entry.customItemId !== undefined) {
    return `custom:${entry.customItemId}:${entry.raw ?? ''}`;
  }
  if (entry.raw && entry.nbtRaw) {
    return `raw:${entry.raw}`;
  }
  return `${entry.key}:${entry.meta}`;
}

function dedupeItemPanelEntries(entries: ItemPanelEntry[]): ItemPanelEntry[] {
  const unique = new Map<string, ItemPanelEntry>();
  entries.forEach((entry) => {
    const identity = itemPanelEntryIdentity(entry);
    if (!unique.has(identity)) {
      unique.set(identity, entry);
    }
  });
  return [...unique.values()];
}

function buildItemPanelTranslationsFromEntries(entries: ItemPanelEntry[], fallbackToFirstMeta: boolean): ItemPanelTranslations {
  const uniqueEntries = dedupeItemPanelEntries(entries);
  const byKey = new Map<string, string>();
  const byKeyMeta = new Map<string, Map<number, ItemPanelEntry>>();
  const byDisplayRu = new Map<string, ItemPanelEntry[]>();
  const byDisplayEn = new Map<string, ItemPanelEntry[]>();
  const pushDisplayIndex = (index: Map<string, ItemPanelEntry[]>, label: string, entry: ItemPanelEntry) => {
    const normalized = label.trim().toLowerCase();
    if (!normalized) return;
    const list = index.get(normalized) ?? [];
    list.push(entry);
    index.set(normalized, list);
  };
  uniqueEntries.forEach((entry) => {
    pushDisplayIndex(byDisplayRu, entry.displayRu, entry);
    pushDisplayIndex(byDisplayEn, entry.displayEn, entry);
    let metaMap = byKeyMeta.get(entry.key);
    if (!metaMap) {
      metaMap = new Map<number, ItemPanelEntry>();
      byKeyMeta.set(entry.key, metaMap);
    }
    if (!metaMap.has(entry.meta)) {
      metaMap.set(entry.meta, entry);
    }
    if (!byKey.has(entry.key) || entry.meta === 0) {
      byKey.set(entry.key, entry.displayRu);
    }
  });
  return {
    byKey,
    byKeyMeta,
    byDisplayRu,
    byDisplayEn,
    entries: uniqueEntries,
    fallbackToFirstMeta
  };
}

function buildStructuredItemRaw(modidDraft: string, itemDraft: string, metaDraft: string, nbtRoot: NbtCompoundNode): string {
  const modid = modidDraft.trim().toLowerCase();
  const item = itemDraft.trim().toLowerCase();
  if (!modid || !item) return '';
  const parsedMeta = Number.parseInt(metaDraft.trim() || '0', 10);
  const safeMeta = Number.isNaN(parsedMeta) ? 0 : Math.max(0, parsedMeta);
  const nbtRaw = buildNbtRawFromRoot(nbtRoot);
  return buildItemRawValue(`${modid}:${item}`, safeMeta, nbtRaw);
}

function validateCloudRecipeFilename(value: string): { filename: string | null; error: string | null } {
  const trimmed = value.trim();
  if (!trimmed) return { filename: null, error: 'Введите имя .zs файла.' };
  if (/[\\/]/.test(trimmed) || trimmed.includes('..')) {
    return { filename: null, error: 'Имя файла должно быть без папок и переходов ..' };
  }
  if (/[<>:"|?*\x00-\x1F]/.test(trimmed)) {
    return { filename: null, error: 'В имени есть недопустимые символы.' };
  }
  const filename = trimmed.toLowerCase().endsWith('.zs') ? trimmed : `${trimmed}.zs`;
  if (filename.toLowerCase() === '.zs') return { filename: null, error: 'Введите имя .zs файла.' };
  return { filename, error: null };
}

function buildDefaultCloudRecipeFilename(sourcePath: string | null | undefined, outputRaw: string): string {
  const sourceName = sourcePath?.split(/[\\/]/).pop();
  if (sourceName && !validateCloudRecipeFilename(sourceName).error) {
    return validateCloudRecipeFilename(sourceName).filename ?? sourceName;
  }
  const rawName = outputRaw.replace(/[<>:"/\\|?*\s]+/g, '_').replace(/^_+|_+$/g, '');
  return `${rawName || 'new_recipe'}.zs`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function localDraftUserHash(email: string): string {
  return stableHash(email.trim().toLowerCase() || 'local-user');
}

function localDraftStorageKey(email: string): string {
  return `${LOCAL_DRAFT_STORAGE_PREFIX}:${localDraftUserHash(email)}`;
}

function serverLocalDraftStorageKey(email: string, serverId: string | undefined, sharedCraftDraft: boolean): string {
  const baseKey = localDraftStorageKey(email);
  return sharedCraftDraft || !serverId ? baseKey : `${baseKey}:server:${serverId}`;
}

function serverScopedStorageKey(baseKey: string, serverId: string | undefined): string {
  return serverId ? `${baseKey}:server:${serverId}` : baseKey;
}

function loadSharedCraftDraftEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(SHARED_CRAFT_DRAFT_STORAGE_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

function persistSharedCraftDraftEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SHARED_CRAFT_DRAFT_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Local craft draft storage mode is best-effort.
  }
}

function recipeDraftStorageKey(email: string): string {
  return `${RECIPE_DRAFT_STORAGE_PREFIX}:${localDraftUserHash(email)}`;
}

function customItemsStorageKey(email: string): string {
  return `${CUSTOM_ITEMS_STORAGE_PREFIX}:${localDraftUserHash(email)}`;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isCellMatrix(value: unknown): value is CellValue[][] {
  return Array.isArray(value) && value.every((row) => (
    Array.isArray(row) && row.every((cell) => cell === null || typeof cell === 'string')
  ));
}

function normalizeCraftBodyTemplate(value: unknown): CraftBodyTemplate | null {
  if (!isObjectRecord(value) || value.schemaVersion !== 1 || !isCellMatrix(value.matrix)) {
    return null;
  }
  const size = normalizeGridSize(Math.max(value.matrix.length, maxGridWidth(value.matrix), 3));
  const recipeType = typeof value.recipeType === 'string' ? value.recipeType : 'ct_shaped';
  const bindingMode: RecipeBindingMode = value.bindingMode === 'strict' ? 'strict' : 'soft';
  return {
    schemaVersion: 1,
    recipeType,
    bindingMode,
    matrix: resizeMatrix(value.matrix, size),
    copiedAt: Number(value.copiedAt) || Date.now()
  };
}

function loadCraftBodyTemplate(): CraftBodyTemplate | null {
  try {
    return normalizeCraftBodyTemplate(JSON.parse(window.localStorage.getItem(CRAFT_BODY_TEMPLATE_STORAGE_KEY) ?? 'null'));
  } catch {
    return null;
  }
}

function saveCraftBodyTemplate(template: CraftBodyTemplate): CraftBodyTemplate {
  const normalized = normalizeCraftBodyTemplate(template) ?? template;
  window.localStorage.setItem(CRAFT_BODY_TEMPLATE_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function isRecipeView(value: unknown): value is RecipeView {
  if (!isObjectRecord(value)) return false;
  const output = value.output;
  return (
    typeof value.recipe_uid === 'string'
    && typeof value.recipe_type === 'string'
    && isObjectRecord(output)
    && typeof output.raw === 'string'
    && Array.isArray(value.matrix)
    && isObjectRecord(value.source)
  );
}

function isCraftEditorTarget(value: unknown): value is CraftEditorTarget {
  if (!isObjectRecord(value)) return false;
  if (value.kind === 'output') return true;
  return value.kind === 'cell' && Number.isFinite(value.row) && Number.isFinite(value.col);
}

function isNbtCompoundNode(value: unknown): value is NbtCompoundNode {
  return isObjectRecord(value) && value.kind === 'compound' && Array.isArray(value.entries);
}

function normalizeRecipeHistory(value: unknown): RecipeHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is RecipeHistoryEntry => (
      isObjectRecord(entry)
      && isRecipeView(entry.recipe)
      && typeof entry.input === 'string'
    ))
    .slice(-LOCAL_DRAFT_MAX_HISTORY);
}

function normalizeUploadedDrafts(value: unknown): UploadedDraft[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((draft): draft is UploadedDraft => (
      isObjectRecord(draft)
      && typeof draft.id === 'string'
      && typeof draft.name === 'string'
      && typeof draft.size === 'number'
      && typeof draft.text === 'string'
      && typeof draft.lastModified === 'number'
    ))
    .slice(0, LOCAL_DRAFT_MAX_UPLOADED_DRAFTS)
    .map((draft) => ({
      ...draft,
      text: draft.text.slice(0, LOCAL_DRAFT_MAX_UPLOADED_TEXT)
    }));
}

function normalizeRecipeDraftTemplates(value: unknown): RecipeDraftTemplate[] {
  const rawTemplates = isObjectRecord(value) && Array.isArray(value.templates)
    ? value.templates
    : value;
  if (!Array.isArray(rawTemplates)) return [];
  return rawTemplates
    .filter((draft): draft is RecipeDraftTemplate => (
      isObjectRecord(draft)
      && typeof draft.id === 'string'
      && typeof draft.outputRaw === 'string'
      && isRecipeView(draft.recipe)
      && typeof draft.sourceText === 'string'
      && typeof draft.createdByEmail === 'string'
      && typeof draft.createdAt === 'number'
      && typeof draft.updatedAt === 'number'
      && typeof draft.name === 'string'
    ))
    .slice(0, RECIPE_DRAFT_MAX_TEMPLATES);
}

function loadRecipeDraftTemplates(email: string): RecipeDraftTemplate[] {
  try {
    const raw = window.localStorage.getItem(recipeDraftStorageKey(email));
    if (!raw) return [];
    return normalizeRecipeDraftTemplates(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function persistRecipeDraftTemplates(email: string, templates: RecipeDraftTemplate[]) {
  try {
    window.localStorage.setItem(recipeDraftStorageKey(email), JSON.stringify({
      schemaVersion: 1,
      userHash: localDraftUserHash(email),
      savedAt: Date.now(),
      templates: normalizeRecipeDraftTemplates(templates)
    }));
  } catch {
    // Local recipe draft persistence is best-effort.
  }
}

function localCustomItemId(email: string, itemRaw: string): number {
  return -(Number.parseInt(stableHash(`${email.trim().toLowerCase()}:${itemRaw}`).slice(0, 7), 16) + 1);
}

function normalizeStoredCustomItems(value: unknown, email: string): CustomItem[] {
  const rawItems = isObjectRecord(value) && Array.isArray(value.items) ? value.items : value;
  if (!Array.isArray(rawItems)) return [];
  const normalizedEmail = email.trim().toLowerCase();
  return rawItems
    .filter((item): item is Record<string, unknown> => (
      isObjectRecord(item)
      && typeof item.item_raw === 'string'
      && typeof item.source_raw === 'string'
      && typeof item.display_name === 'string'
    ))
    .map((item) => {
      const itemRaw = String(item.item_raw);
      return {
        id: typeof item.id === 'number' ? item.id : localCustomItemId(normalizedEmail, itemRaw),
        scope: 'user',
        storage: 'local',
        owner_email: normalizedEmail,
        created_by_email: normalizedEmail,
        source_raw: String(item.source_raw),
        item_raw: itemRaw,
        display_name: String(item.display_name),
        nbt_raw: typeof item.nbt_raw === 'string' ? item.nbt_raw : null,
        comment: typeof item.comment === 'string' ? item.comment : '',
        created_at: typeof item.created_at === 'string' ? item.created_at : null,
        updated_at: typeof item.updated_at === 'string' ? item.updated_at : null
      } satisfies CustomItem;
    })
    .slice(0, 200);
}

function loadLocalCustomItems(email: string): CustomItem[] {
  try {
    const raw = window.localStorage.getItem(customItemsStorageKey(email));
    return raw ? normalizeStoredCustomItems(JSON.parse(raw) as unknown, email) : [];
  } catch {
    return [];
  }
}

function persistLocalCustomItems(email: string, items: CustomItem[]) {
  try {
    const localItems = items
      .filter((item) => item.storage === 'local')
      .map((item) => ({
        id: item.id,
        source_raw: item.source_raw,
        item_raw: item.item_raw,
        display_name: item.display_name,
        nbt_raw: item.nbt_raw ?? null,
        comment: item.comment ?? '',
        created_at: item.created_at ?? null,
        updated_at: item.updated_at ?? null
      }));
    window.localStorage.setItem(customItemsStorageKey(email), JSON.stringify({
      schemaVersion: 1,
      userHash: localDraftUserHash(email),
      savedAt: Date.now(),
      items: localItems
    }));
  } catch {
    // Local custom items are best-effort and can disappear with browser storage.
  }
}

function loadBooleanRecord<T extends string>(key: string, defaults: Record<T, boolean>): Record<T, boolean> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as unknown;
    if (!isObjectRecord(parsed)) return { ...defaults };
    return Object.fromEntries(
      Object.entries(defaults).map(([name, value]) => [name, typeof parsed[name] === 'boolean' ? parsed[name] : value])
    ) as Record<T, boolean>;
  } catch {
    return { ...defaults };
  }
}

function persistBooleanRecord<T extends string>(key: string, value: Record<T, boolean>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local debug preferences are best-effort only.
  }
}

function normalizeCustomRemoveTemplates(value: unknown): RemoveTemplateOption[] {
  const rawTemplates = isObjectRecord(value) && Array.isArray(value.templates) ? value.templates : value;
  if (!Array.isArray(rawTemplates)) return [];
  return rawTemplates
    .filter((item): item is RemoveTemplateOption => (
      isObjectRecord(item)
      && typeof item.id === 'string'
      && typeof item.label === 'string'
      && typeof item.template === 'string'
      && item.template.trim().startsWith('recipes.remove')
    ))
    .slice(0, 40)
    .map((item) => ({ id: item.id, label: item.label, template: item.template, builtin: false }));
}

function loadCustomRemoveTemplates(): RemoveTemplateOption[] {
  try {
    const raw = window.localStorage.getItem(REMOVE_TEMPLATE_STORAGE_KEY);
    return raw ? normalizeCustomRemoveTemplates(JSON.parse(raw) as unknown) : [];
  } catch {
    return [];
  }
}

function persistCustomRemoveTemplates(templates: RemoveTemplateOption[]) {
  try {
    window.localStorage.setItem(REMOVE_TEMPLATE_STORAGE_KEY, JSON.stringify({ templates: normalizeCustomRemoveTemplates(templates) }));
  } catch {
    // Local remove template persistence is best-effort.
  }
}

function loadRemoveTemplateSelection(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(REMOVE_TEMPLATE_SELECTION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : {};
    return isObjectRecord(parsed)
      ? Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : {};
  } catch {
    return {};
  }
}

function persistRemoveTemplateSelection(value: Record<string, string>) {
  try {
    window.localStorage.setItem(REMOVE_TEMPLATE_SELECTION_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Local remove template selection is best-effort.
  }
}

function normalizeLocalDraftState(value: unknown): LocalDraftState | null {
  if (!isObjectRecord(value) || !isRecipeView(value.recipe) || !isCellMatrix(value.matrix)) {
    return null;
  }

  const workspaceTab: WorkspaceTab = value.workspaceTab === 'recipe'
    ? 'recipe'
    : value.workspaceTab === 'tasks'
      ? 'tasks'
      : value.workspaceTab === 'cloud'
        ? 'cloud'
        : value.workspaceTab === 'technical' || value.workspaceTab === 'modIcons' || value.workspaceTab === 'debug'
          ? 'technical'
          : 'editor';
  const craftEditorTarget = isCraftEditorTarget(value.craftEditorTarget) ? value.craftEditorTarget : { kind: 'output' };
  const modalScales = isObjectRecord(value.modalScales) ? value.modalScales : {};
  const uploadedDrafts = normalizeUploadedDrafts(value.uploadedDrafts);
  const selectedDraftId = typeof value.selectedDraftId === 'string' && uploadedDrafts.some((draft) => draft.id === value.selectedDraftId)
    ? value.selectedDraftId
    : null;

  return {
    input: typeof value.input === 'string' ? value.input : '',
    matrix: value.matrix,
    recipe: value.recipe,
    outputRaw: typeof value.outputRaw === 'string' ? value.outputRaw : value.recipe.output.raw,
    strictBinding: value.strictBinding === true && value.recipe.binding_mode === 'strict',
    metaMode: typeof value.metaMode === 'string' ? value.metaMode : 'strict',
    workspaceTab,
    itemSearchQuery: typeof value.itemSearchQuery === 'string' ? value.itemSearchQuery : '',
    neiSearchQuery: typeof value.neiSearchQuery === 'string' ? value.neiSearchQuery : '',
    neiPage: Math.max(0, Math.floor(Number(value.neiPage) || 0)),
    selectedTextureMods: isObjectRecord(value.selectedTextureMods) ? value.selectedTextureMods as Record<string, boolean> : {},
    craftEditorTarget,
    craftSourceDraft: typeof value.craftSourceDraft === 'string' ? value.craftSourceDraft : '',
    itemModDraft: typeof value.itemModDraft === 'string' ? value.itemModDraft : 'minecraft',
    itemNameDraft: typeof value.itemNameDraft === 'string' ? value.itemNameDraft : 'stone',
    itemMetaDraft: typeof value.itemMetaDraft === 'string' ? value.itemMetaDraft : '0',
    nbtRootDraft: isNbtCompoundNode(value.nbtRootDraft) ? value.nbtRootDraft : { kind: 'compound', entries: [] },
    collapsedNbtPaths: isObjectRecord(value.collapsedNbtPaths) ? value.collapsedNbtPaths as Record<string, boolean> : {},
    uploadedDrafts,
    selectedDraftId,
    recipeBackHistory: normalizeRecipeHistory(value.recipeBackHistory),
    recipeForwardHistory: normalizeRecipeHistory(value.recipeForwardHistory),
    modalScales: {
      help: clamp(Number(modalScales.help ?? 1), 0.8, 1.5),
      layout: clamp(Number(modalScales.layout ?? 1), 0.8, 1.5),
      craft: clamp(Number(modalScales.craft ?? 1), 0.8, 1.5),
      nbtTree: clamp(Number(modalScales.nbtTree ?? 1.1), 0.8, 1.5)
    }
  };
}

function hashLocalDraftState(state: LocalDraftState): string {
  return stableHash(JSON.stringify(state));
}

function loadLocalDraftPayload(email: string, storageKey = localDraftStorageKey(email)): LocalDraftPayload | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isObjectRecord(parsed) || parsed.schemaVersion !== LOCAL_DRAFT_SCHEMA_VERSION || typeof parsed.craftHash !== 'string') {
      return null;
    }
    const state = normalizeLocalDraftState(parsed.state);
    if (!state) return null;
    const craftHash = hashLocalDraftState(state);
    if (parsed.craftHash !== craftHash) {
      return null;
    }
    return {
      schemaVersion: LOCAL_DRAFT_SCHEMA_VERSION,
      userHash: typeof parsed.userHash === 'string' ? parsed.userHash : localDraftUserHash(email),
      craftHash,
      savedAt: Number(parsed.savedAt) || 0,
      state
    };
  } catch {
    return null;
  }
}

function parseItemRaw(raw: string): { key: string; wildcardMeta: boolean; meta: number | null } | null {
  const match = raw.trim().match(/^<([a-zA-Z0-9_.-]+:[a-zA-Z0-9_./-]+)(?::([0-9*]+))?>(?:\.withTag\(([\s\S]*)\))?$/);
  if (!match) return null;
  const rawMeta = (match[2] ?? '').toLowerCase();
  if (rawMeta === '*') {
    return { key: match[1].toLowerCase(), wildcardMeta: true, meta: null };
  }
  if (!rawMeta) {
    return { key: match[1].toLowerCase(), wildcardMeta: false, meta: 0 };
  }
  const parsedMeta = Number.parseInt(rawMeta, 10);
  if (Number.isNaN(parsedMeta)) {
    return { key: match[1].toLowerCase(), wildcardMeta: false, meta: 0 };
  }
  return { key: match[1].toLowerCase(), wildcardMeta: false, meta: parsedMeta };
}

function buildItemRawValue(key: string, meta: number, nbtRaw?: string): string {
  const normalizedNbt = (nbtRaw ?? '').trim();
  const base = `<${key}${meta > 0 ? `:${meta}` : ''}>`;
  if (!normalizedNbt) {
    return base;
  }
  return `${base}.withTag(${normalizedNbt})`;
}

function itemPanelRaw(entry: ItemPanelEntry): string {
  return entry.raw ?? buildItemRawValue(entry.key, entry.meta);
}

function rawHasNbtTag(raw: string): boolean {
  return /\.withTag\(\s*[\s\S]+?\s*\)\s*$/.test(raw.trim());
}

function itemPanelEntryHasNbtTag(entry: ItemPanelEntry): boolean {
  return Boolean(entry.nbtRaw?.trim()) || rawHasNbtTag(itemPanelRaw(entry));
}

function itemCatalogEntryToPanelEntry(entry: ItemCatalogEntry): ItemPanelEntry {
  return {
    key: entry.key,
    legacyId: entry.legacy_id,
    meta: entry.meta,
    hasNbt: entry.has_nbt,
    displayRu: entry.display_ru,
    displayEn: entry.display_en,
    raw: entry.raw,
    nbtRaw: entry.nbt_raw ?? null,
    hasIcon: entry.has_icon,
    iconUrl: entry.icon_url ?? null,
    sources: entry.sources
  };
}

function applyItemCaseAliasesToRaw(raw: string, aliases: Record<string, string>): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^<([a-zA-Z0-9_.-]+:[a-zA-Z0-9_./-]+)(?::([0-9*]+))?>([\s\S]*)$/);
  if (!match) return trimmed;
  const alias = aliases[match[1].toLowerCase()];
  if (!alias) return trimmed;
  const meta = match[2] ? `:${match[2]}` : '';
  const suffix = match[3] ?? '';
  return `<${alias}${meta}>${suffix}`;
}

function isVolatileScriptsDir(path: string): boolean {
  const normalized = path.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized === 'scripts' || normalized === './scripts' || normalized.startsWith('/app/');
}

function recipeLookupKeysForRaw(raw: string): string[] {
  const parsed = parseItemRaw(raw);
  if (!parsed) return [raw];
  const keys = new Set<string>([raw]);
  keys.add(`<${parsed.key}>`);
  if (parsed.meta !== null) {
    keys.add(`<${parsed.key}:${parsed.meta}>`);
  }
  return [...keys];
}

function collectRecipeOutputRaws(source: string): string[] {
  const outputRaws = new Set<string>();
  const outputPattern = /(?:addShaped|addShapeless)\s*\(\s*(?:"[^"]+"\s*,\s*)?(<[^>]+>(?:\.withTag\([\s\S]*?\))?)/g;
  let match: RegExpExecArray | null;
  while ((match = outputPattern.exec(source)) !== null) {
    outputRaws.add(match[1].trim());
  }
  return [...outputRaws];
}

function collectRecipeIngredientRaws(block: string): string[] {
  const ingredientRaws = new Set<string>();
  const outputRaws = new Set(collectRecipeOutputRaws(block));
  const skippedOutputs = new Set<string>();
  const itemPattern = /<[^>]+>(?:\.withTag\([\s\S]*?\))?/g;
  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(block)) !== null) {
    const raw = match[0].trim();
    if (outputRaws.has(raw) && !skippedOutputs.has(raw)) {
      skippedOutputs.add(raw);
      continue;
    }
    ingredientRaws.add(raw);
  }
  return [...ingredientRaws];
}

function collectRecipeBlockMatches(source: string): RecipeBlockMatch[] {
  const blocks: RecipeBlockMatch[] = [];
  const blockPattern = /(?:recipes\.remove\([\s\S]*?\);\s*)?(?:recipes\.addShaped|recipes\.addShapeless|mods\.avaritia\.ExtremeCrafting\.addShaped)\([\s\S]*?\);/g;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(source)) !== null) {
    blocks.push({ block: match[0], start: match.index, end: match.index + match[0].length });
  }
  return blocks;
}

function collectRecipeBlocks(source: string): string[] {
  return collectRecipeBlockMatches(source).map((match) => match.block);
}

function elapsedMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mergeRecipeMatches(...groups: RecipeView[][]): RecipeView[] {
  const merged: RecipeView[] = [];
  const seen = new Set<string>();
  groups.flat().forEach((recipe) => {
    const matrixKey = recipe.matrix.map((row) => row.map((cell) => cell.raw ?? '').join(',')).join(';');
    const key = `${recipe.output.raw}:${matrixKey}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(recipe);
  });
  return merged;
}

function customItemToEntry(item: CustomItem): ItemPanelEntry {
  const parsed = parseItemRaw(item.item_raw);
  return {
    key: parsed?.key ?? item.item_raw.replace(/[<>]/g, '').toLowerCase(),
    legacyId: null,
    meta: parsed?.meta ?? 0,
    hasNbt: Boolean(item.nbt_raw),
    displayRu: item.display_name,
    displayEn: item.display_name,
    raw: item.item_raw,
    customItemId: item.id,
    customScope: item.scope,
    customOwnerEmail: item.owner_email ?? null,
    customStorage: item.storage ?? 'backend',
    customComment: item.comment ?? ''
  };
}

function normalizeAtlasImageUrl(imageUrl: string): string {
  let url = imageUrl;
  if (imageUrl.startsWith('/api/')) {
    url = apiPath(imageUrl.slice(4));
  }
  const activeServerId = window.localStorage.getItem('active_server_id');
  if (activeServerId && (url.startsWith('http') || url.startsWith('/'))) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}server=${encodeURIComponent(activeServerId)}`;
  }
  return url;
}

function resolveAtlasEntryFromRaw(atlas: ItemPanelAtlas | null | undefined, raw: string, wildcardTick = 0): ItemPanelAtlasEntry | undefined {
  const exact = atlas?.entries[raw];
  if (exact) return exact;
  const parsed = parseItemRaw(raw);
  if (!atlas || !parsed) return undefined;
  const entries = Object.values(atlas.entries);
  const byKeyMeta = entries.find((entry) => entry.item_key === parsed.key && (entry.meta ?? 0) === (parsed.meta ?? 0));
  const byKeyZero = entries.find((entry) => entry.item_key === parsed.key && (entry.meta ?? 0) === 0);
  const firstByKey = entries.find((entry) => entry.item_key === parsed.key);
  if (parsed.wildcardMeta) {
    const variants = entries
      .filter((entry) => entry.item_key === parsed.key)
      .sort((left, right) => (left.meta ?? 0) - (right.meta ?? 0));
    return variants[wildcardTick % Math.max(variants.length, 1)] ?? firstByKey ?? byKeyZero;
  }
  return atlas.entries[`<${parsed.key}${(parsed.meta ?? 0) > 0 ? `:${parsed.meta}` : ''}>`]
    ?? byKeyMeta
    ?? byKeyZero
    ?? firstByKey;
}

function buildAtlasIconStyle(atlas: ItemPanelAtlas, entry: ItemPanelAtlasEntry): CSSProperties {
  return {
    backgroundImage: `url(${normalizeAtlasImageUrl(atlas.image_url)})`,
    backgroundPosition: `-${entry.x}px -${entry.y}px`,
    backgroundSize: `${atlas.columns * atlas.tile_size}px ${atlas.rows * atlas.tile_size}px`
  };
}

function normalizeModIconImageUrl(imageUrl: string): string {
  const publicUrl = imageUrl.replace('/api/admin/mod-icons/atlases/', '/api/mod-icons/atlases/');
  return normalizeAtlasImageUrl(publicUrl);
}

function normalizeModIconLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[_-]+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function modIconBaseLabel(iconName: string): string {
  const leaf = iconName.split('/').pop() ?? iconName;
  return normalizeModIconLabel(leaf.replace(/_\d+$/, ''));
}

function modIconDuplicateOrder(iconName: string): number {
  const match = (iconName.split('/').pop() ?? iconName).match(/_(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : 1;
}

function buildModIconStyle(manifest: ModIconAtlasManifest | null, entry: ModIconAtlasEntry | undefined): CSSProperties | undefined {
  if (!manifest || !entry) return undefined;
  const atlas = manifest.atlases.find((item) => item.file === entry.atlasFile);
  const scale = 32 / Math.max(entry.w, 1);
  return {
    backgroundImage: `url(${normalizeModIconImageUrl(entry.image_url)})`,
    backgroundPosition: `-${entry.x * scale}px -${entry.y * scale}px`,
    backgroundSize: `${(atlas?.columns ?? 1) * entry.w * scale}px ${(atlas?.rows ?? 1) * entry.h * scale}px`
  };
}

function buildModIconMatches(manifest: ModIconAtlasManifest | null, entries: ItemPanelEntry[]): Map<string, ModIconAtlasEntry> {
  const result = new Map<string, ModIconAtlasEntry>();
  if (!manifest) return result;
  const iconGroups = new Map<string, ModIconAtlasEntry[]>();
  const x32Icons = Object.values(manifest.entries.x32 ?? {});
  const x32Keys = new Set(x32Icons.map((icon) => icon.key ?? `${icon.modid}/${icon.iconName ?? ''}`));
  const x256FallbackIcons = Object.values(manifest.entries.x256 ?? {}).filter((icon) => !x32Keys.has(icon.key ?? `${icon.modid}/${icon.iconName ?? ''}`));
  const orderedIcons = [...x32Icons, ...x256FallbackIcons]
    .sort((left, right) => left.size - right.size || modIconDuplicateOrder(left.iconName ?? '') - modIconDuplicateOrder(right.iconName ?? '') || (left.iconName ?? '').localeCompare(right.iconName ?? '', 'ru', { numeric: true }));
  orderedIcons.forEach((icon) => {
    const label = modIconBaseLabel(icon.iconName ?? icon.key ?? icon.modid);
    if (!label) return;
    const groupKey = `${icon.modid.toLowerCase()}|${label}`;
    const group = iconGroups.get(groupKey) ?? [];
    group.push(icon);
    iconGroups.set(groupKey, group);
  });

  const occurrenceByLabel = new Map<string, number>();
  entries.forEach((entry) => {
    const [modid, itemPath = ''] = entry.key.split(':');
    if (!modid) return;
    const labels = [
      entry.displayRu,
      entry.displayEn,
      itemPath.split('/').pop() ?? itemPath,
      itemPath,
    ].map(normalizeModIconLabel).filter(Boolean);
    let icon: ModIconAtlasEntry | undefined;
    for (const label of labels) {
      const groupKey = `${modid.toLowerCase()}|${label}`;
      const group = iconGroups.get(groupKey);
      if (!group?.length) continue;
      const occurrence = occurrenceByLabel.get(groupKey) ?? 0;
      icon = group[Math.min(occurrence, group.length - 1)];
      occurrenceByLabel.set(groupKey, occurrence + 1);
      break;
    }
    if (!icon) return;
    const raw = itemPanelRaw(entry);
    result.set(raw, icon);
    if (entry.meta === 0) {
      result.set(`<${entry.key}:0>`, icon);
    }
  });
  return result;
}

function describeElement(element: Element | null): string {
  if (!element) return 'none';
  const className = element instanceof HTMLElement && typeof element.className === 'string'
    ? element.className.split(/\s+/).filter(Boolean).slice(0, 4).map((item) => `.${item}`).join('')
    : '';
  const ariaLabel = element.getAttribute('aria-label')?.trim();
  const title = element.getAttribute('title')?.trim();
  const label = ariaLabel || title;
  return `${element.tagName.toLowerCase()}${className}${label ? `[${label.slice(0, 64)}]` : ''}`;
}

function recipeHotkeyAction(event: KeyboardEvent): 'recipe' | 'uses' | null {
  const key = event.key.toLowerCase();
  if (event.code === 'KeyR' || key === 'r' || key === 'к') {
    return 'recipe';
  }
  if (event.code === 'KeyU' || key === 'u' || key === 'г') {
    return 'uses';
  }
  return null;
}

function formatHotkeyDebugValue(value: string | number | boolean | null | undefined): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return String(value);
}

function preloadImage(imageUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Failed to load ${imageUrl}`));
    image.src = imageUrl;
  });
}

function splitTopLevel(source: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depthCurly = 0;
  let depthSquare = 0;
  let inString = false;
  let escape = false;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === '{') depthCurly += 1;
    else if (char === '}') depthCurly -= 1;
    else if (char === '[') depthSquare += 1;
    else if (char === ']') depthSquare -= 1;
    if (char === delimiter && depthCurly === 0 && depthSquare === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function splitTopLevelKeyValue(source: string): { key: string; value: string } | null {
  let depthCurly = 0;
  let depthSquare = 0;
  let inString = false;
  let escape = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depthCurly += 1;
    else if (char === '}') depthCurly -= 1;
    else if (char === '[') depthSquare += 1;
    else if (char === ']') depthSquare -= 1;
    if (char === ':' && depthCurly === 0 && depthSquare === 0) {
      return { key: source.slice(0, index).trim(), value: source.slice(index + 1).trim() };
    }
  }
  return null;
}

function parseNbtScalar(value: string): NbtScalarNode {
  const trimmed = value.trim();
  const typedMatch = trimmed.match(/^(.*?)(?:\s+as\s+([a-z_]+))$/i);
  if (typedMatch) {
    const scalarType = typedMatch[2].toLowerCase() as NbtScalarType;
    if (nbtScalarTypes.includes(scalarType)) {
      return { kind: 'scalar', value: typedMatch[1].trim(), scalarType };
    }
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return { kind: 'scalar', value: trimmed.slice(1, -1), scalarType: 'string' };
  }
  return { kind: 'scalar', value: trimmed, scalarType: 'int' };
}

function parseNbtNode(raw: string): NbtNode {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const body = trimmed.slice(1, -1).trim();
    if (!body) return { kind: 'compound', entries: [] };
    const entries = splitTopLevel(body, ',').map((chunk) => splitTopLevelKeyValue(chunk)).filter((entry): entry is { key: string; value: string } => Boolean(entry))
      .map((entry) => ({ key: entry.key.replace(/^"(.*)"$/, '$1').trim(), value: parseNbtNode(entry.value) }));
    return { kind: 'compound', entries };
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const body = trimmed.slice(1, -1).trim();
    if (!body) return { kind: 'list', items: [] };
    return { kind: 'list', items: splitTopLevel(body, ',').map((chunk) => parseNbtNode(chunk)) };
  }
  return parseNbtScalar(trimmed);
}

function renderNbtNode(node: NbtNode): string {
  if (node.kind === 'compound') {
    return `{${node.entries.map((entry) => `${entry.key}: ${renderNbtNode(entry.value)}`).join(', ')}}`;
  }
  if (node.kind === 'list') {
    return `[${node.items.map((item) => renderNbtNode(item)).join(', ')}]`;
  }
  const scalarValue = node.scalarType === 'string' ? `"${node.value}"` : node.value.trim();
  return node.scalarType === 'int' ? scalarValue : `${scalarValue} as ${node.scalarType}`;
}

function parseRawForEditor(raw: string): { modid: string; item: string; meta: number; nbtRoot: NbtCompoundNode } {
  const trimmed = raw.trim();
  const match = trimmed.match(/^<([a-zA-Z0-9_.-]+):([a-zA-Z0-9_./-]+)(?::([0-9*]+))?>(?:\.withTag\(([\s\S]*)\))?$/);
  if (!match) {
    return { modid: 'minecraft', item: 'stone', meta: 0, nbtRoot: { kind: 'compound', entries: [] } };
  }
  const modid = match[1].toLowerCase();
  const item = match[2].toLowerCase();
  const meta = match[3] ? Number.parseInt(match[3], 10) || 0 : 0;
  const nbtRaw = (match[4] ?? '').trim();
  if (!nbtRaw || nbtRaw === '{}' || nbtRaw === '{ }') {
    return { modid, item, meta, nbtRoot: { kind: 'compound', entries: [] } };
  }
  const parsedNode = parseNbtNode(nbtRaw);
  if (parsedNode.kind !== 'compound') {
    return { modid, item, meta, nbtRoot: { kind: 'compound', entries: [{ key: 'value', value: parsedNode }] } };
  }
  return { modid, item, meta, nbtRoot: parsedNode };
}

function buildNbtRawFromRoot(root: NbtCompoundNode): string {
  const compacted: NbtCompoundNode = {
    kind: 'compound',
    entries: root.entries
      .map((entry) => ({ key: entry.key.trim(), value: entry.value }))
      .filter((entry) => entry.key.length > 0)
  };
  if (!compacted.entries.length) return '';
  return renderNbtNode(compacted);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function normalizePanelLayout(raw?: PanelLayoutItem[] | null): PanelLayoutItem[] {
  const existingById = new Map((raw ?? []).map((item) => [item.id, item]));
  return defaultPanelLayout.map((panel) => {
    const existing = existingById.get(panel.id);
    return {
      ...panel,
      visible: existing?.visible ?? panel.visible
    };
  });
}

function getVisiblePanels(layout: PanelLayoutItem[], panelIds: PanelId[]): PanelLayoutItem[] {
  const normalized = normalizePanelLayout(layout);
  return panelIds
    .map((panelId) => normalized.find((panel) => panel.id === panelId))
    .filter((panel): panel is PanelLayoutItem => Boolean(panel?.visible));
}

function normalizeWorkspaceLayout(raw?: WorkspaceLayout | null): WorkspaceLayout {
  return {
    columns: clamp(Number(raw?.columns ?? 3), 1, 3) as 1 | 2 | 3,
    compact_header: Boolean(raw?.compact_header ?? true),
    top_split_ratio: defaultWorkspaceLayout.top_split_ratio,
    main_sidebar_ratio: defaultWorkspaceLayout.main_sidebar_ratio,
    top_height: defaultWorkspaceLayout.top_height,
    bottom_height: defaultWorkspaceLayout.bottom_height,
    extreme_grid_gap: clamp(Number(raw?.extreme_grid_gap ?? defaultWorkspaceLayout.extreme_grid_gap ?? 8), 0, 24)
  };
}

function normalizeUiPreferences(settings?: ProjectSettings | null): UiPreferences {
  const source = settings?.ui_preferences;
  const normalizedScale = clamp(Number(source?.ui_scale ?? 1.15), 1, 1.5);
  return {
    display_mode: (source?.display_mode ?? 'text') as DisplayMode,
    animations_enabled: source?.animations_enabled !== false,
    density_mode: (source?.density_mode ?? 'normal') as DensityMode,
    editor_mode: (source?.editor_mode ?? 'edit') as EditorMode,
    theme_mode: (source?.theme_mode ?? 'dark') as ThemeMode,
    ui_scale: ([1, 1.15, 1.3, 1.5].includes(normalizedScale) ? normalizedScale : 1.15) as UiScale,
    nei_page_size: clamp(Math.floor(Number(source?.nei_page_size ?? 32) || 32), 16, 512),
    language: (source?.language ?? 'ru') as UiLanguage,
    active_view_tab: (source?.active_view_tab ?? 'editor') as AppTab,
    reset_layout_version: source?.reset_layout_version ?? 4,
    panel_layout: normalizePanelLayout(source?.panel_layout),
    workspace_layout: normalizeWorkspaceLayout(source?.workspace_layout),
    icon_surfaces: normalizeIconSurfaceSettings(source?.icon_surfaces)
  };
}

function normalizeNeiFavoritesProfile(profile?: Partial<NeiFavoritesProfile> | null): NeiFavoritesProfile {
  const tabs = Array.isArray(profile?.tabs) ? profile.tabs : [];
  const normalizedTabs = tabs
    .map((tab, index) => ({
      id: String(tab?.id || `tab-${index + 1}`).trim() || `tab-${index + 1}`,
      name: String(tab?.name || `Вкладка ${index + 1}`).trim().slice(0, 64) || `Вкладка ${index + 1}`,
      items: Array.isArray(tab?.items)
        ? tab.items
          .map((item) => ({
            raw: String(item?.raw || '').trim(),
            addedAt: Number(item?.addedAt) || 0
          }))
          .filter((item, itemIndex, allItems) => item.raw && allItems.findIndex((candidate) => candidate.raw === item.raw) === itemIndex)
          .slice(0, 512)
        : []
    }))
    .filter((tab, index, allTabs) => tab.id && allTabs.findIndex((candidate) => candidate.id === tab.id) === index)
    .slice(0, 32);
  const safeTabs = normalizedTabs.length ? normalizedTabs : defaultNeiFavoritesProfile.tabs;
  const activeTabId = safeTabs.some((tab) => tab.id === profile?.activeTabId) ? String(profile?.activeTabId) : safeTabs[0].id;
  return {
    activeTabId,
    favoriteHotkey: String(profile?.favoriteHotkey || defaultNeiFavoritesProfile.favoriteHotkey).trim().slice(0, 32) || defaultNeiFavoritesProfile.favoriteHotkey,
    hiddenPatterns: normalizeNeiHiddenPatterns(profile?.hiddenPatterns ?? []),
    tabs: safeTabs
  };
}

function normalizeNeiHiddenPatterns(value: string[] | string): string[] {
  const rawValues = Array.isArray(value) ? value : value.replace(/,/g, '\n').split(/\r?\n/);
  const seen = new Set<string>();
  const patterns: string[] = [];
  rawValues.forEach((raw) => {
    const pattern = String(raw || '').trim().slice(0, 256);
    if (!pattern || seen.has(pattern)) return;
    seen.add(pattern);
    patterns.push(pattern);
  });
  return patterns.slice(0, 200);
}

function rawBaseWithoutNbt(raw: string): string {
  return raw.replace(/\.withTag\([\s\S]*\)\s*$/, '').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardPatternMatches(pattern: string, value: string): boolean {
  const normalizedPattern = pattern.trim().toLowerCase();
  if (!normalizedPattern) return false;
  const normalizedValue = value.trim().toLowerCase();
  const expression = `^${normalizedPattern.split('*').map(escapeRegExp).join('[\\s\\S]*')}$`;
  return new RegExp(expression).test(normalizedValue);
}

function entryMatchesHiddenPattern(entry: ItemPanelEntry, pattern: string): boolean {
  const raw = itemPanelRaw(entry);
  const rawBase = rawBaseWithoutNbt(raw);
  return wildcardPatternMatches(pattern, raw)
    || wildcardPatternMatches(pattern, rawBase)
    || wildcardPatternMatches(pattern, `<${entry.key}${entry.meta > 0 ? `:${entry.meta}` : ''}>`)
    || wildcardPatternMatches(pattern, entry.key)
    || wildcardPatternMatches(pattern, entry.displayRu)
    || wildcardPatternMatches(pattern, entry.displayEn);
}

type FavoriteHotkeySpec = {
  code: string;
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

function parseFavoriteHotkey(value: string): FavoriteHotkeySpec {
  const tokens = String(value || defaultNeiFavoritesProfile.favoriteHotkey)
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);
  const keyToken = tokens[tokens.length - 1] || defaultNeiFavoritesProfile.favoriteHotkey;
  const modifiers = new Set(tokens.slice(0, -1).map((token) => token.toLowerCase()));
  const upperKey = keyToken.length === 1 ? keyToken.toUpperCase() : keyToken;
  const code = /^Key[A-Z]$/.test(upperKey)
    ? upperKey
    : /^[A-Z]$/.test(upperKey)
      ? `Key${upperKey}`
      : /^Digit[0-9]$/.test(upperKey)
        ? upperKey
        : /^[0-9]$/.test(upperKey)
          ? `Digit${upperKey}`
          : upperKey;
  return {
    code,
    key: keyToken.toLowerCase(),
    ctrlKey: modifiers.has('ctrl') || modifiers.has('control'),
    altKey: modifiers.has('alt'),
    shiftKey: modifiers.has('shift'),
    metaKey: modifiers.has('meta') || modifiers.has('cmd') || modifiers.has('win')
  };
}

function favoriteHotkeyMatches(event: KeyboardEvent, hotkey: string): boolean {
  const spec = parseFavoriteHotkey(hotkey);
  if (event.ctrlKey !== spec.ctrlKey || event.altKey !== spec.altKey || event.shiftKey !== spec.shiftKey || event.metaKey !== spec.metaKey) {
    return false;
  }
  return event.code === spec.code || event.key.toLowerCase() === spec.key;
}

function nextFavoriteTabId(): string {
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function App({ authUser = fallbackAuthUser, onLogout = async () => undefined, onResetServer, activeServerId }: AppProps) {
  const [sharedCraftDraftEnabled, setSharedCraftDraftEnabled] = useState(() => loadSharedCraftDraftEnabled());
  const localDraftStorageKeyCurrent = serverLocalDraftStorageKey(authUser.email, activeServerId, sharedCraftDraftEnabled);
  const itemPanelCacheKey = serverScopedStorageKey(ITEMPANEL_CACHE_KEY, activeServerId);
  const itemSearchIconCacheKey = serverScopedStorageKey(ITEM_SEARCH_ICON_CACHE_KEY, activeServerId);
  const localDraftRef = useRef<LocalDraftPayload | null | undefined>(undefined);
  if (localDraftRef.current === undefined) {
    localDraftRef.current = loadLocalDraftPayload(authUser.email, localDraftStorageKeyCurrent);
  }
  const restoredDraft = localDraftRef.current?.state ?? null;

  const [input, setInput] = useState(restoredDraft?.input ?? '');
  const [matrix, setMatrix] = useState<CellValue[][]>(() => restoredDraft ? cloneMatrix(restoredDraft.matrix) : cloneMatrix(defaultMatrix));
  const [serversList, setServersList] = useState<Array<{ id: string; name: string }>>([]);
  
  useEffect(() => {
    listServers().then(res => setServersList(res.servers)).catch(() => {});
  }, []);
  const [status, setStatus] = useState('Готово');
  const [strictBinding, setStrictBinding] = useState(restoredDraft?.strictBinding ?? defaultRecipe.binding_mode === 'strict');
  const [metaMode, setMetaMode] = useState(restoredDraft?.metaMode ?? 'strict');
  const [recipe, setRecipe] = useState<RecipeView>(restoredDraft?.recipe ?? defaultRecipe);
  const [outputRaw, setOutputRaw] = useState(restoredDraft?.outputRaw ?? defaultRecipe.output.raw);
  const [craftBodyTemplate, setCraftBodyTemplate] = useState<CraftBodyTemplate | null>(() => loadCraftBodyTemplate());
  const [isLayoutSettingsOpen, setIsLayoutSettingsOpen] = useState(false);
  const [isCraftEditorOpen, setIsCraftEditorOpen] = useState(false);
  const [isNbtEditorOpen, setIsNbtEditorOpen] = useState(false);
  const [isLocalSaveModalOpen, setIsLocalSaveModalOpen] = useState(false);
  const [isCloudSaveModalOpen, setIsCloudSaveModalOpen] = useState(false);
  const [isSaveConflictModalOpen, setIsSaveConflictModalOpen] = useState(false);
  const [saveConflictMatches, setSaveConflictMatches] = useState<RecipeView[]>([]);
  const [cloudUploadConflict, setCloudUploadConflict] = useState<CloudUploadConflictState | null>(null);
  const [cloudSaveNameDraft, setCloudSaveNameDraft] = useState('');
  const [cloudSaveError, setCloudSaveError] = useState('');
  const [craftEditorTarget, setCraftEditorTarget] = useState<CraftEditorTarget>(restoredDraft?.craftEditorTarget ?? { kind: 'output' });
  const [craftSourceDraft, setCraftSourceDraft] = useState(restoredDraft?.craftSourceDraft ?? '');
  const [craftSourceMode, setCraftSourceMode] = useState<'structured' | 'raw'>('structured');
  const [itemModDraft, setItemModDraft] = useState(restoredDraft?.itemModDraft ?? 'minecraft');
  const [itemNameDraft, setItemNameDraft] = useState(restoredDraft?.itemNameDraft ?? 'stone');
  const [itemMetaDraft, setItemMetaDraft] = useState(restoredDraft?.itemMetaDraft ?? '0');
  const [nbtRootDraft, setNbtRootDraft] = useState<NbtCompoundNode>(restoredDraft?.nbtRootDraft ?? { kind: 'compound', entries: [] });
  const [collapsedNbtPaths, setCollapsedNbtPaths] = useState<Record<string, boolean>>(restoredDraft?.collapsedNbtPaths ?? {});
  const [saveStatus, setSaveStatus] = useState('Не сохранено');
  const [lastApiStatus, setLastApiStatus] = useState('idle');
  const [lastParseResult, setLastParseResult] = useState('Ещё не выполнялся');
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [uiPreferences, setUiPreferences] = useState<UiPreferences>(defaultUiPreferences);
  const iconSurfaceStyle = useIconSurfaceCssVars(uiPreferences.icon_surfaces);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>(restoredDraft?.workspaceTab ?? 'editor');
  const [itemPanelTranslations, setItemPanelTranslations] = useState<ItemPanelTranslations>({
    byKey: new Map(),
    byKeyMeta: new Map(),
    byDisplayRu: new Map(),
    byDisplayEn: new Map(),
    entries: [],
    fallbackToFirstMeta: getItemPanelFallbackToFirstMetaEnabled()
  });
  const [isTextureModsOpen, setIsTextureModsOpen] = useState(false);
  const [selectedTextureMods, setSelectedTextureMods] = useState<Record<string, boolean>>(restoredDraft?.selectedTextureMods ?? {});
  const [textureLoadState, setTextureLoadState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [textureLoadStatus, setTextureLoadStatus] = useState('');
  const [itemSearchQuery, setItemSearchQuery] = useState(restoredDraft?.itemSearchQuery ?? '');
  const [neiSearchQuery, setNeiSearchQuery] = useState(restoredDraft?.neiSearchQuery ?? '');
  const [neiPage, setNeiPage] = useState(restoredDraft?.neiPage ?? 0);
  const [neiColumnCount, setNeiColumnCount] = useState(NEI_FALLBACK_COLUMNS);
  const [itemPanelAtlas, setItemPanelAtlas] = useState<ItemPanelAtlas | null | undefined>(undefined);
  const [modIconManifest, setModIconManifest] = useState<ModIconAtlasManifest | null>(null);
  const [heldItemRaw, setHeldItemRaw] = useState<string | null>(null);
  const [hoveredItemRaw, setHoveredItemRaw] = useState<string | null>(null);
  const [uploadedDrafts, setUploadedDrafts] = useState<UploadedDraft[]>(restoredDraft?.uploadedDrafts ?? []);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(restoredDraft?.selectedDraftId ?? null);
  const [selectedUploadedDraftIds, setSelectedUploadedDraftIds] = useState<Record<string, boolean>>({});
  const [recipeDraftTemplates, setRecipeDraftTemplates] = useState<RecipeDraftTemplate[]>(() => loadRecipeDraftTemplates(authUser.email));
  const [customRemoveTemplates, setCustomRemoveTemplates] = useState<RemoveTemplateOption[]>(() => loadCustomRemoveTemplates());
  const [removeTemplateSelection, setRemoveTemplateSelection] = useState<Record<string, string>>(() => loadRemoveTemplateSelection());
  const [removeTemplateDraft, setRemoveTemplateDraft] = useState('recipes.remove({output_wildcard});');
  const [selectedDraftItemRaw, setSelectedDraftItemRaw] = useState<string | null>(null);
  const [draftItemSearchQuery, setDraftItemSearchQuery] = useState('');
  const [draftItemSortMode, setDraftItemSortMode] = useState<DraftItemSortMode>('drafts-desc');
  const [draftItemGroupMode, setDraftItemGroupMode] = useState<DraftItemGroupMode>('none');
  const [collapsedDraftGroups, setCollapsedDraftGroups] = useState<Record<string, boolean>>({});
  const [draftItemPage, setDraftItemPage] = useState(0);
  const [previewDraftTemplateId, setPreviewDraftTemplateId] = useState<string | null>(null);
  const [draftTemplateContextMenu, setDraftTemplateContextMenu] = useState<DraftTemplateContextMenuState | null>(null);
  const [recipeAvailability, setRecipeAvailability] = useState<Record<string, boolean>>({});
  const [recipeUsesModal, setRecipeUsesModal] = useState<RecipeUsesModalState | null>(null);
  const [similarRecipes, setSimilarRecipes] = useState<SimilarRecipeState | null>(null);
  const [recipeBackHistory, setRecipeBackHistory] = useState<RecipeHistoryEntry[]>(restoredDraft?.recipeBackHistory ?? []);
  const [recipeForwardHistory, setRecipeForwardHistory] = useState<RecipeHistoryEntry[]>(restoredDraft?.recipeForwardHistory ?? []);
  const [isHotkeyDebugEnabled, setIsHotkeyDebugEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(HOTKEY_DEBUG_ENABLED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [hotkeyDebugEvents, setHotkeyDebugEvents] = useState<HotkeyDebugEvent[]>([]);
  const [debugFilters, setDebugFilters] = useState<DebugFilters>(() => loadBooleanRecord(DEBUG_FILTERS_STORAGE_KEY, defaultDebugFilters));
  const [debugLevelFilters, setDebugLevelFilters] = useState<DebugLevelFilters>(() => loadBooleanRecord(DEBUG_LEVEL_FILTERS_STORAGE_KEY, defaultDebugLevelFilters));
  const [debugSection, setDebugSection] = useState<DebugSection>('overview');
  const [selectedReplacementMod, setSelectedReplacementMod] = useState<string>('');
  const [scannedReplacementItems, setScannedReplacementItems] = useState<Array<{ raw: string; display_name: string | null; icon_url: string | null; animated: boolean }>>([]);
  const [replacementMappings, setReplacementMappings] = useState<Record<string, string>>({});
  const [replacementLoading, setReplacementLoading] = useState<boolean>(false);
  const [replacementStatus, setReplacementStatus] = useState<string>('');
  const [customItems, setCustomItems] = useState<CustomItem[]>(() => loadLocalCustomItems(authUser.email));
  const [customItemsStatus, setCustomItemsStatus] = useState('');
  const [neiContextMenu, setNeiContextMenu] = useState<NeiContextMenuState | null>(null);
  const [touchItemInspection, setTouchItemInspection] = useState<TouchItemInspectionState | null>(null);
  const [oreDictGroups, setOreDictGroups] = useState<Record<string, string[]>>({});
  const [oreDictOverrides, setOreDictOverrides] = useState<Record<string, string | null>>(() => {
    try {
      const data = window.localStorage.getItem(OREDICT_OVERRIDES_STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  });
  const [oreDictIconPriority, setOreDictIconPriority] = useState<Record<string, string>>(() => {
    try {
      const data = window.localStorage.getItem(OREDICT_ICON_PRIORITY_STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  });
  const [neiFavorites, setNeiFavorites] = useState<NeiFavoritesProfile>(defaultNeiFavoritesProfile);
  const [neiFavoritesStatus, setNeiFavoritesStatus] = useState('');
  const [newFavoriteTabName, setNewFavoriteTabName] = useState('');
  const [neiHiddenPatternsDraft, setNeiHiddenPatternsDraft] = useState('');
  const [taskRawLookup, setTaskRawLookup] = useState<Set<string>>(() => new Set());
  const [taskLookupStatus, setTaskLookupStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [taskPrefillItem, setTaskPrefillItem] = useState<RecipeTaskPrefillItem | null>(null);
  const [customItemForm, setCustomItemForm] = useState<CustomItemFormState | null>(null);
  const [customItemNbtRoot, setCustomItemNbtRoot] = useState<NbtCompoundNode>({ kind: 'compound', entries: [] });
  const [wildcardCycleTick, setWildcardCycleTick] = useState(0);
  const [adminUsers, setAdminUsers] = useState<AuthUser[]>([]);
  const [adminUsersStatus, setAdminUsersStatus] = useState('');
  const [accessControl, setAccessControl] = useState<AccessControlSettings>({ whitelist_enabled: false, whitelist_emails: [] });
  const [accessWhitelistDraft, setAccessWhitelistDraft] = useState('');
  const [accessStatus, setAccessStatus] = useState('');
  const [modIconStatus, setModIconStatus] = useState<ModIconAdminStatus | null>(null);
  const [modIconMessage, setModIconMessage] = useState('');
  const [itemPanelCsvMessage, setItemPanelCsvMessage] = useState('');
  const [itemPanelJsonMessage, setItemPanelJsonMessage] = useState('');
  const [itemCatalogSummary, setItemCatalogSummary] = useState<Record<string, unknown> | null>(null);
  const [oreDictUploading, setOreDictUploading] = useState(false);
  const [oreDictMessage, setOreDictMessage] = useState('');
  const [itemPanelCsvUploading, setItemPanelCsvUploading] = useState(false);
  const [itemPanelJsonUploading, setItemPanelJsonUploading] = useState(false);
  const [itemPanelMerging, setItemPanelMerging] = useState(false);
  const [modIconUploading, setModIconUploading] = useState(false);
  const [modIconGenerating, setModIconGenerating] = useState(false);
  const [modIconArchiveAction, setModIconArchiveAction] = useState('');
  const [isWipeUpdateOpen, setIsWipeUpdateOpen] = useState(false);
  const [itemCaseAliasReport, setItemCaseAliasReport] = useState<ItemCaseAliasReport | null>(null);
  const [itemCaseAliasStatus, setItemCaseAliasStatus] = useState('');
  const [itemCaseAliasGenerating, setItemCaseAliasGenerating] = useState(false);
  const [itemCaseAliasLogUploading, setItemCaseAliasLogUploading] = useState(false);
  const [manualAliasKey, setManualAliasKey] = useState('');
  const [manualAliasValue, setManualAliasValue] = useState('');
  const [manualAliasSaving, setManualAliasSaving] = useState(false);
  const [cloudFiles, setCloudFiles] = useState<ZsCloudFile[]>([]);
  const [cloudStatus, setCloudStatus] = useState('');
  const [cloudStorageUpdating, setCloudStorageUpdating] = useState(false);
  const [cloudContextMenu, setCloudContextMenu] = useState<CloudFileContextMenuState | null>(null);
  const [isRootBackupOpen, setIsRootBackupOpen] = useState(false);
  const [cloudBackups, setCloudBackups] = useState<ZsCloudBackup[]>([]);
  const [cloudBackupStatus, setCloudBackupStatus] = useState('');
  const [itemSearchIcons, setItemSearchIcons] = useState<Record<string, string | null>>(() => {
    try {
      const raw = window.localStorage.getItem(itemSearchIconCacheKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, string | null>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });
  const [modalScales, setModalScales] = useState<Record<ModalScaleKey, number>>(restoredDraft?.modalScales ?? { help: 1, layout: 1, craft: 1, nbtTree: 1.1 });
  const [activeScaleControl, setActiveScaleControl] = useState<ModalScaleKey | null>(null);

  const persistTimerRef = useRef<number | null>(null);
  const localDraftPersistTimerRef = useRef<number | null>(null);
  const lastLocalDraftHashRef = useRef(localDraftRef.current?.craftHash ?? '');
  const lastLocalDraftStorageKeyRef = useRef(localDraftStorageKeyCurrent);
  const autoParseTimerRef = useRef<number | null>(null);
  const settingsRetryTimerRef = useRef<number | null>(null);
  const neiFavoritesSaveTimerRef = useRef<number | null>(null);
  const neiFavoritesRef = useRef<NeiFavoritesProfile>(defaultNeiFavoritesProfile);
  const latestUiPreferencesRef = useRef<UiPreferences>(defaultUiPreferences);
  const hasLocalUiChangesRef = useRef(false);
  const lastRequestedParseRef = useRef('');
  const texturePauseRef = useRef(false);
  const textureCancelRef = useRef(false);
  const iconRequestRef = useRef<Set<string>>(new Set());
  const itemSearchIconCacheKeyRef = useRef(itemSearchIconCacheKey);
  const neiListRef = useRef<HTMLDivElement | null>(null);
  const cursorPointRef = useRef({ x: 0, y: 0 });
  const heldCursorRef = useRef<HTMLDivElement | null>(null);
  const cursorFrameRef = useRef<number | null>(null);
  const hoveredItemRawRef = useRef<string | null>(null);
  const hotkeyDebugActiveRef = useRef(false);
  const hotkeyDebugCounterRef = useRef(0);

  const t = createTranslator(uiPreferences.language);
  const areAnimationsEnabled = uiPreferences.animations_enabled;
  const canEditRecipes = can(authUser, 'recipes:edit');
  const canCreateTemplates = can(authUser, 'templates:create');
  const canManageSettings = can(authUser, 'settings:manage');
  const canManageRoles = can(authUser, 'roles:manage');
  const canUseDebug = can(authUser, 'debug:manage');
  const canManageModIcons = can(authUser, 'mod-icons:manage');
  const canUseNeiFavorites = can(authUser, 'nei-favorites:manage');
  const canManageCloudFiles = can(authUser, 'files:manage');
  const canManageTasks = can(authUser, 'tasks:manage');
  const canUseTechnicalPanel = canManageModIcons || canManageRoles || canUseDebug;
  const canUseItemCaseAliases = canCreateTemplates || canEditRecipes || canManageModIcons;
  const canOpenSettings = canManageSettings || canUseNeiFavorites;
  const itemCaseAliases = itemCaseAliasReport?.itemAliases ?? EMPTY_ITEM_CASE_ALIASES;
  const isHotkeyDebugActive = canManageSettings && isHotkeyDebugEnabled;
  hotkeyDebugActiveRef.current = isHotkeyDebugActive;
  const workspaceTabs = [
    { id: 'editor' as const, label: uiPreferences.language === 'ru' ? 'Главное меню' : 'Main menu', visible: true },
    { id: 'recipe' as const, label: uiPreferences.language === 'ru' ? 'Черновики' : 'Drafts', visible: canCreateTemplates || canEditRecipes },
    { id: 'tasks' as const, label: uiPreferences.language === 'ru' ? 'Задачи' : 'Tasks', visible: canManageTasks },
    { id: 'technical' as const, label: uiPreferences.language === 'ru' ? 'Техническая панель' : 'Technical panel', visible: canUseTechnicalPanel },
    { id: 'cloud' as const, label: uiPreferences.language === 'ru' ? 'Облако' : 'Cloud', visible: canManageCloudFiles }
  ].filter((tab) => tab.visible);

  function logAppDebug(category: DebugCategory, message: string, details?: HotkeyDebugDetails, level: HotkeyDebugLevel = 'info') {
    if (!hotkeyDebugActiveRef.current) {
      return;
    }
    if (!debugFilters[category] || !debugLevelFilters[level]) {
      return;
    }
    const entry: HotkeyDebugEvent = {
      id: hotkeyDebugCounterRef.current + 1,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      level,
      category,
      message,
      details
    };
    hotkeyDebugCounterRef.current = entry.id;
    setHotkeyDebugEvents((current) => [entry, ...current].slice(0, 80));
    console.info(`[CubixRecipes debug:${category}]`, message, details ?? {});
  }

  function logHotkeyDebug(message: string, details?: HotkeyDebugDetails, level: HotkeyDebugLevel = 'info') {
    logAppDebug('hotkeys', message, details, level);
  }

  function setHotkeyDebugEnabledForAdmin(enabled: boolean) {
    if (!canManageSettings) {
      return;
    }
    hotkeyDebugActiveRef.current = enabled;
    setIsHotkeyDebugEnabled(enabled);
    if (!enabled) {
      setHotkeyDebugEvents([]);
    }
    try {
      window.localStorage.setItem(HOTKEY_DEBUG_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {
      // Local debug preferences are best-effort only.
    }
  }

  function setSharedCraftDraftMode(enabled: boolean) {
    persistSharedCraftDraftEnabled(enabled);
    lastLocalDraftHashRef.current = '';
    setSharedCraftDraftEnabled(enabled);
    setSaveStatus(enabled ? 'Крафтовый стол общий для всех серверов' : 'Крафтовый стол сохраняется отдельно для сервера');
  }

  function toggleDebugFilter(category: DebugCategory, enabled: boolean) {
    if (!canManageSettings) return;
    setDebugFilters((current) => {
      const next = { ...current, [category]: enabled };
      persistBooleanRecord(DEBUG_FILTERS_STORAGE_KEY, next);
      return next;
    });
  }

  function toggleDebugLevel(level: HotkeyDebugLevel, enabled: boolean) {
    if (!canManageSettings) return;
    setDebugLevelFilters((current) => {
      const next = { ...current, [level]: enabled };
      persistBooleanRecord(DEBUG_LEVEL_FILTERS_STORAGE_KEY, next);
      return next;
    });
  }

  function updateHoveredItemRaw(next: string | null | ((current: string | null) => string | null)) {
    const previous = hoveredItemRawRef.current;
    const value = typeof next === 'function' ? next(hoveredItemRawRef.current) : next;
    if (value === previous) {
      return;
    }
    hoveredItemRawRef.current = value;
    setHoveredItemRaw(value);
    if (value) {
      logHotkeyDebug('hover set', { raw: value }, 'info');
    } else if (previous) {
      logHotkeyDebug('hover cleared', { previous }, 'info');
    }
  }

  function updateHoveredItemRawFast(next: string | null | ((current: string | null) => string | null)) {
    hoveredItemRawRef.current = typeof next === 'function' ? next(hoveredItemRawRef.current) : next;
  }

  function moveHeldCursor() {
    const cursor = heldCursorRef.current;
    if (!cursor) return;
    const point = cursorPointRef.current;
    cursor.style.transform = `translate3d(${point.x + 14}px, ${point.y + 14}px, 0)`;
  }

  async function refreshAdminUsers() {
    if (!canManageRoles) return;
    setAdminUsersStatus('Loading users...');
    try {
      const payload = await listUsers();
      setAdminUsers(payload.users);
      setAdminUsersStatus(`Users: ${payload.users.length}`);
    } catch (error) {
      setAdminUsersStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function changeAdminUserRole(userId: number, role: UserRole) {
    setAdminUsersStatus('Saving role...');
    try {
      const payload = await updateUserRole(userId, role);
      setAdminUsers((current) => current.map((user) => user.id === payload.user.id ? payload.user : user));
      setAdminUsersStatus('Role saved');
    } catch (error) {
      setAdminUsersStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshAccessControl() {
    if (!canManageRoles) return;
    setAccessStatus('Загружаю whitelist...');
    try {
      const payload = await getAccessControlSettings();
      setAccessControl(payload);
      setAccessWhitelistDraft(payload.whitelist_emails.join('\n'));
      setAccessStatus(payload.whitelist_enabled ? 'Whitelist включен' : 'Whitelist выключен');
    } catch (error) {
      setAccessStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveAccessControl(nextEnabled = accessControl.whitelist_enabled) {
    if (!canManageRoles) return;
    const emails = accessWhitelistDraft.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
    setAccessStatus('Сохраняю whitelist...');
    try {
      const payload = await updateAccessControlSettings({ whitelist_enabled: nextEnabled, whitelist_emails: emails });
      setAccessControl(payload);
      setAccessWhitelistDraft(payload.whitelist_emails.join('\n'));
      setAccessStatus(payload.whitelist_enabled ? 'Whitelist включен' : 'Whitelist выключен');
    } catch (error) {
      setAccessStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshTaskRawLookup() {
    if (!canManageTasks) return new Set<string>();
    setTaskLookupStatus('loading');
    try {
      const board = await listRecipeTasks();
      const next = new Set<string>();
      board.tasks.forEach((task) => {
        if (task.itemRaw) next.add(task.itemRaw);
      });
      setTaskRawLookup(next);
      setTaskLookupStatus('ready');
      return next;
    } catch (error) {
      setTaskLookupStatus('error');
      return taskRawLookup;
    }
  }

  function rawHasTask(raw: string): boolean {
    if (taskRawLookup.has(raw)) return true;
    const targetKeys = new Set(recipeLookupKeysForRaw(raw));
    for (const taskRaw of taskRawLookup) {
      if (recipeLookupKeysForRaw(taskRaw).some((key) => targetKeys.has(key))) {
        return true;
      }
    }
    return false;
  }

  function buildTaskPayloadFromDefaultTemplate(raw: string): RecipeTaskPayload | null {
    const template = loadTaskDefaultTemplate();
    if (!template.enabled) return null;
    const itemRaw = applyItemCaseAlias(raw);
    const itemTitle = resolveCellTitle(itemRaw) || resolveCellTitle(raw) || itemRaw;
    return {
      itemRaw,
      itemTitle,
      title: applyTaskTextTemplate(template.titleTemplate, itemTitle, itemRaw) || itemTitle || itemRaw,
      description: applyTaskTextTemplate(template.descriptionTemplate, itemTitle, itemRaw),
      status: template.status,
      priority: template.priority,
      estimatedDays: template.deadlineDays,
      deadlineDate: taskTemplateDateInputValue(template.deadlineDays),
      assigneeEmail: template.assigneeEmail || authUser.email,
      helperEmails: taskTemplateEmails(template.helperEmailsText)
    };
  }

  async function handleNeiItemTemplateTask(raw: string) {
    const payload = buildTaskPayloadFromDefaultTemplate(raw);
    if (!payload) {
      setStatus('Включите шаблон задач в настройках вкладки "Задачи".');
      return;
    }
    try {
      const result = await createRecipeTask(payload);
      setTaskRawLookup((current) => new Set([...current, result.task.itemRaw]));
      setTaskLookupStatus('ready');
      setNeiContextMenu(null);
      setStatus(`Задача по шаблону создана: ${result.task.title}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function applyItemPanelEntries(entries: ItemPanelEntry[], summary?: Record<string, unknown>) {
    const fallbackToFirstMeta = getItemPanelFallbackToFirstMetaEnabled();
    const uniqueEntries = dedupeItemPanelEntries(entries);
    setItemPanelTranslations(buildItemPanelTranslationsFromEntries(uniqueEntries, fallbackToFirstMeta));
    const iconUpdates: Record<string, string> = {};
    uniqueEntries.forEach((entry) => {
      if (!entry.iconUrl) return;
      const raw = itemPanelRaw(entry);
      iconUpdates[raw] = entry.iconUrl;
      iconUpdates[buildItemRawValue(entry.key, entry.meta)] = entry.iconUrl;
    });
    if (Object.keys(iconUpdates).length > 0) {
      setItemSearchIcons((current) => ({ ...current, ...iconUpdates }));
    }
    if (summary) {
      setItemCatalogSummary(summary);
    }
    try {
      window.localStorage.setItem(itemPanelCacheKey, JSON.stringify({ entries: uniqueEntries, summary: summary ?? null }));
    } catch {
      // Cache persistence is best-effort.
    }
  }

  async function refreshItemCatalogTranslations(): Promise<Record<string, unknown>> {
    const payload = await getItemCatalog();
    const entries = payload.entries.map(itemCatalogEntryToPanelEntry);
    applyItemPanelEntries(entries, payload.summary);
    return payload.summary;
  }

  async function refreshModIconStatus() {
    if (!canManageModIcons) return;
    setModIconMessage('Загружаю статус иконок...');
    try {
      const payload = await getModIconAdminStatus();
      setModIconStatus(payload);
      setModIconManifest(payload.manifest);
      setModIconMessage(`Архивов: ${payload.archives.length}. Атласов: ${payload.manifest?.atlases.length ?? 0}.`);
    } catch (error) {
      setModIconMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleModIconArchiveFiles(files: FileList | File[]) {
    if (!canManageModIcons) return;
    const file = Array.from(files)[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setModIconMessage('Можно загрузить только .zip архив.');
      return;
    }
    setModIconUploading(true);
    setModIconMessage(`Загружаю ${file.name}...`);
    try {
      const payload = await uploadModIconArchive(file, false);
      setModIconStatus(payload);
      setModIconManifest(payload.manifest);
      setModIconMessage(`Архив загружен: ${file.name}`);
    } catch (error) {
      if (error instanceof ApiConflictError) {
        const replace = window.confirm(`Архив ${file.name} уже есть. Заменить его?`);
        if (replace) {
          try {
            const payload = await uploadModIconArchive(file, true);
            setModIconStatus(payload);
            setModIconManifest(payload.manifest);
            setModIconMessage(`Архив заменён: ${file.name}`);
          } catch (replaceError) {
            setModIconMessage(replaceError instanceof Error ? replaceError.message : String(replaceError));
          }
        } else {
          setModIconMessage('Загрузка отменена: архив уже существует.');
        }
      } else {
        setModIconMessage(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setModIconUploading(false);
    }
  }

  function handleDownloadModIconArchive(filename: string) {
    if (!canManageModIcons) return;
    window.open(getModIconArchiveDownloadUrl(filename), '_blank', 'noopener,noreferrer');
  }

  async function handleCleanModIconArchive(filename: string) {
    if (!canManageModIcons || modIconArchiveAction) return;
    setModIconArchiveAction(`clean:${filename}`);
    setModIconMessage(`Очищаю ${filename}...`);
    try {
      const payload = await cleanModIconArchive(filename);
      setModIconStatus(payload.status);
      setModIconManifest(payload.status.manifest);
      setModIconMessage(payload.cleanup.removed
        ? `Из ${filename} удалено лишних файлов: ${payload.cleanup.removed}. Пересоберите атласы.`
        : `${filename}: лишних файлов не найдено.`);
    } catch (error) {
      setModIconMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setModIconArchiveAction('');
    }
  }

  async function handleDeleteModIconArchive(filename: string) {
    if (!canManageModIcons || modIconArchiveAction) return;
    const confirmed = window.confirm(`Удалить архив ${filename}?`);
    if (!confirmed) return;
    setModIconArchiveAction(`delete:${filename}`);
    setModIconMessage(`Удаляю ${filename}...`);
    try {
      const payload = await deleteModIconArchive(filename);
      setModIconStatus(payload);
      setModIconManifest(payload.manifest);
      setModIconMessage(`Архив удалён: ${filename}. Пересоберите атласы.`);
    } catch (error) {
      setModIconMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setModIconArchiveAction('');
    }
  }

  async function handleItemPanelCsvFiles(files: FileList | File[]) {
    if (!canManageModIcons) return;
    const file = Array.from(files)[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setItemPanelCsvMessage('Можно загрузить только itempanel.csv.');
      return;
    }
    setItemPanelCsvUploading(true);
    setItemPanelCsvMessage(`Загружаю ${file.name}...`);
    try {
      const payload = await uploadItemPanelCsv(file);
      setItemPanelAtlas(payload.atlas);
      const summary = await refreshItemCatalogTranslations();
      setItemPanelCsvMessage(`CSV загружен. Строк: ${String(payload.scan.rows ?? 0)}, найдено иконок: ${String(payload.scan.matched ?? 0)}, каталог: ${String(summary.entries ?? 0)}.`);
    } catch (error) {
      setItemPanelCsvMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setItemPanelCsvUploading(false);
    }
  }

  async function handleItemPanelJsonFiles(files: FileList | File[]) {
    if (!canManageModIcons) return;
    const file = Array.from(files)[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      setItemPanelJsonMessage('Можно загрузить только itempanel.json.');
      return;
    }
    setItemPanelJsonUploading(true);
    setItemPanelJsonMessage(`Загружаю ${file.name}...`);
    try {
      const payload = await uploadItemPanelJson(file);
      const summary = await refreshItemCatalogTranslations();
      setItemPanelJsonMessage(`JSON загружен. SNBT строк: ${String(payload.summary.uploaded_snbt_rows ?? summary.snbt_rows ?? 0)}. Для применения нажмите "Объединить файлы".`);
    } catch (error) {
      setItemPanelJsonMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setItemPanelJsonUploading(false);
    }
  }

  async function handleOreDictFile(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setOreDictMessage('Только oredict.txt поддерживается.');
      return;
    }
    setOreDictUploading(true);
    setOreDictMessage(`Загружаю ${file.name}...`);
    try {
      const text = await file.text();
      const payload = await uploadOreDictFile(text);
      setOreDictMessage(`Успех: ${payload.groups} групп, ${payload.reverse_keys} предметов.`);
      void getOreDictGroups().then(resp => {
        if (resp.available) setOreDictGroups(resp.groups);
      });
    } catch (error) {
      setOreDictMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setOreDictUploading(false);
    }
  }

  async function handleMergeItemPanelFiles() {
    if (!canManageModIcons) return;
    setItemPanelMerging(true);
    setItemPanelJsonMessage('Объединяю itempanel.csv и itempanel.json...');
    try {
      const payload = await mergeItemPanelFiles();
      const catalogSummary = await refreshItemCatalogTranslations();
      const summary = payload.summary;
      const catalog = (summary.catalog && typeof summary.catalog === 'object') ? summary.catalog as Record<string, unknown> : catalogSummary;
      setItemPanelJsonMessage(`Файлы объединены. Строк: ${String(summary.merged_rows ?? 0)}, с NBT: ${String(summary.merged_nbt_rows ?? 0)}, каталог: ${String(catalog.entries ?? catalogSummary.entries ?? 0)}.`);
    } catch (error) {
      setItemPanelJsonMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setItemPanelMerging(false);
    }
  }

  async function handleGenerateModIconAtlases() {
    if (!canManageModIcons) return;
    setModIconGenerating(true);
    setModIconMessage('Генерирую атласы...');
    try {
      const manifest = await generateModIconAtlases();
      setModIconManifest(manifest);
      setModIconStatus((current) => ({
        archives: manifest.archives,
        manifest,
        rules: current?.rules ?? { acceptedArchive: '.zip', acceptedFiles: ['modid_x32.png', 'modid_x256.png'], maxAtlasSize: 4096 }
      }));
      setModIconMessage(`Готово: модов ${manifest.totalMods}, атласов ${manifest.atlases.length}.`);
    } catch (error) {
      setModIconMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setModIconGenerating(false);
    }
  }

  async function refreshItemCaseAliasReport(options?: { silent?: boolean }) {
    if (!canUseItemCaseAliases) return;
    if (!options?.silent) {
      setItemCaseAliasStatus('Загружаю отчет словаря...');
    }
    try {
      const report = await getItemCaseAliasReport();
      setItemCaseAliasReport(report);
      if (!options?.silent) {
        setItemCaseAliasStatus(report ? `Отчет: ${report.summary.uniqueItemKeys} ключей, не найдено ${report.summary.missingItemKeys}.` : 'Отчет еще не создан.');
      }
    } catch (error) {
      if (!options?.silent) {
        setItemCaseAliasStatus(error instanceof Error ? error.message : String(error));
      }
    }
  }

  async function handleGenerateItemCaseAliasReport() {
    if (!canManageModIcons) return;
    setItemCaseAliasGenerating(true);
    setItemCaseAliasStatus('Строю словарь регистра из файлов Облака...');
    try {
      const report = await generateItemCaseAliasReport();
      setItemCaseAliasReport(report);
      setItemCaseAliasStatus(`Готово: совпало ${report.summary.matchedItemKeys}, не найдено ${report.summary.missingItemKeys}, mixed-case ${report.summary.mixedCaseItemAliases}.`);
    } catch (error) {
      setItemCaseAliasStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setItemCaseAliasGenerating(false);
    }
  }

  async function handleItemCaseAliasLogFiles(files: FileList | File[]) {
    if (!canManageModIcons) return;
    const file = Array.from(files)[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.log')) {
      setItemCaseAliasStatus('Можно загрузить только fml-client-latest.log или другой .log файл.');
      return;
    }
    setItemCaseAliasLogUploading(true);
    setItemCaseAliasStatus(`Читаю FML log: ${file.name}...`);
    try {
      const report = await uploadItemCaseAliasFmlLog(file);
      setItemCaseAliasReport(report);
      const logSummary = report.fmlLogSummary;
      setItemCaseAliasStatus(logSummary
        ? `FML log разобран: строк ${logSummary.totalMatches}, block ${logSummary.blockMatches}, item ${logSummary.itemMatches}, alias ${logSummary.aliases}.`
        : 'FML log загружен, словарь обновлен.');
    } catch (error) {
      setItemCaseAliasStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setItemCaseAliasLogUploading(false);
    }
  }

  async function handleSaveManualItemCaseAlias() {
    if (!canManageModIcons) return;
    const lowerKey = manualAliasKey.trim();
    const original = manualAliasValue.trim();
    if (!lowerKey || !original) {
      setItemCaseAliasStatus('Заполни ключ и значение ручного алиаса.');
      return;
    }
    setManualAliasSaving(true);
    setItemCaseAliasStatus('Сохраняю ручной алиас...');
    try {
      const report = await saveManualItemCaseAlias(lowerKey, original);
      setItemCaseAliasReport(report);
      setManualAliasKey('');
      setManualAliasValue('');
      setItemCaseAliasStatus(`Ручной алиас сохранен. Всего в словаре: ${Object.keys(report.itemAliases).length}.`);
    } catch (error) {
      setItemCaseAliasStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setManualAliasSaving(false);
    }
  }

  async function refreshCloudFiles() {
    if (!canManageCloudFiles) return;
    setCloudStatus('Загружаю список .zs...');
    try {
      const payload = await listZsCloudFiles();
      setCloudFiles(payload.files);
      setCloudStatus(`Файлов: ${payload.files.length}`);
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function switchCloudStorageToPersistentPath() {
    if (!canManageSettings || !settings) return;
    setCloudStorageUpdating(true);
    setCloudStatus(`Переключаю scripts_dir на ${PERSISTENT_SCRIPTS_DIR}...`);
    try {
      const updated = await updateProjectSettings({ ...settings, scripts_dir: PERSISTENT_SCRIPTS_DIR });
      setSettings(updated);
      setCloudStatus(`scripts_dir сохранен: ${updated.scripts_dir}`);
      await refreshCloudFiles();
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setCloudStorageUpdating(false);
    }
  }

  function downloadBlobFile(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadCloudFile(path: string) {
    setCloudContextMenu(null);
    try {
      const payload = await downloadZsCloudFile(path);
      const expectedFilename = path.split(/[\\/]/).pop()?.trim() || 'recipe.zs';
      const finalFilename = (payload.filename && payload.filename !== 'download.zs' ? payload.filename.trim() : expectedFilename) || 'recipe.zs';
      downloadBlobFile(finalFilename, payload.blob);
      setCloudStatus(`Файл скачан: ${finalFilename}`);
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function renameCloudFile(path: string) {
    setCloudContextMenu(null);
    const currentName = path.split(/[\\/]/).pop() ?? 'recipe.zs';
    const newName = window.prompt('Новое имя .zs файла', currentName);
    if (!newName) return;
    setCloudStatus('Переименовываю файл...');
    try {
      const payload = await renameZsCloudFile(path, newName);
      setCloudFiles(payload.files);
      setCloudStatus(`Файл переименован: ${newName.endsWith('.zs') ? newName : `${newName}.zs`}`);
      setCloudContextMenu(null);
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteCloudFile(path: string) {
    setCloudContextMenu(null);
    const name = path.split(/[\\/]/).pop() ?? path;
    if (!window.confirm(`Удалить ${name}? Секретный backup, если он есть, останется только у ROOT.`)) return;
    setCloudStatus('Удаляю файл...');
    try {
      const payload = await deleteZsCloudFile(path);
      setCloudFiles(payload.files);
      setCloudStatus(`Файл удалён: ${name}`);
      setCloudContextMenu(null);
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshRootBackups() {
    if (!authUser.is_root_admin) return;
    setCloudBackupStatus('Открываю секретный backup...');
    try {
      const payload = await listZsCloudBackups();
      setCloudBackups(payload.backups);
      setCloudBackupStatus(`Backup файлов: ${payload.backups.length}`);
    } catch (error) {
      setCloudBackupStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function downloadRootBackup(backup: ZsCloudBackup) {
    try {
      const payload = await downloadZsCloudBackup(backup.id);
      downloadBlobFile(payload.filename, payload.blob);
      setCloudBackupStatus(`Backup скачан: ${payload.filename}`);
    } catch (error) {
      setCloudBackupStatus(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    document.documentElement.dataset.theme = uiPreferences.theme_mode;
  }, [uiPreferences.theme_mode]);

  useEffect(() => {
    if (!isHotkeyDebugActive && hotkeyDebugEvents.length) {
      setHotkeyDebugEvents([]);
    }
  }, [isHotkeyDebugActive, hotkeyDebugEvents.length]);

  useEffect(() => {
    if (canManageRoles) {
      void refreshAdminUsers();
      void refreshAccessControl();
    } else {
      setAdminUsers([]);
      setAdminUsersStatus('');
      setAccessControl({ whitelist_enabled: false, whitelist_emails: [] });
      setAccessWhitelistDraft('');
      setAccessStatus('');
    }
  }, [canManageRoles]);

  useEffect(() => {
    if (workspaceTab === 'technical' && canManageModIcons) {
      void refreshModIconStatus();
      void refreshItemCaseAliasReport();
    }
  }, [workspaceTab, canManageModIcons]);

  useEffect(() => {
    if (canUseItemCaseAliases) {
      void refreshItemCaseAliasReport({ silent: true });
    }
  }, [canUseItemCaseAliases]);

  useEffect(() => {
    if (workspaceTab === 'technical' && !canUseTechnicalPanel) {
      setWorkspaceTab('editor');
    }
  }, [workspaceTab, canUseTechnicalPanel]);

  useEffect(() => {
    if (workspaceTab === 'cloud' && canManageCloudFiles) {
      void refreshCloudFiles();
    } else {
      setCloudContextMenu(null);
      setIsRootBackupOpen(false);
    }
  }, [workspaceTab, canManageCloudFiles]);

  useEffect(() => {
    function handleRootBackupHotkey(event: KeyboardEvent) {
      if (!authUser.is_root_admin || workspaceTab !== 'cloud' || !event.ctrlKey || event.code !== 'KeyB') {
        return;
      }
      event.preventDefault();
      setIsRootBackupOpen((current) => {
        const next = !current;
        if (next) {
          void refreshRootBackups();
        }
        return next;
      });
    }
    window.addEventListener('keydown', handleRootBackupHotkey);
    return () => window.removeEventListener('keydown', handleRootBackupHotkey);
  }, [authUser.is_root_admin, workspaceTab]);

  useEffect(() => {
    if (!canCreateTemplates && !canEditRecipes) {
      setRecipeDraftTemplates([]);
      return undefined;
    }
    let cancelled = false;
    async function loadSharedRecipeDraftTemplates() {
      try {
        const payload = await listRecipeDraftTemplates();
        if (!cancelled) {
          setRecipeDraftTemplates(normalizeRecipeDraftTemplates(payload.templates));
        }
      } catch (error) {
        logFrontendEvent({
          level: 'WARN',
          category: 'RECIPE_DRAFTS',
          message: 'Shared recipe draft templates unavailable; using local fallback',
          details: { error: error instanceof Error ? error.message : String(error) }
        });
        if (!cancelled) {
          setRecipeDraftTemplates(loadRecipeDraftTemplates(authUser.email));
        }
      }
    }
    void loadSharedRecipeDraftTemplates();
    return () => {
      cancelled = true;
    };
  }, [authUser.email, canCreateTemplates, canEditRecipes]);

  useEffect(() => {
    persistRecipeDraftTemplates(authUser.email, recipeDraftTemplates);
  }, [authUser.email, recipeDraftTemplates]);

  useEffect(() => {
    let cancelled = false;
    async function loadCustomItems() {
      try {
        const payload = await listCustomItems();
        if (!cancelled) {
          const backendItems = payload.items.map((item) => ({ ...item, storage: 'backend' as const }));
          setCustomItems((current) => {
            const localItems = current.filter((item) => item.storage === 'local');
            return [...localItems, ...backendItems];
          });
          setCustomItemsStatus(`Предметов: ${loadLocalCustomItems(authUser.email).length + backendItems.length}`);
        }
      } catch (error) {
        if (!cancelled) {
          setCustomItemsStatus(error instanceof Error ? error.message : String(error));
        }
      }
    }
    void loadCustomItems();
    return () => {
      cancelled = true;
    };
  }, [authUser.email]);

  useEffect(() => {
    if (canManageTasks) {
      void refreshTaskRawLookup();
    }
  }, [canManageTasks]);

  useEffect(() => {
    if (canManageTasks && neiContextMenu?.raw) {
      void refreshTaskRawLookup();
    }
  }, [canManageTasks, neiContextMenu?.raw]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWildcardCycleTick((current) => current + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!workspaceTabs.some((tab) => tab.id === workspaceTab)) {
      setWorkspaceTab('editor');
    }
  }, [workspaceTab, canCreateTemplates, canEditRecipes, canManageModIcons, canManageCloudFiles, canManageTasks, canUseDebug]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      cursorPointRef.current = { x: event.clientX, y: event.clientY };
      if (!heldCursorRef.current || cursorFrameRef.current !== null) {
        return;
      }
      cursorFrameRef.current = window.requestAnimationFrame(() => {
        cursorFrameRef.current = null;
        moveHeldCursor();
      });
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (cursorFrameRef.current !== null) {
        window.cancelAnimationFrame(cursorFrameRef.current);
        cursorFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const list = neiListRef.current;
    if (!list) return;

    const findItemElement = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      return target.closest<HTMLElement>('[data-item-raw]');
    };
    const findItemRaw = (target: EventTarget | null) => {
      return findItemElement(target)?.dataset.itemRaw ?? null;
    };
    const setFromTarget = (target: EventTarget | null) => {
      updateHoveredItemRawFast(findItemRaw(target));
    };
    const clearFromTarget = (target: EventTarget | null, relatedTarget: EventTarget | null) => {
      const item = findItemElement(target);
      const raw = item?.dataset.itemRaw ?? null;
      if (!raw) return;
      if (relatedTarget instanceof Element && item?.contains(relatedTarget)) {
        return;
      }
      updateHoveredItemRawFast((current) => (current === raw ? null : current));
    };
    const handlePointerOver = (event: PointerEvent) => setFromTarget(event.target);
    const handlePointerOut = (event: PointerEvent) => clearFromTarget(event.target, event.relatedTarget);
    const handleMouseOver = (event: MouseEvent) => setFromTarget(event.target);
    const handleMouseOut = (event: MouseEvent) => clearFromTarget(event.target, event.relatedTarget);
    const handleFocusIn = (event: FocusEvent) => setFromTarget(event.target);
    const handleFocusOut = (event: FocusEvent) => clearFromTarget(event.target, event.relatedTarget);

    list.addEventListener('pointerover', handlePointerOver, { passive: true });
    list.addEventListener('pointerout', handlePointerOut, { passive: true });
    list.addEventListener('mouseover', handleMouseOver, { passive: true });
    list.addEventListener('mouseout', handleMouseOut, { passive: true });
    list.addEventListener('focusin', handleFocusIn);
    list.addEventListener('focusout', handleFocusOut);
    return () => {
      list.removeEventListener('pointerover', handlePointerOver);
      list.removeEventListener('pointerout', handlePointerOut);
      list.removeEventListener('mouseover', handleMouseOver);
      list.removeEventListener('mouseout', handleMouseOut);
      list.removeEventListener('focusin', handleFocusIn);
      list.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  useEffect(() => {
    const element = neiListRef.current;
    if (!element) return undefined;

    const updateColumnCount = () => {
      const columns = window.getComputedStyle(element).gridTemplateColumns
        .split(' ')
        .filter((part) => part && part !== 'none').length;
      setNeiColumnCount((current) => {
        const next = Math.max(1, columns || NEI_FALLBACK_COLUMNS);
        return current === next ? current : next;
      });
    };

    updateColumnCount();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateColumnCount);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', updateColumnCount);
    return () => window.removeEventListener('resize', updateColumnCount);
  }, []);

  useEffect(() => {
    if (heldItemRaw) {
      moveHeldCursor();
    }
  }, [heldItemRaw]);

  useEffect(() => {
    const closeDetailsOnOutsidePointer = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      document.querySelectorAll<HTMLDetailsElement>('details[data-close-on-select][open]').forEach((details) => {
        if (!target || !details.contains(target)) {
          details.open = false;
        }
      });
    };
    const closeDetailsAfterAction = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const action = target?.closest('button, a, [role="menuitem"]');
      if (!action || action.closest('[data-keep-menu-open]')) {
        return;
      }
      const details = action.closest<HTMLDetailsElement>('details[data-close-on-select]');
      if (!details) {
        return;
      }
      window.setTimeout(() => {
        details.open = false;
      }, 0);
    };

    document.addEventListener('pointerdown', closeDetailsOnOutsidePointer);
    document.addEventListener('click', closeDetailsAfterAction);
    return () => {
      document.removeEventListener('pointerdown', closeDetailsOnOutsidePointer);
      document.removeEventListener('click', closeDetailsAfterAction);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHeldItemRaw(null);
        setTouchItemInspection(null);
        setNeiContextMenu(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = canUseNeiFavorites && favoriteHotkeyMatches(event, neiFavoritesRef.current.favoriteHotkey)
        ? 'favorite'
        : recipeHotkeyAction(event);
      if (!action) {
        return;
      }
      if (event.repeat) {
        logHotkeyDebug('keydown ignored: repeat', { key: event.key, code: event.code }, 'warning');
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      const inspection = inspectActiveItemRaw();
      const raw = action === 'favorite' && inspection.source === 'held' ? null : inspection.raw;
      logHotkeyDebug('keydown captured', {
        action,
        key: event.key,
        code: event.code,
        raw,
        source: inspection.source,
        activeElement: describeElement(target),
        pointElement: inspection.pointElement,
        itemElement: inspection.itemElement,
        hoveredRef: inspection.hoveredRef,
        hoveredState: inspection.hoveredState,
        domRaw: inspection.domRaw,
        heldRaw: inspection.heldRaw,
        cursor: inspection.cursor
      });
      if (!raw) {
        logHotkeyDebug('keydown stopped: no active item raw', {
          action,
          key: event.key,
          code: event.code,
          activeElement: describeElement(target),
          pointElement: inspection.pointElement,
          cursor: inspection.cursor
        }, 'warning');
        return;
      }
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
        const pointTarget = typeof document.elementFromPoint === 'function'
          ? document.elementFromPoint(cursorPointRef.current.x, cursorPointRef.current.y)
          : null;
        if (!pointTarget?.closest('[data-item-raw]') && !hoveredItemRawRef.current) {
          logHotkeyDebug('keydown stopped: focus is editable and cursor is not over item', {
            action,
            key: event.key,
            code: event.code,
            raw,
            activeElement: describeElement(target),
            pointElement: describeElement(pointTarget)
          }, 'warning');
          return;
        }
        logHotkeyDebug('editable focus allowed because item is hovered', {
          action,
          raw,
          pointElement: describeElement(pointTarget),
          hoveredRef: hoveredItemRawRef.current
        });
      }
      event.preventDefault();
      logHotkeyDebug('hotkey accepted', { action, raw, source: inspection.source }, 'success');
      if (action === 'favorite') {
        toggleNeiFavorite(raw);
      } else if (action === 'recipe') {
        void openRecipeForItem(raw);
      } else {
        void openRecipeUsesForItem(raw);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hoveredItemRaw, heldItemRaw, recipeAvailability, recipeDraftTemplates, uploadedDrafts, canUseNeiFavorites]);

  const summary = useMemo(() => `${matrix.length}x${matrix[0]?.length ?? 0}`, [matrix]);
  const recipeCraftMode = craftModeFromRecipeType(recipe.recipe_type);
  const recipeBindingMode: RecipeBindingMode = strictBinding ? 'strict' : 'soft';
  const structuredCraftRaw = useMemo(
    () => applyItemCaseAliasesToRaw(buildStructuredItemRaw(itemModDraft, itemNameDraft, itemMetaDraft, nbtRootDraft), itemCaseAliases),
    [itemModDraft, itemNameDraft, itemMetaDraft, nbtRootDraft, itemCaseAliases]
  );
  const outputDisplayNameFromResolver = recipe.output_resolution?.display_name;
  const filledCells = useMemo(() => matrix.flat().filter((cell) => cell && cell !== 'null').length, [matrix]);
  const nullCells = useMemo(() => matrix.flat().filter((cell) => !cell || cell === 'null').length, [matrix]);
  const unresolvedCells = useMemo(() => matrix.flat().filter((cell) => cell && !String(cell).startsWith('<')).length, [matrix]);
  const iconsResolved = recipe.output_resolution?.icon_url ? 1 : 0;
  const iconTotal = filledCells + (outputRaw ? 1 : 0);
  const inputStatusTone = !backendAvailable || lastApiStatus === t('values.error') || status.includes('Ошибка') || status.includes('Backend unavailable') ? 'warning' : status === t('status.loaded') ? 'success' : 'default';

  useEffect(() => {
    if (isHotkeyDebugActive) {
      logAppDebug('ui', 'debug enabled', {
        categories: Object.entries(debugFilters).filter(([, enabled]) => enabled).map(([category]) => category).join(','),
        levels: Object.entries(debugLevelFilters).filter(([, enabled]) => enabled).map(([level]) => level).join(',')
      }, 'success');
    }
  }, [isHotkeyDebugActive]);

  useEffect(() => {
    logAppDebug('ui', 'workspace changed', { tab: workspaceTab }, 'info');
  }, [workspaceTab]);

  useEffect(() => {
    logAppDebug('ui', 'held item changed', { raw: heldItemRaw ?? 'none' }, heldItemRaw ? 'info' : 'success');
  }, [heldItemRaw]);

  useEffect(() => {
    logAppDebug('recipe', 'recipe state changed', {
      output: outputRaw,
      type: recipe.recipe_type,
      size: summary,
      filled: filledCells,
      empty: nullCells
    }, unresolvedCells ? 'warning' : 'info');
  }, [filledCells, nullCells, outputRaw, recipe.recipe_type, summary, unresolvedCells]);

  useEffect(() => {
    logAppDebug('api', 'api status changed', { status: lastApiStatus, parse: lastParseResult, backend: backendAvailable }, backendAvailable ? 'info' : 'warning');
  }, [backendAvailable, lastApiStatus, lastParseResult]);

  useEffect(() => {
    logAppDebug('storage', 'texture loader changed', { state: textureLoadState, status: textureLoadStatus || 'idle' }, textureLoadState === 'running' ? 'info' : 'success');
  }, [textureLoadState, textureLoadStatus]);

  useEffect(() => {
    if (cloudStatus) {
      logAppDebug('storage', 'cloud status changed', { status: cloudStatus }, cloudStatus.includes('Ошибка') || cloudStatus.toLowerCase().includes('error') ? 'error' : 'info');
    }
  }, [cloudStatus]);

  const matrixWithResolution = useMemo(() => {
    const resolutionByRaw = new Map<string, RecipeView['matrix'][number][number]['resolution']>();
    recipe.matrix.forEach((row) => row.forEach((cell) => {
      const raw = cell.raw;
      if (!raw || resolutionByRaw.has(raw)) return;
      if (cell.resolution?.icon_url) {
        resolutionByRaw.set(raw, cell.resolution);
      }
    }));

    return matrix.map((row, rowIndex) => row.map((cell, colIndex) => {
      const parsedCell = recipe.matrix[rowIndex]?.[colIndex];
      const directResolution = parsedCell?.raw === cell ? (parsedCell?.resolution ?? null) : null;
      const cachedIconUrl = typeof cell === 'string' ? getCachedItemIconUrl(cell) : null;
      const fallbackResolution = typeof cell === 'string' ? (resolutionByRaw.get(cell) ?? (cachedIconUrl ? { item_raw: cell, icon_url: cachedIconUrl, display_name: resolveCellTitle(cell), strategy: 'itempanel_cache' } : null)) : null;
      return {
        raw: cell,
        resolution: directResolution ?? fallbackResolution
      };
    }));
  }, [matrix, recipe.matrix, itemSearchIcons, itemPanelTranslations, customItems]);

  useEffect(() => {
    if (!isCraftEditorOpen || craftSourceMode !== 'structured') {
      return;
    }
    setCraftSourceDraft(structuredCraftRaw);
  }, [isCraftEditorOpen, craftSourceMode, structuredCraftRaw]);

  function patchModalScale(key: ModalScaleKey, nextScale: number) {
    setModalScales((current) => ({ ...current, [key]: clamp(nextScale, 0.8, 1.5) }));
  }

  function getModalScaleStyle(key: ModalScaleKey): CSSProperties {
    return { '--modal-scale': modalScales[key] } as CSSProperties;
  }

  function getAppShellStyle(): CSSProperties {
    return {
      '--ui-scale': uiPreferences.ui_scale,
      ...iconSurfaceStyle
    } as CSSProperties;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadProjectSettings() {
      try {
        const nextSettings = await getProjectSettings();
        if (cancelled) {
          return;
        }
        setSettings(nextSettings);
        setBackendAvailable(true);
        const normalized = normalizeUiPreferences(nextSettings);
        if (!hasLocalUiChangesRef.current) {
          latestUiPreferencesRef.current = normalized;
          setUiPreferences(normalized);
        }
        setStatus((current) => current === 'Не удалось загрузить UI-настройки, используются значения по умолчанию.' ? 'Подключение к backend восстановлено, UI-настройки загружены.' : current);
        if (settingsRetryTimerRef.current !== null) {
          window.clearTimeout(settingsRetryTimerRef.current);
          settingsRetryTimerRef.current = null;
        }
      } catch {
        if (cancelled) {
          return;
        }
        setBackendAvailable(false);
        setStatus('Не удалось загрузить UI-настройки, используются значения по умолчанию.');
        if (settingsRetryTimerRef.current === null) {
          settingsRetryTimerRef.current = window.setTimeout(() => {
            settingsRetryTimerRef.current = null;
            void loadProjectSettings();
          }, 2000);
        }
      }
    }

    void loadProjectSettings();

    return () => {
      cancelled = true;
      if (settingsRetryTimerRef.current !== null) {
        window.clearTimeout(settingsRetryTimerRef.current);
        settingsRetryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!canUseNeiFavorites) {
      neiFavoritesRef.current = defaultNeiFavoritesProfile;
      setNeiFavorites(defaultNeiFavoritesProfile);
      setNeiHiddenPatternsDraft('');
      setNeiFavoritesStatus('');
      return () => {
        cancelled = true;
      };
    }

    async function loadFavorites() {
      setNeiFavoritesStatus('Загружаю избранное...');
      try {
        const profile = normalizeNeiFavoritesProfile(await getNeiFavorites());
        if (cancelled) return;
        neiFavoritesRef.current = profile;
        setNeiFavorites(profile);
        setNeiHiddenPatternsDraft(profile.hiddenPatterns.join('\n'));
        setNeiFavoritesStatus('Избранное загружено');
      } catch (error) {
        if (cancelled) return;
        setNeiFavoritesStatus(error instanceof Error ? error.message : String(error));
      }
    }

    void loadFavorites();
    return () => {
      cancelled = true;
    };
  }, [authUser.email, canUseNeiFavorites]);

  useEffect(() => () => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    if (localDraftPersistTimerRef.current !== null) {
      window.clearTimeout(localDraftPersistTimerRef.current);
    }
    if (autoParseTimerRef.current !== null) {
      window.clearTimeout(autoParseTimerRef.current);
    }
    if (settingsRetryTimerRef.current !== null) {
      window.clearTimeout(settingsRetryTimerRef.current);
    }
    if (neiFavoritesSaveTimerRef.current !== null) {
      window.clearTimeout(neiFavoritesSaveTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const draftState: LocalDraftState = {
      input,
      matrix,
      recipe,
      outputRaw,
      strictBinding,
      metaMode,
      workspaceTab,
      itemSearchQuery,
      neiSearchQuery,
      neiPage,
      selectedTextureMods,
      craftEditorTarget,
      craftSourceDraft,
      itemModDraft,
      itemNameDraft,
      itemMetaDraft,
      nbtRootDraft,
      collapsedNbtPaths,
      uploadedDrafts: normalizeUploadedDrafts(uploadedDrafts),
      selectedDraftId,
      recipeBackHistory: recipeBackHistory.slice(-LOCAL_DRAFT_MAX_HISTORY),
      recipeForwardHistory: recipeForwardHistory.slice(0, LOCAL_DRAFT_MAX_HISTORY),
      modalScales
    };
    const craftHash = hashLocalDraftState(draftState);
    if (craftHash === lastLocalDraftHashRef.current && localDraftStorageKeyCurrent === lastLocalDraftStorageKeyRef.current) {
      return undefined;
    }

    if (localDraftPersistTimerRef.current !== null) {
      window.clearTimeout(localDraftPersistTimerRef.current);
    }
    localDraftPersistTimerRef.current = window.setTimeout(() => {
      const userHash = localDraftUserHash(authUser.email);
      const payload: LocalDraftPayload = {
        schemaVersion: LOCAL_DRAFT_SCHEMA_VERSION,
        userHash,
        craftHash,
        savedAt: Date.now(),
        state: draftState
      };
      try {
        window.localStorage.setItem(localDraftStorageKeyCurrent, JSON.stringify(payload));
        lastLocalDraftHashRef.current = craftHash;
        lastLocalDraftStorageKeyRef.current = localDraftStorageKeyCurrent;
      } catch (error) {
        logFrontendEvent({
          level: 'WARN',
          category: 'LOCAL_DRAFT',
          message: 'Local draft autosave failed',
          details: { error: error instanceof Error ? error.message : String(error) }
        });
      }
    }, LOCAL_DRAFT_SAVE_DELAY_MS);

    return () => {
      if (localDraftPersistTimerRef.current !== null) {
        window.clearTimeout(localDraftPersistTimerRef.current);
      }
    };
  }, [
    authUser.email,
    localDraftStorageKeyCurrent,
    input,
    matrix,
    recipe,
    outputRaw,
    strictBinding,
    metaMode,
    workspaceTab,
    itemSearchQuery,
    neiSearchQuery,
    neiPage,
    selectedTextureMods,
    craftEditorTarget,
    craftSourceDraft,
    itemModDraft,
    itemNameDraft,
    itemMetaDraft,
    nbtRootDraft,
    collapsedNbtPaths,
    uploadedDrafts,
    selectedDraftId,
    recipeBackHistory,
    recipeForwardHistory,
    modalScales
  ]);

  useEffect(() => {
    lastLocalDraftHashRef.current = '';
  }, [localDraftStorageKeyCurrent]);

  useEffect(() => {
    persistCustomRemoveTemplates(customRemoveTemplates);
  }, [customRemoveTemplates]);

  useEffect(() => {
    persistRemoveTemplateSelection(removeTemplateSelection);
  }, [removeTemplateSelection]);

  useEffect(() => {
    try {
      window.localStorage.setItem(OREDICT_OVERRIDES_STORAGE_KEY, JSON.stringify(oreDictOverrides));
    } catch {
      // Ignored
    }
  }, [oreDictOverrides]);

  useEffect(() => {
    try {
      window.localStorage.setItem(OREDICT_ICON_PRIORITY_STORAGE_KEY, JSON.stringify(oreDictIconPriority));
    } catch {
      // Ignored
    }
  }, [oreDictIconPriority]);

  useEffect(() => {
    let cancelled = false;
    async function loadItemPanelTranslations() {
      const fallbackToFirstMeta = getItemPanelFallbackToFirstMetaEnabled();
      try {
        const cached = window.localStorage.getItem(itemPanelCacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as { entries?: ItemPanelEntry[]; summary?: Record<string, unknown> | null };
          if (!cancelled && Array.isArray(parsed.entries) && parsed.entries.length) {
            setItemPanelTranslations(buildItemPanelTranslationsFromEntries(parsed.entries, fallbackToFirstMeta));
            setItemCatalogSummary(parsed.summary ?? null);
          }
        }
      } catch {
        // ignore corrupted cache
      }
      try {
        const payload = await getItemCatalog();
        if (!cancelled && payload.entries.length) {
          applyItemPanelEntries(payload.entries.map(itemCatalogEntryToPanelEntry), payload.summary);
          return;
        }
      } catch {
        // Fall back to static itempanel.csv below.
      }
      try {
        const response = await fetch('/itempanel.csv');
        if (!response.ok) {
          return;
        }
        const bytes = await response.arrayBuffer();
        let text = '';
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
          text = new TextDecoder('windows-1251').decode(bytes);
        }
        const lines = text.split(/\r?\n/).slice(1);
        const entries: ItemPanelEntry[] = [];
        lines.forEach((line) => {
          if (!line.trim()) return;
          const parts = line.split(',');
          if (parts.length < 5) return;
          const key = parts[0]?.trim().toLowerCase();
          const legacyIdRaw = parts[1]?.trim();
          const metaRaw = parts[2]?.trim();
          const hasNbtRaw = parts[3]?.trim().toLowerCase();
          const displayRu = (parts[4] ?? '').replace(/\r/g, '').replace(/\\n/g, '').trim();
          const displayEn = (parts[5] ?? '').replace(/\r/g, '').replace(/\\n/g, '').trim();
          const primaryDisplay = displayRu || displayEn;
          if (!key || !primaryDisplay || primaryDisplay === '-' || primaryDisplay === '- ') return;
          const meta = Number.parseInt(metaRaw || '0', 10);
          if (Number.isNaN(meta)) return;
          const legacyId = legacyIdRaw ? Number.parseInt(legacyIdRaw, 10) : null;
          const hasNbt = hasNbtRaw === 'true' || hasNbtRaw === '1' || hasNbtRaw === 'yes';
          const entry: ItemPanelEntry = {
            key,
            legacyId: Number.isNaN(legacyId ?? Number.NaN) ? null : legacyId,
            meta,
            hasNbt,
            displayRu: displayRu || primaryDisplay,
            displayEn
          };
          entries.push(entry);
        });
        if (!cancelled) {
          applyItemPanelEntries(entries);
        }
      } catch {
        // optional source
      }
    }
    void loadItemPanelTranslations();
    return () => {
      cancelled = true;
    };
  }, [activeServerId, itemPanelCacheKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const atlas = await getItemPanelAtlas();
        if (!cancelled && atlas.entries) {
          if (Object.keys(atlas.entries).length > 0) {
            await preloadImage(normalizeAtlasImageUrl(atlas.image_url));
          }
          if (!cancelled) {
            setItemPanelAtlas(atlas);
          }
        }
      } catch {
        if (!cancelled) {
          setItemPanelAtlas(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeServerId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const manifest = await getModIconAtlasManifest();
        if (!cancelled) {
          setModIconManifest(manifest);
        }
      } catch {
        if (!cancelled) {
          setModIconManifest(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeServerId]);

  function persistUiPreferences(next: UiPreferences) {
    hasLocalUiChangesRef.current = true;
    latestUiPreferencesRef.current = next;
    setUiPreferences(next);
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      if (!backendAvailable) {
        return;
      }
      void (async () => {
        try {
          const response = await updateProjectUiPreferences(latestUiPreferencesRef.current);
          setBackendAvailable(true);
          setSettings((current) => ({ ...(current ?? response), ...response }));
          setSaveStatus(createTranslator(latestUiPreferencesRef.current.language)('fields.layoutSaved'));
          logFrontendEvent({ level: 'INFO', category: 'LAYOUT', message: 'Workspace persisted', details: { columns: latestUiPreferencesRef.current.workspace_layout.columns, compact_header: latestUiPreferencesRef.current.workspace_layout.compact_header } });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          if (message.includes('Backend unavailable')) {
            setBackendAvailable(false);
            setStatus(message);
            return;
          }
          setStatus(`${createTranslator(latestUiPreferencesRef.current.language)('status.saveError')}: ${message}`);
        }
      })();
    }, 180);
  }

  function patchUiPreferences(patch: Partial<UiPreferences>) {
    persistUiPreferences({ ...latestUiPreferencesRef.current, ...patch });
  }

  function patchIconSurface(surfaceId: IconSurfaceId, next: IconSurfaceSettings) {
    patchUiPreferences({
      icon_surfaces: patchIconSurfaceSettings(latestUiPreferencesRef.current.icon_surfaces, surfaceId, next)
    });
  }

  function resetIconSurfaces() {
    patchUiPreferences({ icon_surfaces: defaultIconSurfaceSettings });
  }

  function patchPanelLayout(nextLayout: PanelLayoutItem[]) {
    persistUiPreferences({ ...latestUiPreferencesRef.current, panel_layout: normalizePanelLayout(nextLayout) });
  }

  function persistNeiFavoritesProfile(nextProfile: NeiFavoritesProfile) {
    const normalized = normalizeNeiFavoritesProfile(nextProfile);
    neiFavoritesRef.current = normalized;
    setNeiFavorites(normalized);
    if (!canUseNeiFavorites) {
      return;
    }
    if (neiFavoritesSaveTimerRef.current !== null) {
      window.clearTimeout(neiFavoritesSaveTimerRef.current);
    }
    neiFavoritesSaveTimerRef.current = window.setTimeout(() => {
      neiFavoritesSaveTimerRef.current = null;
      void saveNeiFavorites(neiFavoritesRef.current)
        .then((saved) => {
          const normalizedSaved = normalizeNeiFavoritesProfile(saved);
          neiFavoritesRef.current = normalizedSaved;
          setNeiFavorites(normalizedSaved);
          setNeiHiddenPatternsDraft(normalizedSaved.hiddenPatterns.join('\n'));
          setNeiFavoritesStatus('Избранное сохранено');
        })
        .catch((error) => {
          setNeiFavoritesStatus(error instanceof Error ? error.message : String(error));
        });
    }, NEI_FAVORITES_SAVE_DELAY_MS);
  }

  function updateNeiFavoritesProfile(updater: (current: NeiFavoritesProfile) => NeiFavoritesProfile) {
    persistNeiFavoritesProfile(updater(neiFavoritesRef.current));
  }

  function activeNeiFavoriteTab(profile = neiFavorites): NeiFavoritesProfile['tabs'][number] {
    return profile.tabs.find((tab) => tab.id === profile.activeTabId) ?? profile.tabs[0] ?? defaultNeiFavoritesProfile.tabs[0];
  }

  function setActiveFavoriteTab(tabId: string) {
    updateNeiFavoritesProfile((current) => ({ ...current, activeTabId: tabId }));
  }

  function renameActiveFavoriteTab(name: string) {
    updateNeiFavoritesProfile((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => tab.id === current.activeTabId ? { ...tab, name: name.slice(0, 64) } : tab)
    }));
  }

  function addFavoriteTab() {
    const name = newFavoriteTabName.trim().slice(0, 64) || `Вкладка ${neiFavoritesRef.current.tabs.length + 1}`;
    const tab = { id: nextFavoriteTabId(), name, items: [] };
    setNewFavoriteTabName('');
    updateNeiFavoritesProfile((current) => ({
      ...current,
      activeTabId: tab.id,
      tabs: [...current.tabs, tab].slice(0, 32)
    }));
  }

  function deleteActiveFavoriteTab() {
    updateNeiFavoritesProfile((current) => {
      if (current.tabs.length <= 1) {
        return current;
      }
      const tabs = current.tabs.filter((tab) => tab.id !== current.activeTabId);
      return {
        ...current,
        activeTabId: tabs[0]?.id ?? defaultNeiFavoritesProfile.activeTabId,
        tabs: tabs.length ? tabs : defaultNeiFavoritesProfile.tabs
      };
    });
  }

  function toggleNeiFavorite(raw: string) {
    const favoriteRaw = applyItemCaseAlias(raw);
    updateNeiFavoritesProfile((current) => {
      const activeTab = activeNeiFavoriteTab(current);
      const hasItem = activeTab.items.some((item) => item.raw === favoriteRaw);
      return {
        ...current,
        tabs: current.tabs.map((tab) => {
          if (tab.id !== activeTab.id) return tab;
          return {
            ...tab,
            items: hasItem
              ? tab.items.filter((item) => item.raw !== favoriteRaw)
              : [{ raw: favoriteRaw, addedAt: Date.now() }, ...tab.items].slice(0, 512)
          };
        })
      };
    });
    setStatus(`Избранное: ${resolveCellTitle(favoriteRaw) || favoriteRaw}`);
  }

  function updateFavoriteHotkey(value: string) {
    updateNeiFavoritesProfile((current) => ({ ...current, favoriteHotkey: value.slice(0, 32) }));
  }

  function updateNeiHiddenPatterns(value: string) {
    setNeiHiddenPatternsDraft(value);
    updateNeiFavoritesProfile((current) => ({ ...current, hiddenPatterns: normalizeNeiHiddenPatterns(value) }));
  }

  async function saveCurrentWindowLayout() {
    const nextPreferences: UiPreferences = {
      ...latestUiPreferencesRef.current,
      panel_layout: normalizePanelLayout(latestUiPreferencesRef.current.panel_layout),
      workspace_layout: normalizeWorkspaceLayout(latestUiPreferencesRef.current.workspace_layout)
    };

    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }

    try {
      latestUiPreferencesRef.current = nextPreferences;
      setUiPreferences(nextPreferences);
      const response = await updateProjectUiPreferences(nextPreferences);
      const normalized = normalizeUiPreferences(response);
      latestUiPreferencesRef.current = normalized;
      setUiPreferences(normalized);
      setSettings((current) => ({ ...(current ?? response), ...response }));
      setSaveStatus(t('layoutSettings.saved'));
      setStatus(t('layoutSettings.saved'));
      setIsLayoutSettingsOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`${t('status.saveError')}: ${message}`);
    }
  }

  function createRecipeHistoryEntry(): RecipeHistoryEntry {
    return { recipe, input };
  }

  function rememberRecipeBeforeNavigation(nextRecipe: RecipeView) {
    if (recipe.recipe_uid === nextRecipe.recipe_uid && recipe.source.path === nextRecipe.source.path) {
      return;
    }
    setRecipeBackHistory((current) => [...current, createRecipeHistoryEntry()].slice(-40));
    setRecipeForwardHistory([]);
  }

  function applyRecipe(nextRecipe: RecipeView, nextInput?: string, options?: { rememberCurrent?: boolean }) {
    if (options?.rememberCurrent) {
      rememberRecipeBeforeNavigation(nextRecipe);
    }
    if (nextRecipe.remove_template) {
      const known = removeTemplateOptions().find((option) => option.template === nextRecipe.remove_template);
      const key = removeTemplateKeyForRaw(nextRecipe.output.raw);
      if (known) {
        setRemoveTemplateSelection((current) => ({ ...current, [key]: known.id }));
      } else {
        const id = `custom-${stableHash(nextRecipe.remove_template)}`;
        setCustomRemoveTemplates((current) => current.some((item) => item.id === id)
          ? current
          : [{ id, label: nextRecipe.remove_template ?? id, template: nextRecipe.remove_template ?? '', builtin: false }, ...current].slice(0, 40));
        setRemoveTemplateSelection((current) => ({ ...current, [key]: id }));
      }
    }
    setRecipe(nextRecipe);
    setOutputRaw(nextRecipe.output.raw);
    setMatrix(toCellMatrix(nextRecipe));
    setStrictBinding(nextRecipe.binding_mode === 'strict');
    setSaveStatus(nextRecipe.source.kind === 'generated' ? t('values.draft') : t('values.synchronized'));
    if (nextInput !== undefined) {
      setInput(nextInput);
    }
  }

  function clearEditor() {
    applyRecipe(defaultRecipe, '');
    setRecipeBackHistory([]);
    setRecipeForwardHistory([]);
    setSimilarRecipes(null);
    setStatus(t('status.cleared'));
    setSaveStatus(t('values.reset'));
    setLastApiStatus(t('values.idle'));
    setLastParseResult(t('values.reset'));
  }

  function resolveCellTitle(raw: string): string {
    const custom = customItems.find((item) => item.item_raw === raw);
    if (custom) {
      return custom.display_name;
    }
    const parsed = parseItemRaw(raw);
    if (!parsed) {
      return raw;
    }
    const metaMap = itemPanelTranslations.byKeyMeta.get(parsed.key);
    if (parsed.meta !== null && metaMap?.has(parsed.meta)) {
      const exact = metaMap.get(parsed.meta);
      if (exact?.displayRu) {
        return exact.displayRu;
      }
    }
    if (parsed.meta !== null && itemPanelTranslations.fallbackToFirstMeta && metaMap && metaMap.size > 0) {
      const firstMeta = [...metaMap.keys()].sort((a, b) => a - b)[0];
      const firstEntry = metaMap.get(firstMeta);
      if (firstEntry?.displayRu) {
        return firstEntry.displayRu;
      }
    }
    if (parsed.meta !== null && !itemPanelTranslations.fallbackToFirstMeta) {
      return raw;
    }
    const display = itemPanelTranslations.byKey.get(parsed.key);
    if (!display) {
      return raw;
    }
    return parsed.wildcardMeta ? `${display}*` : display;
  }

  function getCachedItemIconUrl(raw: string): string | null | undefined {
    const direct = itemSearchIcons[raw];
    if (direct !== undefined) {
      return direct;
    }
    const parsed = parseItemRaw(raw);
    if (!parsed) {
      return undefined;
    }
    const metaSuffix = parsed.wildcardMeta ? ':*' : parsed.meta && parsed.meta > 0 ? `:${parsed.meta}` : '';
    return itemSearchIcons[`<${parsed.key}${metaSuffix}>`];
  }

  const outputDisplayName = useMemo(() => {
    const localized = resolveCellTitle(outputRaw);
    if (localized && localized !== outputRaw) {
      return localized;
    }
    if (outputDisplayNameFromResolver && !outputDisplayNameFromResolver.startsWith('<')) {
      return outputDisplayNameFromResolver;
    }
    return localized;
  }, [outputRaw, outputDisplayNameFromResolver, itemPanelTranslations]);
  const itemPanelModSummaries = useMemo<ItemPanelModSummary[]>(() => {
    const counters = new Map<string, { total: number; loaded: number }>();
    itemPanelTranslations.entries.forEach((entry) => {
      const [modid] = entry.key.split(':');
      if (!modid) return;
      const raw = buildItemRawValue(entry.key, entry.meta);
      const stats = counters.get(modid) ?? { total: 0, loaded: 0 };
      stats.total += 1;
      if (itemSearchIcons[raw]) {
        stats.loaded += 1;
      }
      counters.set(modid, stats);
    });
    return Array.from(counters.entries())
      .map(([modid, stats]) => {
        const percent = stats.total > 0 ? Math.round((stats.loaded / stats.total) * 100) : 0;
        return {
          modid,
          itemCount: stats.total,
          loadedCount: stats.loaded,
          completionText: `${percent}% (${stats.loaded}/${stats.total})`
        };
      })
      .sort((a, b) => b.itemCount - a.itemCount || a.modid.localeCompare(b.modid));
  }, [itemPanelTranslations.entries, itemSearchIcons]);

  useEffect(() => {
    setSelectedTextureMods((current) => {
      const next: Record<string, boolean> = {};
      itemPanelModSummaries.forEach((summary) => {
        next[summary.modid] = current[summary.modid] ?? true;
      });
      return next;
    });
  }, [itemPanelModSummaries]);

  const customItemEntries = useMemo(() => customItems.map(customItemToEntry), [customItems]);
  const neiCatalogEntries = useMemo(() => [...itemPanelTranslations.entries, ...customItemEntries], [customItemEntries, itemPanelTranslations.entries]);
  const itemPanelEntryByRaw = useMemo(() => {
    const byRaw = new Map<string, ItemPanelEntry>();
    neiCatalogEntries.forEach((entry) => {
      byRaw.set(itemPanelRaw(entry), entry);
    });
    return byRaw;
  }, [neiCatalogEntries]);
  const taskItemOptions = useMemo<RecipeTaskItemOption[]>(() => {
    const unique = new Map<string, RecipeTaskItemOption>();
    neiCatalogEntries.forEach((entry) => {
      const raw = itemPanelRaw(entry);
      if (!raw || unique.has(raw)) return;
      const title = entry.displayRu || entry.displayEn || entry.key || raw;
      unique.set(raw, {
        raw,
        title,
        searchText: `${raw} ${entry.key} ${entry.displayRu} ${entry.displayEn} ${entry.legacyId ?? ''}`.toLowerCase()
      });
    });
    return [...unique.values()];
  }, [neiCatalogEntries]);
  const modIconByRaw = useMemo(() => buildModIconMatches(modIconManifest, itemPanelTranslations.entries), [modIconManifest, itemPanelTranslations.entries]);

  const itemSearchSuggestions = useMemo(() => {
    const query = itemSearchQuery.trim().toLowerCase();
    if (!query) {
      return [] as ItemPanelEntry[];
    }

    const unique = new Map<string, ItemPanelEntry>();
    const push = (entry: ItemPanelEntry) => {
      const uniqueKey = itemPanelEntryIdentity(entry);
      if (!unique.has(uniqueKey)) unique.set(uniqueKey, entry);
    };

    if (/^\d+(:\d+)?$/.test(query)) {
      const [idPart, metaPart] = query.split(':');
      const legacyId = Number.parseInt(idPart, 10);
      const meta = metaPart !== undefined ? Number.parseInt(metaPart, 10) : null;
      neiCatalogEntries.forEach((entry) => {
        if (entry.legacyId !== legacyId) return;
        if (meta !== null && entry.meta !== meta) return;
        push(entry);
      });
      return [...unique.values()].slice(0, 20);
    }

    const keyMetaMatch = query.match(/^([a-z0-9_.-]+:[a-z0-9_./-]+)(?::([0-9*]+))?$/);
    if (keyMetaMatch) {
      const parsedKey = keyMetaMatch[1];
      const parsedMeta = keyMetaMatch[2] ? Number.parseInt(keyMetaMatch[2], 10) : null;
      if (parsedMeta !== null && !Number.isNaN(parsedMeta)) {
        const exact = itemPanelTranslations.byKeyMeta.get(parsedKey)?.get(parsedMeta);
        if (exact) push(exact);
      } else {
        const metaMap = itemPanelTranslations.byKeyMeta.get(parsedKey);
        metaMap?.forEach((entry) => push(entry));
      }
      return [...unique.values()].slice(0, 20);
    }

    neiCatalogEntries.forEach((entry) => {
      if (
        entry.key.includes(query)
        || entry.displayRu.toLowerCase().includes(query)
        || entry.displayEn.toLowerCase().includes(query)
        || entry.key.startsWith(`${query}:`)
      ) {
        push(entry);
      }
    });

    return [...unique.values()].slice(0, 20);
  }, [itemSearchQuery, itemPanelTranslations, neiCatalogEntries]);

  const hiddenNeiPatterns = canUseNeiFavorites ? neiFavorites.hiddenPatterns : [];
  const visibleNeiCatalogEntries = useMemo(() => {
    if (!hiddenNeiPatterns.length) {
      return neiCatalogEntries;
    }
    return neiCatalogEntries.filter((entry) => !hiddenNeiPatterns.some((pattern) => entryMatchesHiddenPattern(entry, pattern)));
  }, [neiCatalogEntries, hiddenNeiPatterns]);

  const filteredNeiItems = useMemo(() => {
    const query = neiSearchQuery.trim().toLowerCase();
    return query
      ? visibleNeiCatalogEntries.filter((entry) => (
        entry.key.includes(query)
        || entry.displayRu.toLowerCase().includes(query)
        || entry.displayEn.toLowerCase().includes(query)
        || String(entry.legacyId ?? '').includes(query)
      ))
      : visibleNeiCatalogEntries;
  }, [neiSearchQuery, visibleNeiCatalogEntries]);

  const neiPageSize = clamp(Math.floor(Number(uiPreferences.nei_page_size) || neiColumnCount * NEI_VISIBLE_ROWS), 16, 512);
  const neiPageCount = Math.max(1, Math.ceil(filteredNeiItems.length / neiPageSize));
  const neiItems = useMemo(() => {
    const safePage = clamp(neiPage, 0, neiPageCount - 1);
    const start = safePage * neiPageSize;
    return filteredNeiItems.slice(start, start + neiPageSize);
  }, [filteredNeiItems, neiPage, neiPageCount, neiPageSize]);

  const visibleNeiRawItems = useMemo(() => neiItems.map((entry) => itemPanelRaw(entry)), [neiItems]);
  const activeFavoriteRawSet = useMemo(() => {
    const tab = activeNeiFavoriteTab();
    return new Set(tab.items.map((item) => item.raw));
  }, [neiFavorites]);
  const uploadedDraftRecipeIndexes = useMemo(() => {
    const byOutput = new Map<string, UploadedDraftRecipeMatch>();
    const byIngredient = new Map<string, UploadedDraftRecipeMatch[]>();
    recipeDraftTemplates.forEach((template) => {
      collectRecipeOutputRaws(template.sourceText).forEach((outputRaw) => {
        recipeLookupKeysForRaw(outputRaw).forEach((key) => {
          if (!byOutput.has(key)) {
            byOutput.set(key, {
              sourceId: template.id,
              sourceName: template.name,
              block: template.sourceText,
              matchedRaw: outputRaw,
              createdByEmail: template.createdByEmail,
              templateId: template.id
            });
          }
        });
      });
      collectRecipeIngredientRaws(template.sourceText).forEach((ingredientRaw) => {
        recipeLookupKeysForRaw(ingredientRaw).forEach((key) => {
          const matches = byIngredient.get(key) ?? [];
          if (!matches.some((match) => match.templateId === template.id)) {
            matches.push({
              sourceId: template.id,
              sourceName: template.name,
              block: template.sourceText,
              matchedRaw: ingredientRaw,
              createdByEmail: template.createdByEmail,
              templateId: template.id
            });
            byIngredient.set(key, matches);
          }
        });
      });
    });
    uploadedDrafts.forEach((draft) => {
      collectRecipeBlocks(draft.text).forEach((block) => {
        collectRecipeOutputRaws(block).forEach((outputRaw) => {
          recipeLookupKeysForRaw(outputRaw).forEach((key) => {
            if (!byOutput.has(key)) {
              byOutput.set(key, { sourceId: draft.id, sourceName: draft.name, block, matchedRaw: outputRaw });
            }
          });
        });
        collectRecipeIngredientRaws(block).forEach((ingredientRaw) => {
          recipeLookupKeysForRaw(ingredientRaw).forEach((key) => {
            const matches = byIngredient.get(key) ?? [];
            if (!matches.some((match) => match.sourceId === draft.id && match.block === block)) {
              matches.push({ sourceId: draft.id, sourceName: draft.name, block, matchedRaw: ingredientRaw });
              byIngredient.set(key, matches);
            }
          });
        });
      });
    });
    return { byOutput, byIngredient };
  }, [uploadedDrafts, recipeDraftTemplates]);
  const uploadedDraftRecipeIndex = uploadedDraftRecipeIndexes.byOutput;
  const uploadedDraftIngredientIndex = uploadedDraftRecipeIndexes.byIngredient;
  const uploadedDraftOutputKeys = useMemo(() => new Set(uploadedDraftRecipeIndex.keys()), [uploadedDraftRecipeIndex]);
  const recipeDraftTemplatesByOutputKey = useMemo(() => {
    const byOutput = new Map<string, RecipeDraftTemplate[]>();
    recipeDraftTemplates.forEach((template) => {
      recipeLookupKeysForRaw(template.outputRaw).forEach((key) => {
        const templates = byOutput.get(key) ?? [];
        if (!templates.some((current) => current.id === template.id)) {
          templates.push(template);
          byOutput.set(key, templates);
        }
      });
    });
    return byOutput;
  }, [recipeDraftTemplates]);
  function getRecipeDraftTemplatesForRaw(raw: string): RecipeDraftTemplate[] {
    const templates = new Map<string, RecipeDraftTemplate>();
    recipeLookupKeysForRaw(raw).forEach((key) => {
      (recipeDraftTemplatesByOutputKey.get(key) ?? []).forEach((template) => templates.set(template.id, template));
    });
    return [...templates.values()];
  }

  const draftItemEntries = useMemo<DraftItemEntry[]>(() => {
    const grouped = new Map<string, { raw: string; draftIds: Set<string>; maxUpdatedAt: number; authors: Set<string>; gridSizes: Set<string> }>();
    recipeDraftTemplates.forEach((template) => {
      const raw = template.outputRaw;
      const group = grouped.get(raw) ?? { raw, draftIds: new Set<string>(), maxUpdatedAt: 0, authors: new Set<string>(), gridSizes: new Set<string>() };
      group.draftIds.add(template.id);
      group.maxUpdatedAt = Math.max(group.maxUpdatedAt, template.updatedAt);
      if (template.createdByEmail) group.authors.add(template.createdByEmail);
      if (template.recipe) {
        group.gridSizes.add(`${template.recipe.grid_w}x${template.recipe.grid_h}`);
      }
      grouped.set(raw, group);
    });

    const query = draftItemSearchQuery.trim().toLowerCase();
    const entries = [...grouped.values()]
      .map((entry) => {
        const title = resolveCellTitle(entry.raw);
        const parsed = parseItemRaw(entry.raw);
        const panelEntry = parsed
          ? itemPanelTranslations.byKeyMeta.get(parsed.key)?.get(parsed.meta ?? 0)
            ?? itemPanelTranslations.entries.find((item) => item.key === parsed.key)
          : null;
        return {
          raw: entry.raw,
          draftCount: entry.draftIds.size,
          title,
          hasNbt: rawHasNbtTag(entry.raw),
          searchText: `${entry.raw} ${title} ${panelEntry?.displayEn ?? ''} ${panelEntry?.legacyId ?? ''}`.toLowerCase(),
          modid: parsed?.key.split(':')[0] || 'unknown',
          maxUpdatedAt: entry.maxUpdatedAt,
          authors: entry.authors,
          gridSizes: entry.gridSizes
        };
      })
      .filter((entry) => !query || entry.searchText.includes(query));

    return entries.sort((left, right) => {
      if (draftItemSortMode === 'drafts-desc') {
        return right.draftCount - left.draftCount || left.title.localeCompare(right.title);
      }
      if (draftItemSortMode === 'drafts-asc') {
        return left.draftCount - right.draftCount || left.title.localeCompare(right.title);
      }
      if (draftItemSortMode === 'date-desc') {
        return right.maxUpdatedAt - left.maxUpdatedAt || left.title.localeCompare(right.title);
      }
      if (draftItemSortMode === 'date-asc') {
        return left.maxUpdatedAt - right.maxUpdatedAt || left.title.localeCompare(right.title);
      }
      return left.title.localeCompare(right.title);
    });
  }, [customItems, draftItemSearchQuery, draftItemSortMode, itemPanelTranslations, recipeDraftTemplates]);
  const draftItemPageCount = Math.max(1, Math.ceil(draftItemEntries.length / DRAFT_ITEM_PAGE_SIZE));
  const draftItemsPage = useMemo(() => {
    const safePage = clamp(draftItemPage, 0, draftItemPageCount - 1);
    return draftItemEntries.slice(safePage * DRAFT_ITEM_PAGE_SIZE, safePage * DRAFT_ITEM_PAGE_SIZE + DRAFT_ITEM_PAGE_SIZE);
  }, [draftItemEntries, draftItemPage, draftItemPageCount]);

  /** Compute stable, non-empty group keys for a DraftItemEntry given the current group mode. */
  function getDraftEntryGroupKeys(entry: DraftItemEntry, mode: DraftItemGroupMode): { name: string; key: string }[] {
    if (mode === 'none') return [{ name: 'Все предметы', key: 'all' }];
    if (mode === 'mod') {
      const value = entry.modid.trim() || 'unknown';
      return [{ name: value, key: `mod:${value}` }];
    }
    if (mode === 'author') {
      if (entry.authors.size === 0) {
        return [{ name: 'Неизвестно', key: 'author:unknown' }];
      }
      return Array.from(entry.authors).map((author) => {
        const value = author.trim() || 'Неизвестно';
        return { name: value, key: `author:${value}` };
      });
    }
    if (mode === 'grid-size') {
      if (entry.gridSizes.size === 0) {
        return [{ name: 'Неизвестно', key: 'grid:unknown' }];
      }
      return Array.from(entry.gridSizes).map((gridSize) => {
        const value = gridSize.trim() || 'Неизвестно';
        return { name: value, key: `grid:${value}` };
      });
    }
    if (mode === 'date') {
      const value = new Date(entry.maxUpdatedAt).toLocaleDateString();
      return [{ name: value, key: `date:${value || 'unknown'}` }];
    }
    return [{ name: 'Все предметы', key: 'all' }];
  }

  const groupedDraftItems = useMemo<DraftGroup[]>(() => {
    if (draftItemGroupMode === 'none') {
      return [{
        name: 'Все предметы',
        key: 'all',
        items: draftItemsPage
      }];
    }

    const groupsMap = new Map<string, { name: string; key: string; items: DraftItemEntry[] }>();

    for (const entry of draftItemsPage) {
      const keys = getDraftEntryGroupKeys(entry, draftItemGroupMode);
      for (const { name, key } of keys) {
        let group = groupsMap.get(key);
        if (!group) {
          group = { name, key, items: [] };
          groupsMap.set(key, group);
        }
        if (!group.items.some((item) => item.raw === entry.raw)) {
          group.items.push(entry);
        }
      }
    }

    const groups = Array.from(groupsMap.values());

    // Sort the groups consistently
    groups.sort((a, b) => {
      if (draftItemGroupMode === 'date') {
        const maxA = Math.max(...a.items.map((item) => item.maxUpdatedAt));
        const maxB = Math.max(...b.items.map((item) => item.maxUpdatedAt));
        if (draftItemSortMode === 'date-asc') {
          return maxA - maxB;
        } else {
          return maxB - maxA;
        }
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    return groups;
  }, [draftItemsPage, draftItemGroupMode, draftItemSortMode]);

  const visibleDraftRawItems = useMemo(() => draftItemsPage.map((entry) => entry.raw), [draftItemsPage]);
  const availabilityLookupRaws = useMemo(() => (
    [...new Set([...visibleNeiRawItems, ...visibleDraftRawItems].flatMap(recipeLookupKeysForRaw))].slice(0, 300)
  ), [visibleDraftRawItems, visibleNeiRawItems]);
  const selectedDraftTemplates = useMemo(() => {
    if (!selectedDraftItemRaw) return [];
    return getRecipeDraftTemplatesForRaw(selectedDraftItemRaw).sort((left, right) => right.updatedAt - left.updatedAt);
  }, [recipeDraftTemplatesByOutputKey, selectedDraftItemRaw]);
  const activeDraftPreview = useMemo(() => (
    selectedDraftTemplates.find((draft) => draft.id === previewDraftTemplateId) ?? selectedDraftTemplates[0] ?? null
  ), [previewDraftTemplateId, selectedDraftTemplates]);

  useEffect(() => {
    setNeiPage(0);
  }, [neiSearchQuery]);

  useEffect(() => {
    setDraftItemPage(0);
  }, [draftItemSearchQuery, draftItemSortMode, draftItemGroupMode]);

  useEffect(() => {
    setDraftItemPage((current) => clamp(current, 0, draftItemPageCount - 1));
  }, [draftItemPageCount]);

  useEffect(() => {
    const visibleRaws = draftItemEntries.map((entry) => entry.raw);
    if (selectedDraftItemRaw && visibleRaws.includes(selectedDraftItemRaw)) {
      return;
    }
    setSelectedDraftItemRaw(visibleRaws[0] ?? null);
  }, [draftItemEntries, selectedDraftItemRaw]);

  useEffect(() => {
    if (!selectedDraftTemplates.length) {
      if (previewDraftTemplateId) {
        setPreviewDraftTemplateId(null);
      }
      return;
    }
    if (!previewDraftTemplateId || !selectedDraftTemplates.some((draft) => draft.id === previewDraftTemplateId)) {
      setPreviewDraftTemplateId(selectedDraftTemplates[0].id);
    }
  }, [previewDraftTemplateId, selectedDraftTemplates]);

  useEffect(() => {
    const lookupRaws = availabilityLookupRaws;
    if (!lookupRaws.length) return undefined;
    let cancelled = false;
    async function loadAvailability() {
      try {
        const response = await searchRecipesByOutputs(lookupRaws);
        if (cancelled) return;
        setRecipeAvailability((current) => {
          const next = { ...current };
          lookupRaws.forEach((raw) => {
            next[raw] = (response.matches[raw] ?? 0) > 0;
          });
          return next;
        });
      } catch {
        // Availability is a visual hint only; editing must stay usable offline.
      }
    }
    void loadAvailability();
    return () => {
      cancelled = true;
    };
  }, [availabilityLookupRaws.join('|')]);

  useEffect(() => {
    setNeiPage((current) => clamp(current, 0, neiPageCount - 1));
  }, [neiPageCount]);

  useEffect(() => {
    const element = neiListRef.current;
    if (!element) {
      return undefined;
    }
    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 20 || neiPageCount <= 1) {
        return;
      }
      event.preventDefault();
      setNeiPage((current) => clamp(current + (event.deltaY > 0 ? 1 : -1), 0, neiPageCount - 1));
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [neiPageCount]);

  useEffect(() => {
    const suggestions = itemSearchSuggestions.slice(0, 8);
    suggestions.forEach((entry) => {
      const raw = `<${entry.key}${entry.meta > 0 ? `:${entry.meta}` : ''}>`;
      if (modIconByRaw.has(raw) || itemSearchIcons[raw] || iconRequestRef.current.has(raw)) {
        return;
      }
      iconRequestRef.current.add(raw);
      void (async () => {
        try {
          const resolved = await resolveItemRaw(raw);
          setItemSearchIcons((current) => ({ ...current, [raw]: resolved.icon_url ?? null }));
        } catch {
          setItemSearchIcons((current) => ({ ...current, [raw]: null }));
        }
      })();
    });
  }, [itemSearchSuggestions, itemSearchIcons, modIconByRaw]);

  useEffect(() => {
    let cancelled = false;
    const missing = visibleNeiRawItems.filter((raw) => !modIconByRaw.has(raw) && !itemPanelAtlas?.entries[raw] && !itemSearchIcons[raw] && !iconRequestRef.current.has(raw));
    if (itemPanelAtlas === undefined) {
      return;
    }
    missing.forEach((raw) => iconRequestRef.current.add(raw));

    async function loadVisibleIcons() {
      const queue = [...missing];
      const workerCount = Math.min(12, queue.length);
      await Promise.all(Array.from({ length: workerCount }, async () => {
        while (!cancelled && queue.length > 0) {
          const raw = queue.shift();
          if (!raw) return;
          try {
            const resolved = await resolveItemRaw(raw);
            if (!cancelled) {
              setItemSearchIcons((current) => ({ ...current, [raw]: resolved.icon_url ?? null }));
            }
          } catch {
            if (!cancelled) {
              setItemSearchIcons((current) => ({ ...current, [raw]: null }));
            }
          }
        }
      }));
    }

    void loadVisibleIcons();
    return () => {
      cancelled = true;
    };
  }, [visibleNeiRawItems, itemSearchIcons, itemPanelAtlas, modIconByRaw]);

  useEffect(() => {
    if (itemSearchIconCacheKeyRef.current !== itemSearchIconCacheKey) {
      return;
    }
    try {
      window.localStorage.setItem(itemSearchIconCacheKey, JSON.stringify(itemSearchIcons));
    } catch {
      // ignore cache persistence errors
    }
  }, [itemSearchIcons, itemSearchIconCacheKey]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(itemSearchIconCacheKey);
      if (!raw) {
        setItemSearchIcons({});
        itemSearchIconCacheKeyRef.current = itemSearchIconCacheKey;
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, string | null>;
      setItemSearchIcons(parsed && typeof parsed === 'object' ? parsed : {});
    } catch {
      setItemSearchIcons({});
    }
    itemSearchIconCacheKeyRef.current = itemSearchIconCacheKey;
    iconRequestRef.current.clear();
  }, [itemSearchIconCacheKey]);

  async function waitWhileTextureLoadingPaused() {
    while (texturePauseRef.current && !textureCancelRef.current) {
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
  }

  async function loadSelectedTextures() {
    if (textureLoadState === 'running') {
      return;
    }
    textureCancelRef.current = false;
    texturePauseRef.current = false;
    setTextureLoadState('running');
    setIsTextureModsOpen(true);

    const selectedMods = new Set(Object.entries(selectedTextureMods).filter(([, checked]) => checked).map(([modid]) => modid));
    const selectedEntries = itemPanelTranslations.entries.filter((entry) => {
      const [modid] = entry.key.split(':');
      return Boolean(modid) && selectedMods.has(modid);
    });
    if (!selectedEntries.length) {
      setTextureLoadStatus(t('textures.noModsSelected'));
      setTextureLoadState('idle');
      return;
    }

    const pending: Array<{ modid: string; raw: string }> = [];
    const seen = new Set<string>();
    selectedEntries.forEach((entry) => {
      const [modid] = entry.key.split(':');
      if (!modid) return;
      const raw = buildItemRawValue(entry.key, entry.meta);
      if (seen.has(raw)) return;
      seen.add(raw);
      if (Object.prototype.hasOwnProperty.call(itemSearchIcons, raw)) return;
      pending.push({ modid, raw });
    });

    if (!pending.length) {
      setTextureLoadStatus(t('textures.alreadyLoaded'));
      setTextureLoadState('idle');
      return;
    }

    for (let index = 0; index < pending.length; index += 1) {
      if (textureCancelRef.current) {
        setTextureLoadStatus(t('textures.cancelled'));
        setTextureLoadState('idle');
        return;
      }
      await waitWhileTextureLoadingPaused();
      if (textureCancelRef.current) {
        setTextureLoadStatus(t('textures.cancelled'));
        setTextureLoadState('idle');
        return;
      }

      const current = pending[index];
      setTextureLoadStatus(`${t('textures.loadingMod')} ${current.modid} (${index + 1}/${pending.length})`);
      try {
        const resolved = await resolveItemRaw(current.raw);
        setItemSearchIcons((icons) => ({ ...icons, [current.raw]: resolved.icon_url ?? null }));
      } catch {
        setItemSearchIcons((icons) => ({ ...icons, [current.raw]: null }));
      }
    }
    setTextureLoadStatus(t('textures.finished'));
    setTextureLoadState('idle');
  }

  function handlePauseTextureLoading() {
    texturePauseRef.current = true;
    setTextureLoadState('paused');
    setTextureLoadStatus(t('textures.paused'));
  }

  function handleResumeTextureLoading() {
    texturePauseRef.current = false;
    setTextureLoadState('running');
    setTextureLoadStatus(t('textures.resumed'));
  }

  function handleCancelTextureLoading() {
    textureCancelRef.current = true;
    texturePauseRef.current = false;
  }

  function toggleTextureModSelection(modid: string, checked: boolean) {
    setSelectedTextureMods((current) => ({ ...current, [modid]: checked }));
  }

  function setAllTextureModSelections(checked: boolean) {
    const next: Record<string, boolean> = {};
    itemPanelModSummaries.forEach((summary) => {
      next[summary.modid] = checked;
    });
    setSelectedTextureMods(next);
  }

  function applyItemSearchSuggestion(entry: ItemPanelEntry) {
    const nextRaw = applyItemCaseAlias(itemPanelRaw(entry));
    const parsed = parseRawForEditor(nextRaw);
    setItemModDraft(parsed.modid);
    setItemNameDraft(parsed.item);
    setItemMetaDraft(String(parsed.meta));
    setNbtRootDraft(parsed.nbtRoot);
    setCollapsedNbtPaths({});
    setCraftSourceDraft(nextRaw);
    setCraftSourceMode('structured');
    setItemSearchQuery(itemPanelRaw(entry));
  }

  function renderModalScaleControl(key: ModalScaleKey): JSX.Element {
    const isOpen = activeScaleControl === key;
    return (
      <div className="modal-scale-wrap">
        <button type="button" className="ghost-button modal-scale-button" aria-label={`modal-scale-${key}`} onClick={() => setActiveScaleControl((current) => current === key ? null : key)}>Масштаб</button>
        {isOpen ? (
          <div className="modal-scale-popover">
            <button type="button" className="ghost-button" aria-label={`modal-scale-${key}-down`} onClick={() => patchModalScale(key, modalScales[key] - 0.1)}>Меньше</button>
            <input aria-label={`modal-scale-${key}-range`} type="range" min="0.8" max="1.5" step="0.1" value={modalScales[key]} onChange={(event) => patchModalScale(key, Number(event.target.value))} />
            <button type="button" className="ghost-button" aria-label={`modal-scale-${key}-up`} onClick={() => patchModalScale(key, modalScales[key] + 0.1)}>Больше</button>
            <span>{Math.round(modalScales[key] * 100)}%</span>
          </div>
        ) : null}
      </div>
    );
  }

  function getCellRaw(target: CraftEditorTarget): string {
    if (target.kind === 'output') {
      return outputRaw;
    }
    return matrix[target.row]?.[target.col] ?? '';
  }

  function applyItemCaseAlias(raw: string): string {
    return applyItemCaseAliasesToRaw(raw, itemCaseAliases);
  }

  function setCellRaw(target: CraftEditorTarget, raw: string) {
    const nextValue = applyItemCaseAlias(raw);
    if (target.kind === 'output') {
      const cachedIconUrl = getCachedItemIconUrl(nextValue) ?? getCachedItemIconUrl(raw);
      setOutputRaw(nextValue);
      setRecipe((current) => ({
        ...current,
        output: { ...current.output, raw: nextValue },
        output_resolution: cachedIconUrl
          ? { item_raw: nextValue, icon_url: cachedIconUrl, display_name: resolveCellTitle(nextValue), strategy: 'itempanel_cache' }
          : current.output_resolution
      }));
      setSaveStatus(t('values.unsavedChanges'));
      return;
    }
    setMatrixCell(target.row, target.col, nextValue);
  }

  function setGridSize(size: number) {
    const nextSize = normalizeGridSize(Number(size));
    const nextMatrix = resizeMatrix(matrix, nextSize);
    const nextRecipeType = recipeTypeFromCraftMode(recipeCraftMode, nextSize);
    const nextBindingMode = nextRecipeType === 'ct_shapeless' ? 'soft' : recipeBindingMode;
    setMatrix(nextMatrix);
    if (nextRecipeType === 'ct_shapeless') {
      setStrictBinding(false);
    }
    setRecipe((current) => ({
      ...current,
      recipe_type: nextRecipeType,
      binding_mode: nextBindingMode,
      grid_w: nextSize,
      grid_h: nextSize,
      matrix: nextMatrix.map((row) => row.map((raw) => ({ raw })))
    }));
    setSaveStatus(t('values.unsavedChanges'));
  }

  function setRecipeCraftMode(mode: RecipeCraftMode) {
    const currentSize = normalizeGridSize(matrix.length);
    const nextSize = mode === 'shapeless' && currentSize === 9 ? 3 : currentSize;
    const nextRecipeType = recipeTypeFromCraftMode(mode, nextSize);
    const nextMatrix = nextSize === matrix.length ? matrix : resizeMatrix(matrix, nextSize);
    const nextBindingMode = nextRecipeType === 'ct_shapeless' ? 'soft' : recipeBindingMode;
    setMatrix(nextMatrix);
    if (nextRecipeType === 'ct_shapeless') {
      setStrictBinding(false);
    }
    setRecipe((current) => ({
      ...current,
      recipe_type: nextRecipeType,
      binding_mode: nextBindingMode,
      grid_w: nextSize,
      grid_h: nextSize,
      matrix: nextMatrix.map((row) => row.map((raw) => ({ raw })))
    }));
    setSaveStatus(t('values.unsavedChanges'));
  }

  function setRecipeBindingMode(nextBindingMode: RecipeBindingMode) {
    setStrictBinding(nextBindingMode === 'strict');
    setRecipe((current) => ({
      ...current,
      binding_mode: nextBindingMode
    }));
    setSaveStatus(t('values.unsavedChanges'));
  }

  function copyCurrentCraftBody() {
    const template = saveCraftBodyTemplate({
      schemaVersion: 1,
      recipeType: recipe.recipe_type,
      bindingMode: recipeBindingMode,
      matrix: cloneMatrix(matrix),
      copiedAt: Date.now()
    });
    setCraftBodyTemplate(template);
    setStatus(`Тело крафта скопировано: ${template.matrix.length}x${maxGridWidth(template.matrix)}.`);
  }

  function pasteCraftBody() {
    const template = craftBodyTemplate ?? loadCraftBodyTemplate();
    if (!template) {
      setStatus('Сначала скопируйте тело крафта.');
      return;
    }
    const size = normalizeGridSize(Math.max(template.matrix.length, maxGridWidth(template.matrix), 3));
    const nextMatrix = resizeMatrix(template.matrix, size);
    const nextRecipeType = template.recipeType === 'ct_shapeless' && size === 9 ? 'ct_shaped' : template.recipeType;
    const nextBindingMode: RecipeBindingMode = nextRecipeType === 'ct_shapeless' ? 'soft' : template.bindingMode;
    setCraftBodyTemplate(template);
    setMatrix(nextMatrix);
    setStrictBinding(nextBindingMode === 'strict');
    setRecipe((current) => ({
      ...current,
      recipe_type: nextRecipeType,
      binding_mode: nextBindingMode,
      grid_w: size,
      grid_h: size,
      matrix: nextMatrix.map((row) => row.map((raw) => ({ raw })))
    }));
    setSaveStatus(t('values.unsavedChanges'));
    setStatus(`Тело крафта вставлено, output оставлен: ${outputRaw}.`);
  }

  function handleRecipeItemDrop(target: CraftEditorTarget, raw: string) {
    const normalized = raw.trim();
    if (!normalized) return;
    setCellRaw(target, normalized);
  }

  function setMatrixCell(row: number, col: number, raw: string | null) {
    const nextRaw = raw === null || raw === '' || raw === 'null' ? null : applyItemCaseAlias(raw);
    setMatrix((current) => current.map((line, rowIndex) => line.map((cell, colIndex) => (
      rowIndex === row && colIndex === col ? nextRaw : cell
    ))));
    setRecipe((current) => ({
      ...current,
      matrix: current.matrix.map((line, rowIndex) => line.map((cell, colIndex) => (
        rowIndex === row && colIndex === col
          ? { raw: nextRaw, resolution: cell.raw === nextRaw ? cell.resolution : null }
          : cell
      )))
    }));
    setSaveStatus(t('values.unsavedChanges'));
  }

  function handleCraftCellClick(row: number, col: number) {
    const currentRaw = matrix[row]?.[col] ?? null;
    if (heldItemRaw) {
      setMatrixCell(row, col, heldItemRaw);
      return;
    }
    if (currentRaw) {
      setHeldItemRaw(String(currentRaw));
      setMatrixCell(row, col, null);
    }
  }

  function handleCraftCellContextMenu(row: number, col: number, event?: MouseEvent) {
    const currentRaw = matrix[row]?.[col] ?? null;
    if (event?.ctrlKey && currentRaw) {
      openCustomItemEditor(String(currentRaw), 'user', 'local', { kind: 'cell', row, col });
      return;
    }
    setMatrixCell(row, col, null);
  }

  function handleCraftOutputClick() {
    if (!heldItemRaw) {
      return;
    }
    handleRecipeItemDrop({ kind: 'output' }, heldItemRaw);
  }

  function handleNeiItemPick(raw: string) {
    const nextRaw = applyItemCaseAlias(raw);
    setTouchItemInspection(null);
    setHeldItemRaw((current) => (current === nextRaw ? null : nextRaw));
  }

  function openNeiItemActions(raw: string, x: number, y: number) {
    setTouchItemInspection(null);
    setNeiContextMenu({ raw, x, y });
  }

  function inspectNeiItem(raw: string, x: number, y: number, entry?: ItemPanelEntry | null) {
    setNeiContextMenu(null);
    updateHoveredItemRaw(raw);
    setTouchItemInspection({ raw, x, y, entry });
  }

  function handleNeiItemTaskPrefill(raw: string) {
    const nextRaw = applyItemCaseAlias(raw);
    const title = resolveCellTitle(nextRaw) || resolveCellTitle(raw) || nextRaw;
    setTaskPrefillItem({ raw: nextRaw, title, nonce: Date.now() });
    setWorkspaceTab('tasks');
    setNeiContextMenu(null);
    setStatus(`Предмет добавлен в новую задачу: ${title}`);
  }

  function createBlankRecipeForOutput(raw: string): RecipeView {
    const nextRaw = applyItemCaseAlias(raw);
    const iconUrl = getCachedItemIconUrl(nextRaw) ?? getCachedItemIconUrl(raw);
    return {
      ...defaultRecipe,
      output: { raw: nextRaw },
      output_resolution: iconUrl
        ? { item_raw: nextRaw, icon_url: iconUrl, display_name: resolveCellTitle(nextRaw), strategy: 'itempanel_cache' }
        : null,
      matrix: defaultMatrix.map((row) => row.map((cell) => ({ raw: cell }))),
      source: { kind: 'generated', path: null }
    };
  }

  function openBlankRecipeForItem(raw: string) {
    const nextRecipe = createBlankRecipeForOutput(raw);
    applyRecipe(nextRecipe, '', { rememberCurrent: true });
    setSimilarRecipes(null);
    setHeldItemRaw(null);
    setWorkspaceTab('editor');
    setStatus(`Рецепт для ${nextRecipe.output.raw} не найден. Открыт пустой крафт с этим output.`);
    setLastParseResult(nextRecipe.recipe_type);
    setLastApiStatus(t('values.ok'));
  }

  function findUploadedDraftRecipeBlock(raw: string): UploadedDraftRecipeMatch | null {
    for (const key of recipeLookupKeysForRaw(raw)) {
      const match = uploadedDraftRecipeIndex.get(key);
      if (match) return match;
    }
    return collectLoadedDraftRecipeMatches(raw, 'output')[0] ?? null;
  }

  function findUploadedDraftRecipeUses(raw: string): UploadedDraftRecipeMatch[] {
    const matches: UploadedDraftRecipeMatch[] = [];
    const seen = new Set<string>();
    for (const key of recipeLookupKeysForRaw(raw)) {
      const keyMatches = uploadedDraftIngredientIndex.get(key) ?? [];
      keyMatches.forEach((match) => {
        const matchKey = `${match.sourceId}:${match.block}`;
        if (seen.has(matchKey)) return;
        seen.add(matchKey);
        matches.push(match);
      });
    }
    collectLoadedDraftRecipeMatches(raw, 'ingredient').forEach((match) => {
      const matchKey = `${match.sourceId}:${match.block}`;
      if (seen.has(matchKey)) return;
      seen.add(matchKey);
      matches.push(match);
    });
    return matches;
  }

  function collectLoadedDraftRecipeMatches(raw: string, kind: 'output' | 'ingredient'): UploadedDraftRecipeMatch[] {
    const activeKeys = new Set(recipeLookupKeysForRaw(raw));
    const matches: UploadedDraftRecipeMatch[] = [];
    const seen = new Set<string>();
    const pushMatches = (
      sourceId: string,
      sourceName: string,
      block: string,
      candidateRaws: string[],
      extras?: Pick<UploadedDraftRecipeMatch, 'createdByEmail' | 'templateId'>
    ) => {
      candidateRaws.forEach((candidateRaw) => {
        const isMatch = recipeLookupKeysForRaw(candidateRaw).some((key) => activeKeys.has(key));
        if (!isMatch) return;
        const matchKey = `${sourceId}:${kind}:${block}:${candidateRaw}`;
        if (seen.has(matchKey)) return;
        seen.add(matchKey);
        matches.push({ sourceId, sourceName, block, matchedRaw: candidateRaw, ...extras });
      });
    };

    recipeDraftTemplates.forEach((template) => {
      pushMatches(
        template.id,
        template.name,
        template.sourceText,
        kind === 'output'
          ? collectRecipeOutputRaws(template.sourceText)
          : collectRecipeIngredientRaws(template.sourceText),
        { createdByEmail: template.createdByEmail, templateId: template.id }
      );
    });
    uploadedDrafts.forEach((draft) => {
      collectRecipeBlocks(draft.text).forEach((block) => {
        pushMatches(
          draft.id,
          draft.name,
          block,
          kind === 'output'
            ? collectRecipeOutputRaws(block)
            : collectRecipeIngredientRaws(block)
        );
      });
    });
    return matches;
  }

  async function parseUploadedDraftRecipeMatches(raw: string, matches: UploadedDraftRecipeMatch[]): Promise<RecipeView[]> {
    if (!matches.length) return [];
    const startedAt = performance.now();
    const parsedMatches = await Promise.all(matches.map(async (match) => {
      try {
        const result = await parseText(match.block);
        if (!result.recipe) {
          logHotkeyDebug('uploaded draft uses parse returned no recipe', { raw, draft: match.sourceName, matchedRaw: match.matchedRaw }, 'warning');
          return null;
        }
        return {
          ...result.recipe,
          source: { ...result.recipe.source, path: match.sourceName }
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logHotkeyDebug('uploaded draft uses parse failed', { raw, draft: match.sourceName, matchedRaw: match.matchedRaw, error: message }, 'error');
        return null;
      }
    }));
    const recipes = parsedMatches.filter((recipe): recipe is RecipeView => Boolean(recipe));
    logHotkeyDebug('uploaded draft uses parsed', { raw, candidates: matches.length, matches: recipes.length, durationMs: elapsedMs(startedAt) }, recipes.length ? 'success' : 'warning');
    return recipes;
  }

  async function openRecipeFromUploadedDraft(raw: string, knownMatch?: UploadedDraftRecipeMatch): Promise<boolean> {
    const match = knownMatch ?? findUploadedDraftRecipeBlock(raw);
    if (!match) {
      logHotkeyDebug('uploaded draft lookup response', { raw, matches: 0 }, 'warning');
      return false;
    }
    logHotkeyDebug('uploaded draft match found', { raw, draft: match.sourceName, matchedRaw: match.matchedRaw }, 'success');
    setSelectedDraftId(match.sourceId);
    const parseStartedAt = performance.now();
    const result = await parseText(match.block);
    logHotkeyDebug('uploaded draft parse completed', { raw, draft: match.sourceName, durationMs: elapsedMs(parseStartedAt) }, 'success');
    if (!result.recipe) {
      logHotkeyDebug('uploaded draft parse returned no recipe', { raw, draft: match.sourceName }, 'warning');
      return false;
    }
    const recipeFromDraft: RecipeView = {
      ...result.recipe,
      source: { ...result.recipe.source, path: match.sourceName }
    };
    applyRecipe(recipeFromDraft, match.block, { rememberCurrent: true });
    setSimilarRecipes(null);
    setHeldItemRaw(null);
    setWorkspaceTab('editor');
    setStatus(`Открыт локальный черновик ${recipeFromDraft.output.raw} из ${match.sourceName}.`);
    setLastParseResult(recipeFromDraft.recipe_type);
    setLastApiStatus(t('values.ok'));
    logHotkeyDebug('uploaded draft recipe applied', { raw, outputRaw: recipeFromDraft.output.raw, draft: match.sourceName }, 'success');
    return true;
  }

  function inspectActiveItemRaw(): ActiveItemInspection {
    const hoveredRef = hoveredItemRawRef.current?.trim() || null;
    const hoveredStateValue = hoveredItemRaw?.trim() || null;
    const point = cursorPointRef.current;
    const target = typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(point.x, point.y)
      : null;
    const itemElement = target?.closest<HTMLElement>('[data-item-raw]') ?? null;
    const domRaw = itemElement?.dataset.itemRaw?.trim() || null;
    const heldRaw = heldItemRaw?.trim() || null;
    const raw = hoveredRef || hoveredStateValue || domRaw || heldRaw || null;
    const source = hoveredRef
      ? 'hover-ref'
      : hoveredStateValue
        ? 'hover-state'
        : domRaw
          ? 'dom'
          : heldRaw
            ? 'held'
            : 'none';
    return {
      raw,
      source,
      hoveredRef,
      hoveredState: hoveredStateValue,
      domRaw,
      heldRaw,
      pointElement: describeElement(target),
      itemElement: describeElement(itemElement),
      cursor: `${Math.round(point.x)},${Math.round(point.y)}`
    };
  }

  async function openRecipeForItem(raw: string) {
    const normalizedRaw = raw.trim();
    if (!normalizedRaw) {
      logHotkeyDebug('recipe lookup stopped: empty raw', { raw }, 'warning');
      return;
    }
    logHotkeyDebug('recipe lookup started', { raw: normalizedRaw });
    setStatus(`Ищу рецепт для ${normalizedRaw}...`);
    setLastApiStatus(t('values.pending'));
    try {
      const lookupKeys = recipeLookupKeysForRaw(normalizedRaw);
      const draftMatch = findUploadedDraftRecipeBlock(normalizedRaw);
      const hasKnownBackendMatch = lookupKeys.some((lookupRaw) => recipeAvailability[lookupRaw] === true);
      if (draftMatch && !hasKnownBackendMatch) {
        logHotkeyDebug('uploaded draft cache hit', { raw: normalizedRaw, draft: draftMatch.sourceName, matchedRaw: draftMatch.matchedRaw }, 'success');
        if (await openRecipeFromUploadedDraft(normalizedRaw, draftMatch)) {
          return;
        }
      }

      const lookupResults = await Promise.all(lookupKeys.map(async (lookupRaw) => {
        const searchStartedAt = performance.now();
        const result = await searchRecipesByOutput(lookupRaw);
        logHotkeyDebug('recipe lookup response', { raw: lookupRaw, requestedRaw: normalizedRaw, matches: result.matches.length, durationMs: elapsedMs(searchStartedAt) }, result.matches.length ? 'success' : 'warning');
        return { lookupRaw, result };
      }));
      const backendMatches = mergeRecipeMatches(...lookupResults.map(({ result }) => result.matches));
      const match = backendMatches[0];
      if (!match) {
        logHotkeyDebug('backend lookup empty, checking uploaded drafts', { raw: normalizedRaw, keys: lookupKeys.join(', ') }, 'warning');
        if (await openRecipeFromUploadedDraft(normalizedRaw, draftMatch ?? undefined)) {
          return;
        }
        openBlankRecipeForItem(normalizedRaw);
        return;
        setSimilarRecipes(null);
        setStatus(`Рецепт для ${normalizedRaw} не найден в Recipes и локальных черновиках.`);
        setLastApiStatus(t('values.ok'));
        return;
      }
      setSimilarRecipes(backendMatches.length > 1 ? { raw: normalizedRaw, matches: backendMatches, index: 0 } : null);
      applyRecipe(match, undefined, { rememberCurrent: true });
      logHotkeyDebug('recipe applied', { requestedRaw: normalizedRaw, outputRaw: match.output.raw, recipeUid: match.recipe_uid, sourcePath: match.source.path ?? 'Recipes', matches: backendMatches.length }, 'success');
      setHeldItemRaw(null);
      setWorkspaceTab('editor');
      setStatus(backendMatches.length > 1
        ? `Открыт рецепт 1/${backendMatches.length}: ${match.output.raw} из ${match.source.path ?? 'Recipes'}.`
        : `Открыт рецепт ${match.output.raw} из ${match.source.path ?? 'Recipes'}.`);
      setLastParseResult(match.recipe_type);
      setLastApiStatus(t('values.ok'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logHotkeyDebug('recipe lookup failed', { raw: normalizedRaw, error: message }, 'error');
      setStatus(`Не удалось открыть рецепт для ${normalizedRaw}: ${message}`);
      setLastApiStatus(t('values.error'));
    }
  }

  async function openRecipeUsesForItem(raw: string) {
    const normalizedRaw = raw.trim();
    if (!normalizedRaw) {
      logHotkeyDebug('uses lookup stopped: empty raw', { raw }, 'warning');
      return;
    }
    logHotkeyDebug('uses lookup started', { raw: normalizedRaw });
    setRecipeUsesModal({ raw: normalizedRaw, matches: [], page: 0, status: 'loading' });
    setStatus(`Ищу, где используется ${normalizedRaw}...`);
    setLastApiStatus(t('values.pending'));
    try {
      const localUseMatches = findUploadedDraftRecipeUses(normalizedRaw);
      logHotkeyDebug('uploaded draft uses candidates', { raw: normalizedRaw, matches: localUseMatches.length }, localUseMatches.length ? 'success' : 'warning');
      const backendStartedAt = performance.now();
      const backendLookup = searchRecipesUsingItem(normalizedRaw);
      const localRecipes = await parseUploadedDraftRecipeMatches(normalizedRaw, localUseMatches);
      if (localRecipes.length) {
        setRecipeUsesModal((current) => (
          current?.raw === normalizedRaw
            ? { raw: normalizedRaw, matches: localRecipes, page: 0, status: 'ready' }
            : current
        ));
      }
      const result = await backendLookup;
      logHotkeyDebug('uses lookup response', { raw: normalizedRaw, matches: result.matches.length, durationMs: elapsedMs(backendStartedAt) }, result.matches.length ? 'success' : 'warning');
      const matches = mergeRecipeMatches(result.matches, localRecipes);
      setRecipeUsesModal((current) => (
        current?.raw === normalizedRaw
          ? { raw: normalizedRaw, matches, page: 0, status: 'ready' }
          : current
      ));
      setStatus(matches.length
        ? `Найдено применений для ${normalizedRaw}: ${matches.length}.`
        : `${normalizedRaw} не найден в ингредиентах рецептов.`);
      setLastApiStatus(t('values.ok'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logHotkeyDebug('uses lookup failed', { raw: normalizedRaw, error: message }, 'error');
      setRecipeUsesModal((current) => (
        current?.raw === normalizedRaw
          ? { raw: normalizedRaw, matches: [], page: 0, status: 'error', error: message }
          : current
      ));
      setStatus(`Не удалось найти применения для ${normalizedRaw}: ${message}`);
      setLastApiStatus(t('values.error'));
    }
  }

  function openRecipeFromUses(recipeToOpen: RecipeView) {
    applyRecipe(recipeToOpen, undefined, { rememberCurrent: true });
    setSimilarRecipes(null);
    setHeldItemRaw(null);
    setWorkspaceTab('editor');
    setRecipeUsesModal(null);
    setStatus(`Открыт рецепт ${recipeToOpen.output.raw} из ${recipeToOpen.source.path ?? 'Recipes'}.`);
    setLastParseResult(recipeToOpen.recipe_type);
  }

  function changeRecipeUsesPage(direction: -1 | 1) {
    setRecipeUsesModal((current) => {
      if (!current) return current;
      const pageCount = Math.max(1, current.matches.length);
      return { ...current, page: clamp(current.page + direction, 0, pageCount - 1) };
    });
  }

  function changeSimilarRecipe(direction: -1 | 1) {
    if (!similarRecipes) return;
    const nextIndex = clamp(similarRecipes.index + direction, 0, similarRecipes.matches.length - 1);
    if (nextIndex === similarRecipes.index) return;
    const nextRecipe = similarRecipes.matches[nextIndex];
    setSimilarRecipes({ ...similarRecipes, index: nextIndex });
    applyRecipe(nextRecipe);
    setHeldItemRaw(null);
    setWorkspaceTab('editor');
    setStatus(`Открыт похожий рецепт ${nextIndex + 1}/${similarRecipes.matches.length}: ${nextRecipe.output.raw} из ${nextRecipe.source.path ?? 'Recipes'}.`);
    setLastParseResult(nextRecipe.recipe_type);
    setLastApiStatus(t('values.ok'));
  }

  function restoreRecipeFromHistory(direction: -1 | 1) {
    if (direction === -1) {
      const previous = recipeBackHistory[recipeBackHistory.length - 1];
      if (!previous) return;
      setRecipeBackHistory((current) => current.slice(0, -1));
      setRecipeForwardHistory((current) => [createRecipeHistoryEntry(), ...current].slice(0, 40));
      applyRecipe(previous.recipe, previous.input);
      setSimilarRecipes(null);
      setWorkspaceTab('editor');
      setStatus(`Открыт предыдущий рецепт ${previous.recipe.output.raw}.`);
      setLastParseResult(previous.recipe.recipe_type);
      return;
    }
    const next = recipeForwardHistory[0];
    if (!next) return;
    setRecipeForwardHistory((current) => current.slice(1));
    setRecipeBackHistory((current) => [...current, createRecipeHistoryEntry()].slice(-40));
    applyRecipe(next.recipe, next.input);
    setSimilarRecipes(null);
    setWorkspaceTab('editor');
    setStatus(`Открыт следующий рецепт ${next.recipe.output.raw}.`);
    setLastParseResult(next.recipe.recipe_type);
  }

  function handleHeldItemOutsideMouseDown(event: MouseEvent<HTMLElement>) {
    if (neiContextMenu) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.nei-context-menu')) {
        setNeiContextMenu(null);
      }
    }
    if (touchItemInspection) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.mobile-item-inspection')) {
        setTouchItemInspection(null);
      }
    }
    if (draftTemplateContextMenu) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.draft-template-context-menu')) {
        setDraftTemplateContextMenu(null);
      }
    }
    if (cloudContextMenu) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.cloud-file-context-menu')) {
        setCloudContextMenu(null);
      }
    }
    if (!heldItemRaw || event.button !== 0) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }
    if (target.closest('.grid-cell, .nei-item, .draft-item-button, .craft-output-slot, .held-item-cursor')) {
      return;
    }
    setHeldItemRaw(null);
  }

  function handleHeldItemContextMenu(event: MouseEvent<HTMLElement>) {
    if (!heldItemRaw) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    logAppDebug('ui', 'held item cleared by right click', { raw: heldItemRaw }, 'info');
    setHeldItemRaw(null);
  }

  function getContextMenuStyle(x: number, y: number, options?: { width?: number; height?: number }): CSSProperties {
    const width = options?.width ?? 230;
    const height = options?.height ?? 178;
    const padding = 8;
    const viewportWidth = typeof window === 'undefined' ? width + padding * 2 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? height + padding * 2 : window.innerHeight;
    return {
      left: clamp(x, padding, Math.max(padding, viewportWidth - width - padding)),
      top: clamp(y, padding, Math.max(padding, viewportHeight - height - padding))
    };
  }

  function changeNeiPage(direction: -1 | 1) {
    setNeiPage((current) => clamp(current + direction, 0, neiPageCount - 1));
  }

  function changeDraftItemPage(direction: -1 | 1) {
    setDraftItemPage((current) => clamp(current + direction, 0, draftItemPageCount - 1));
  }

  function isParseableInput(value: string) {
    const trimmed = value.trim();
    return trimmed.includes('.addShaped') || trimmed.includes('.addShapeless') || (trimmed.startsWith('<') && trimmed.endsWith('>'));
  }

  function handleInputChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.target.value);
  }

  function handleInputPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = event.clipboardData.getData('text');
    setInput(pasted);
    event.preventDefault();
  }

  async function handleParse(value: string, options?: { syncInput?: boolean }) {
    const syncInput = options?.syncInput ?? true;
    const normalizedValue = value.trim();
    if (syncInput) {
      setInput(value);
    }
    lastRequestedParseRef.current = normalizedValue;
    setStatus(t('status.parsing'));
    setLastApiStatus(t('values.pending'));
    try {
      const result = await parseText(value);
      setBackendAvailable(true);
      setLastApiStatus(t('values.ok'));
      if (result.recipe) {
        applyRecipe(result.recipe, value);
        setSimilarRecipes(null);
        setStatus(t('status.loaded'));
        setLastParseResult(result.recipe.recipe_type);
        return;
      }
      if (result.item) {
        setStatus(`Item id: ${result.item.raw}`);
        setLastParseResult(result.item.raw);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      if (message.includes('Backend unavailable')) {
        setBackendAvailable(false);
        setStatus(message);
      } else {
        setStatus(`${t('status.parseError')}: ${message}`);
      }
      setLastApiStatus(t('values.error'));
      setLastParseResult(message);
    }
  }

  function removeTemplateOptions(): RemoveTemplateOption[] {
    return [...BUILTIN_REMOVE_TEMPLATES, ...customRemoveTemplates];
  }

  function removeTemplateKeyForRaw(raw: string): string {
    const parsed = parseItemRaw(raw);
    return parsed?.key ?? raw.trim().toLowerCase();
  }

  function activeRemoveTemplateId(): string {
    return removeTemplateSelection[removeTemplateKeyForRaw(outputRaw)] ?? 'none';
  }

  function activeRemoveTemplate(): string | null {
    const id = activeRemoveTemplateId();
    if (id === 'none') return null;
    return removeTemplateOptions().find((option) => option.id === id)?.template ?? BUILTIN_REMOVE_TEMPLATES[0].template;
  }

  function setActiveRemoveTemplateId(templateId: string) {
    const key = removeTemplateKeyForRaw(outputRaw);
    setRemoveTemplateSelection((current) => ({ ...current, [key]: templateId }));
    setRecipe((current) => ({ ...current, remove_template: templateId === 'none' ? null : removeTemplateOptions().find((option) => option.id === templateId)?.template ?? BUILTIN_REMOVE_TEMPLATES[0].template }));
    setSaveStatus(t('values.unsavedChanges'));
  }

  function addCustomRemoveTemplate() {
    const template = removeTemplateDraft.trim();
    if (!template.startsWith('recipes.remove')) {
      setStatus('Шаблон удаления должен начинаться с recipes.remove.');
      return;
    }
    const id = `custom-${stableHash(template)}-${Date.now().toString(36)}`;
    const label = template.length > 42 ? `${template.slice(0, 39)}...` : template;
    setCustomRemoveTemplates((current) => [{ id, label, template, builtin: false }, ...current].slice(0, 40));
    setActiveRemoveTemplateId(id);
    setRemoveTemplateDraft('recipes.remove({output_wildcard});');
  }

  function outputRawWithMeta(meta: string): string {
    const parsed = parseItemRaw(outputRaw);
    return parsed ? `<${parsed.key}:${meta}>` : outputRaw.trim();
  }

  function renderSourceMatrix(): string {
    const sourceMatrix = matrixForRecipeSource(matrix, recipe.recipe_type, recipeBindingMode);
    const rows = sourceMatrix
      .map((row, index) => `  [${row.map((cell) => cell?.trim() || 'null').join(', ')}]${index < sourceMatrix.length - 1 ? ',' : ''}`)
      .join('\n');
    return `[\n${rows}\n]`;
  }

  function renderRemoveTemplate(template: string | null | undefined): string {
    const normalized = (template ?? '').trim();
    if (!normalized || normalized === 'none') return '';
    const matrixSource = renderSourceMatrix();
    const ingredients = `[${matrix.flat().filter((cell): cell is string => Boolean(cell && cell !== 'null')).map((cell) => cell.trim()).join(', ')}]`;
    const rendered = normalized
      .replaceAll('{output_wildcard}', outputRawWithMeta('*'))
      .replaceAll('{output_meta0}', outputRawWithMeta('0'))
      .replaceAll('{output}', outputRaw.trim())
      .replaceAll('{matrix}', matrixSource)
      .replaceAll('{ingredients}', ingredients);
    return rendered.endsWith(';') ? rendered : `${rendered};`;
  }

  function buildRecipeSource(): string {
    const removeLine = renderRemoveTemplate(activeRemoveTemplate());
    if (recipe.recipe_type === 'ct_shapeless') {
      const ingredients = matrix.flat().filter((cell): cell is string => Boolean(cell && cell !== 'null'));
      const rendered = `recipes.addShapeless(${outputRaw.trim()}, [${ingredients.join(', ')}]);`;
      return `${removeLine ? `${removeLine}\n` : ''}${rendered}\n`;
    }
    const call = recipe.recipe_type === 'avaritia_extreme_shaped'
      ? 'mods.avaritia.ExtremeCrafting.addShaped'
      : 'recipes.addShaped';
    const rendered = `${call}(${outputRaw.trim()}, ${renderSourceMatrix()});`;
    return `${removeLine ? `${removeLine}\n` : ''}${rendered}\n`;
  }

  function getValidOutputRaw(): string | null {
    const normalized = outputRaw.trim();
    return normalized && parseItemRaw(normalized) ? normalized : null;
  }

  function requireOutputForSave(): string | null {
    const validOutput = getValidOutputRaw();
    if (validOutput) return validOutput;
    setStatus('Нельзя сохранить: у крафта нет корректного результата <mod:item>.');
    setSaveStatus(t('values.error'));
    return null;
  }

  function downloadTextFile(filename: string, text: string) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function currentRecipeFilename(): string {
    const sourceName = recipe.source.path?.split(/[\\/]/).pop();
    if (sourceName) return sourceName.endsWith('.zs') ? sourceName : `${sourceName}.zs`;
    const rawName = outputRaw.replace(/[<>:"/\\|?*\s]+/g, '_').replace(/^_+|_+$/g, '');
    return `${rawName || 'recipe'}.zs`;
  }

  function downloadCurrentRecipe() {
    if (!requireOutputForSave()) return;
    setIsLocalSaveModalOpen(true);
  }

  function findRecipeBlockInDraft(draft: UploadedDraft): RecipeBlockMatch | null {
    const activeKeys = new Set(recipeLookupKeysForRaw(outputRaw));
    return collectRecipeBlockMatches(draft.text).find((match) => collectRecipeOutputRaws(match.block).some((raw) => recipeLookupKeysForRaw(raw).some((key) => activeKeys.has(key)))) ?? null;
  }

  function updateUploadedDraftText(draftId: string, nextText: string) {
    setUploadedDrafts((current) => current.map((draft) => draft.id === draftId
      ? { ...draft, text: nextText.slice(0, LOCAL_DRAFT_MAX_UPLOADED_TEXT), size: nextText.length, lastModified: Date.now() }
      : draft));
  }

  function executeLocalSave(mode: LocalSaveMode) {
    if (!requireOutputForSave()) return;
    const source = buildRecipeSource();
    if (mode === 'download') {
      downloadTextFile(currentRecipeFilename(), source);
      setStatus('Рецепт скачан.');
      setIsLocalSaveModalOpen(false);
      return;
    }
    const draft = getActiveUploadedDraft();
    if (!draft) {
      setStatus('Нет загруженного локального .zs файла.');
      return;
    }
    if (mode === 'append-uploaded') {
      const separator = draft.text.trim() ? (draft.text.endsWith('\n') ? '\n' : '\n\n') : '';
      const nextText = `${draft.text}${separator}${source}`;
      updateUploadedDraftText(draft.id, nextText);
      setInput(source);
      setStatus(`Рецепт добавлен в ${draft.name}.`);
      setIsLocalSaveModalOpen(false);
      return;
    }
    const match = findRecipeBlockInDraft(draft);
    if (!match) {
      setStatus(`В ${draft.name} не найден блок для ${outputRaw}.`);
      return;
    }
    const nextText = `${draft.text.slice(0, match.start)}${source.trim()}${draft.text.slice(match.end)}`;
    updateUploadedDraftText(draft.id, nextText);
    setInput(source);
    setStatus(`Рецепт заменен в ${draft.name}.`);
    setIsLocalSaveModalOpen(false);
  }

  function openCloudSaveModal() {
    if (!requireOutputForSave()) return;
    setCloudSaveNameDraft(buildDefaultCloudRecipeFilename(recipe.source.path, outputRaw));
    setCloudSaveError('');
    setIsCloudSaveModalOpen(true);
  }

  function setUploadedDraftSelection(draftId: string, selected: boolean) {
    setSelectedUploadedDraftIds((current) => {
      if (selected) {
        return { ...current, [draftId]: true };
      }
      if (!current[draftId]) return current;
      const next = { ...current };
      delete next[draftId];
      return next;
    });
  }

  function setAllUploadedDraftsSelected(selected: boolean) {
    if (!selected) {
      setSelectedUploadedDraftIds({});
      return;
    }
    setSelectedUploadedDraftIds(Object.fromEntries(uploadedDrafts.map((draft) => [draft.id, true])));
  }

  function downloadUploadedDrafts(drafts: UploadedDraft[]) {
    if (!drafts.length) return;
    drafts.forEach((draft) => downloadTextFile(draft.name, draft.text));
    setStatus(`Скачано файлов: ${drafts.length}`);
  }

  function chooseCloudUploadConflict(filename: string): Promise<CloudUploadConflictMode> {
    return new Promise((resolve) => {
      setCloudUploadConflict({ filename, resolve });
    });
  }

  function resolveCloudUploadConflict(mode: CloudUploadConflictMode) {
    const resolver = cloudUploadConflict?.resolve;
    setCloudUploadConflict(null);
    resolver?.(mode);
  }

  function getActiveUploadedDraft(): UploadedDraft | null {
    return uploadedDrafts.find((draft) => draft.id === selectedDraftId) ?? uploadedDrafts[0] ?? null;
  }

  function getDraftsForFileAction(): UploadedDraft[] {
    const selected = uploadedDrafts.filter((draft) => selectedUploadedDraftIds[draft.id]);
    if (selected.length) return selected;
    const active = getActiveUploadedDraft();
    return active ? [active] : [];
  }

  function downloadActiveUploadedDraft() {
    const draft = getActiveUploadedDraft();
    if (!draft) return;
    downloadUploadedDrafts([draft]);
  }

  async function uploadDraftsToCloud(drafts: UploadedDraft[]) {
    if (!drafts.length || !canManageCloudFiles) return;
    let uploadedCount = 0;
    let cancelledCount = 0;
    setStatus(`Выгружаю файлы в облако: ${drafts.length}`);
    for (const draft of drafts) {
      try {
        const payload = await uploadZsCloudFile(draft.name, draft.text, 'fail');
        setCloudFiles(payload.files);
        uploadedCount += 1;
      } catch (error) {
        if (!(error instanceof ApiConflictError)) {
          setStatus(error instanceof Error ? error.message : String(error));
          return;
        }
        const mode = await chooseCloudUploadConflict(draft.name);
        if (mode === 'cancel') {
          cancelledCount += 1;
          continue;
        }
        try {
          const payload = await uploadZsCloudFile(draft.name, draft.text, mode);
          setCloudFiles(payload.files);
          uploadedCount += 1;
        } catch (retryError) {
          setStatus(retryError instanceof Error ? retryError.message : String(retryError));
          return;
        }
      }
    }
    setStatus(`В облако выгружено: ${uploadedCount}${cancelledCount ? `. Отменено: ${cancelledCount}` : ''}`);
    if (canManageCloudFiles) {
      void refreshCloudFiles();
    }
  }

  function deleteUploadedDrafts(drafts: UploadedDraft[]) {
    if (!drafts.length) return;
    const draftIds = new Set(drafts.map((draft) => draft.id));
    setUploadedDrafts((current) => current.filter((draft) => !draftIds.has(draft.id)));
    setSelectedUploadedDraftIds((current) => {
      const next = { ...current };
      draftIds.forEach((draftId) => delete next[draftId]);
      return next;
    });
    setSelectedDraftId((current) => current && draftIds.has(current) ? null : current);
    setStatus(`Удалено файлов: ${drafts.length}`);
  }

  async function importRecipeFiles(files: FileList | File[]) {
    const fileArray = Array.from(files).filter((file) => file.name.endsWith('.zs') || file.type.startsWith('text/') || !file.type);
    if (!fileArray.length) {
      setStatus('Выберите .zs или текстовые файлы рецептов.');
      return;
    }
    const drafts: UploadedDraft[] = [];
    for (const file of fileArray) {
      const text = await file.text();
      drafts.push({
        id: `${file.name}:${file.lastModified}:${file.size}`,
        name: file.name,
        size: file.size,
        text,
        lastModified: file.lastModified
      });
    }
    setUploadedDrafts((current) => {
      const nextById = new Map(current.map((draft) => [draft.id, draft]));
      drafts.forEach((draft) => nextById.set(draft.id, draft));
      return Array.from(nextById.values());
    });
    setSelectedDraftId(drafts[0].id);
    await handleParse(drafts[0].text);
    setStatus(`Загружено файлов: ${drafts.length}`);
  }

  useEffect(() => {
    const trimmed = input.trim();
    if (!trimmed) {
      lastRequestedParseRef.current = '';
      if (autoParseTimerRef.current !== null) {
        window.clearTimeout(autoParseTimerRef.current);
        autoParseTimerRef.current = null;
      }
      return;
    }
    if (!isParseableInput(trimmed) || trimmed === lastRequestedParseRef.current) {
      return;
    }
    if (autoParseTimerRef.current !== null) {
      window.clearTimeout(autoParseTimerRef.current);
    }
    autoParseTimerRef.current = window.setTimeout(() => {
      void handleParse(trimmed, { syncInput: false });
    }, 250);
    return () => {
      if (autoParseTimerRef.current !== null) {
        window.clearTimeout(autoParseTimerRef.current);
        autoParseTimerRef.current = null;
      }
    };
  }, [input]);

  async function handlePasteFromClipboard() {
    try {
      await handleParse(await navigator.clipboard.readText());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Clipboard unavailable';
      if (message.includes('Backend unavailable')) {
        setBackendAvailable(false);
      }
      setStatus(message);
      setLastApiStatus(t('values.error'));
    }
  }

  function openCraftEditorModal(target: CraftEditorTarget) {
    setCraftEditorTarget(target);
    const raw = getCellRaw(target);
    const parsed = parseRawForEditor(raw);
    setItemModDraft(parsed.modid);
    setItemNameDraft(parsed.item);
    setItemMetaDraft(String(parsed.meta));
    setNbtRootDraft(parsed.nbtRoot);
    setCollapsedNbtPaths({});
    setCraftSourceDraft(raw);
    setCraftSourceMode('structured');
    setItemSearchQuery('');
    setIsCraftEditorOpen(true);
  }

  async function handleCraftModalPaste() {
    try {
      const pasted = await navigator.clipboard.readText();
      setCraftSourceDraft(pasted);
      setCraftSourceMode('raw');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Clipboard unavailable';
      setStatus(message);
    }
  }

  async function handleCraftModalCopy() {
    const payload = craftSourceDraft || getCellRaw(craftEditorTarget);
    await navigator.clipboard.writeText(payload);
    setStatus('Скопировано значение предмета.');
  }

  async function handleCellCopy(row: number, col: number) {
    const value = matrix[row]?.[col];
    const payload = value ?? '';
    await navigator.clipboard.writeText(payload);
    setStatus(`Ячейка ${row + 1},${col + 1}: значение скопировано.`);
  }

  async function handleCellPaste(row: number, col: number) {
    try {
      const pasted = (await navigator.clipboard.readText()).trim();
      setMatrixCell(row, col, pasted || null);
      setStatus(`Ячейка ${row + 1},${col + 1}: значение вставлено.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Clipboard unavailable';
      setStatus(message);
    }
  }

  function handleCellClear(row: number, col: number) {
    setMatrixCell(row, col, null);
    setStatus(`Ячейка ${row + 1},${col + 1}: значение очищено.`);
  }

  async function handleSave() {
    if (!requireOutputForSave()) return;
    if (recipe.source.kind === 'generated' || recipe.recipe_uid === 'new-recipe') {
      setStatus('Сохранение недоступно: используйте «Сохранить как».');
      return;
    }
    setStatus('Сохраняем...');
    setSaveStatus(t('values.pending'));
    try {
      const updated = await updateRecipe({ recipeUid: recipe.recipe_uid, recipeType: recipe.recipe_type, outputRaw, matrix, name: recipe.name, bindingMode: recipeBindingMode, removeTemplate: activeRemoveTemplate() });
      applyRecipe(updated.updatedRecipe, input);
      setStatus(t('status.saved'));
      setSaveStatus(t('values.saved'));
      setLastApiStatus(t('values.ok'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`${t('status.saveError')}: ${message}`);
      setSaveStatus(t('values.error'));
      setLastApiStatus(t('values.error'));
    }
  }

  async function handleSaveAs() {
    if (!requireOutputForSave()) return;
    openCloudSaveModal();
  }

  async function submitCloudSave() {
    if (!requireOutputForSave()) return;
    const validation = validateCloudRecipeFilename(cloudSaveNameDraft);
    if (validation.error || !validation.filename) {
      setCloudSaveError(validation.error ?? 'Введите корректное имя .zs файла.');
      return;
    }
    const targetPath = validation.filename;
    setIsCloudSaveModalOpen(false);
    setCloudSaveError('');
    setStatus('Сохраняем как...');
    setSaveStatus(t('values.pending'));
    try {
      if (recipe.recipe_uid === 'new-recipe') {
        const created = await createRecipeTemplate({ templateType: recipe.recipe_type, output: outputRaw, grid: matrix.length, bindingMode: recipeBindingMode });
        const response = await saveRecipeAs({ recipeUid: created.recipe_uid, recipeType: created.recipe_type, outputRaw, matrix, name: created.name, targetPath, bindingMode: recipeBindingMode, removeTemplate: activeRemoveTemplate() });
        applyRecipe(response.recipe, input);
      } else {
        const response = await saveRecipeAs({ recipeUid: recipe.recipe_uid, recipeType: recipe.recipe_type, outputRaw, matrix, name: recipe.name, targetPath, bindingMode: recipeBindingMode, removeTemplate: activeRemoveTemplate() });
        applyRecipe(response.recipe, input);
      }
      setStatus(`${t('status.saved')} → ${targetPath}`);
      setSaveStatus(t('values.saved'));
      if (canManageCloudFiles) {
        void refreshCloudFiles();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`${t('status.saveError')}: ${message}`);
      setSaveStatus(t('values.error'));
      setIsCloudSaveModalOpen(true);
    }
  }

  async function executeConflictSaveOverwrite(match: RecipeView) {
    if (!requireOutputForSave()) return;
    const filePath = match.source.path || 'Неизвестный файл';
    const fileName = filePath.split(/[\\/]/).pop() || filePath;
    setStatus(`Перезаписываем рецепт в ${fileName}...`);
    setSaveStatus(t('values.pending'));
    setIsSaveConflictModalOpen(false);
    try {
      const updated = await updateRecipe({
        recipeUid: match.recipe_uid,
        recipeType: recipe.recipe_type,
        outputRaw,
        matrix,
        name: recipe.name,
        bindingMode: recipeBindingMode,
        removeTemplate: activeRemoveTemplate()
      });
      applyRecipe(updated.updatedRecipe, input);
      setStatus(`Рецепт успешно перезаписан в ${fileName}`);
      setSaveStatus(t('values.saved'));
      setLastApiStatus(t('values.ok'));
      if (canManageCloudFiles) {
        void refreshCloudFiles();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Ошибка при перезаписи рецепта: ${message}`);
      setSaveStatus(t('values.error'));
      setLastApiStatus(t('values.error'));
      setIsSaveConflictModalOpen(true);
    }
  }

  async function executeConflictSaveAdditional(filePath: string) {
    if (!requireOutputForSave()) return;
    const fileName = filePath.split(/[\\/]/).pop() || filePath;
    setStatus(`Добавляем рецепт как дополнительный в ${fileName}...`);
    setSaveStatus(t('values.pending'));
    setIsSaveConflictModalOpen(false);
    try {
      let uidToUse = recipe.recipe_uid;
      let typeToUse = recipe.recipe_type;
      let nameToUse = recipe.name;
      if (recipe.recipe_uid === 'new-recipe') {
        const created = await createRecipeTemplate({
          templateType: recipe.recipe_type,
          output: outputRaw,
          grid: matrix.length,
          bindingMode: recipeBindingMode
        });
        uidToUse = created.recipe_uid;
        typeToUse = created.recipe_type;
        nameToUse = created.name;
      }
      const response = await saveRecipeAs({
        recipeUid: uidToUse,
        recipeType: typeToUse,
        outputRaw,
        matrix,
        name: nameToUse,
        targetPath: fileName,
        bindingMode: recipeBindingMode,
        removeTemplate: activeRemoveTemplate()
      });
      applyRecipe(response.recipe, input);
      setStatus(`Рецепт успешно добавлен в ${fileName}`);
      setSaveStatus(t('values.saved'));
      if (canManageCloudFiles) {
        void refreshCloudFiles();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Ошибка при добавлении рецепта: ${message}`);
      setSaveStatus(t('values.error'));
      setIsSaveConflictModalOpen(true);
    }
  }

  async function handleSaveToCloud() {
    const validOutput = requireOutputForSave();
    if (!validOutput) return;
    setStatus('Поиск существующих рецептов...');
    try {
      const { matches } = await searchRecipesByOutput(validOutput);
      if (matches.length > 0) {
        setSaveConflictMatches(matches);
        setIsSaveConflictModalOpen(true);
        setStatus('Найдены существующие рецепты.');
      } else {
        await handleSaveAs();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Не удалось выполнить поиск рецептов: ${message}`);
      if (recipe.source.kind === 'generated' || recipe.recipe_uid === 'new-recipe') {
        await handleSaveAs();
      } else {
        await handleSave();
      }
    }
  }

  async function handleSaveDraftTemplate() {
    const validOutput = requireOutputForSave();
    if (!validOutput) return;
    const sourceText = buildRecipeSource();
    const now = Date.now();
    const draftRecipe: RecipeView = {
      ...recipe,
      recipe_uid: `local-draft-${stableHash(`${authUser.email}:${sourceText}:${now}`)}`,
      binding_mode: recipeBindingMode,
      output: { raw: validOutput },
      remove_template: activeRemoveTemplate(),
      source: { kind: 'local_draft', path: `draft:${validOutput}` },
      matrix: matrixWithResolution,
      grid_h: matrix.length,
      grid_w: maxGridWidth(matrix)
    };
    const name = `${resolveCellTitle(validOutput) || validOutput} #${recipeDraftTemplates.length + 1}`;
    try {
      const saved = await saveRecipeDraftTemplate({
        outputRaw: validOutput,
        recipe: draftRecipe,
        sourceText,
        name
      });
      setRecipeDraftTemplates((current) => [saved.template, ...current.filter((item) => item.id !== saved.template.id)].slice(0, RECIPE_DRAFT_MAX_TEMPLATES));
      setSelectedDraftItemRaw(validOutput);
      setStatus(`Шаблон сохранён в черновики: ${validOutput}`);
      setSaveStatus(t('values.saved'));
    } catch (error) {
      const draft: RecipeDraftTemplate = {
        id: `${now.toString(36)}-${stableHash(`${authUser.email}:${validOutput}:${sourceText}`)}`,
        outputRaw: validOutput,
        recipe: draftRecipe,
        sourceText,
        createdByEmail: authUser.email,
        createdAt: now,
        updatedAt: now,
        name
      };
      setRecipeDraftTemplates((current) => [draft, ...current].slice(0, RECIPE_DRAFT_MAX_TEMPLATES));
      setSelectedDraftItemRaw(validOutput);
      setStatus(`Шаблон сохранён локально: ${validOutput}`);
      logFrontendEvent({
        level: 'WARN',
        category: 'RECIPE_DRAFTS',
        message: 'Recipe draft template saved locally after backend failure',
        details: { error: error instanceof Error ? error.message : String(error) }
      });
    }
  }

  function openRecipeDraftTemplate(draft: RecipeDraftTemplate) {
    applyRecipe(draft.recipe, draft.sourceText, { rememberCurrent: true });
    setWorkspaceTab('editor');
    setHeldItemRaw(null);
    setDraftTemplateContextMenu(null);
    setStatus(`Открыт шаблон ${draft.outputRaw} из черновиков.`);
    setLastParseResult(draft.recipe.recipe_type);
  }

  async function removeRecipeDraftTemplate(draftId: string) {
    const draft = recipeDraftTemplates.find((item) => item.id === draftId);
    try {
      await deleteRecipeDraftTemplate(draftId);
      setRecipeDraftTemplates((current) => current.filter((item) => item.id !== draftId));
      setDraftTemplateContextMenu(null);
      setStatus(draft ? `Шаблон удалён: ${draft.outputRaw}` : 'Шаблон удалён.');
    } catch (error) {
      setDraftTemplateContextMenu(null);
      setStatus(error instanceof Error ? `Ошибка удаления шаблона: ${error.message}` : 'Ошибка удаления шаблона.');
    }
  }

  function resetLayout() {
    persistUiPreferences({ ...defaultUiPreferences, language: uiPreferences.language, display_mode: uiPreferences.display_mode, animations_enabled: uiPreferences.animations_enabled, density_mode: uiPreferences.density_mode, editor_mode: uiPreferences.editor_mode, theme_mode: uiPreferences.theme_mode, ui_scale: uiPreferences.ui_scale });
  }

  function setPanelVisible(panelId: PanelId, visible: boolean) {
    patchPanelLayout(latestUiPreferencesRef.current.panel_layout.map((panel) => panel.id === panelId ? { ...panel, visible } : panel));
  }

  const statusItems = [
    { label: t('status.status'), value: status, tone: status.includes('Ошибка') || status.includes('error') ? 'warning' as const : 'success' as const },
    { label: t('status.type'), value: recipe.recipe_type },
    { label: t('status.size'), value: summary },
    { label: t('status.saveState'), value: saveStatus },
    { label: t('status.icons'), value: `${iconsResolved}/${iconTotal}` },
    { label: t('status.mode'), value: `${uiPreferences.display_mode} ? ${uiPreferences.language}` }
  ];

  function getPanelForTab(panelId: PanelId): PanelLayoutItem {
    return { ...(uiPreferences.panel_layout.find((panel) => panel.id === panelId) ?? defaultPanelLayout.find((panel) => panel.id === panelId)!), visible: true };
  }

  function renderColumn(panels: PanelLayoutItem[], className: string) {
    return (
      <div className={`workspace-column ${className}`.trim()}>
        {panels.map((panel) => renderPanel(panel))}
      </div>
    );
  }

  function renderCraftItemIcon(raw: string, iconUrl?: string | null, animated?: boolean, frameTime?: number, title?: string) {
    const modIconStyle = buildModIconStyle(modIconManifest, getModIconEntryForRaw(raw));
    if (modIconStyle) {
      return <span className="cell-atlas-icon output-atlas-icon" style={modIconStyle} aria-hidden="true" />;
    }
    const atlasEntry = resolveAtlasEntryFromRaw(itemPanelAtlas, raw, wildcardCycleTick);
    const atlasStyle = itemPanelAtlas && atlasEntry ? buildAtlasIconStyle(itemPanelAtlas, atlasEntry) : undefined;
    if (atlasStyle) {
      return <span className="cell-atlas-icon output-atlas-icon" style={atlasStyle} aria-hidden="true" />;
    }
    if (iconUrl) {
      return <AnimatedIcon iconUrl={iconUrl} alt={title ?? raw} animated={Boolean(animated)} frameTime={frameTime ?? 1} animationsEnabled={areAnimationsEnabled} />;
    }
    return <span>?</span>;
  }

  function renderHeldItemIcon(raw: string) {
    const modIconStyle = buildModIconStyle(modIconManifest, getModIconEntryForRaw(raw));
    if (modIconStyle) {
      return <span className="held-atlas-icon" style={modIconStyle} aria-hidden="true" />;
    }
    const atlasEntry = resolveAtlasEntryFromRaw(itemPanelAtlas, raw, wildcardCycleTick);
    const atlasStyle = itemPanelAtlas && atlasEntry ? buildAtlasIconStyle(itemPanelAtlas, atlasEntry) : undefined;
    const iconUrl = itemSearchIcons[raw];
    if (atlasStyle) {
      return <span className="held-atlas-icon" style={atlasStyle} aria-hidden="true" />;
    }
    if (iconUrl) {
      return <img src={iconUrl} alt="" />;
    }
    return <span>?</span>;
  }

  function getModIconEntryForRaw(raw: string): ModIconAtlasEntry | undefined {
    const direct = modIconByRaw.get(raw);
    if (direct) return direct;
    const parsed = parseItemRaw(raw);
    if (!parsed) return undefined;
    const exactRaw = `<${parsed.key}${parsed.meta !== null && parsed.meta > 0 ? `:${parsed.meta}` : ''}>`;
    return modIconByRaw.get(exactRaw)
      ?? modIconByRaw.get(`<${parsed.key}>`)
      ?? modIconByRaw.get(`<${parsed.key}:0>`);
  }

  function resolveRecipeGridIconStyle(raw: string): CSSProperties | undefined {
    return buildModIconStyle(modIconManifest, getModIconEntryForRaw(raw));
  }

  function renderRecipeBuilderPanel() {
    const gridSize = matrix.length;
    const canSaveActions = Boolean(getValidOutputRaw()) && (canCreateTemplates || canEditRecipes);
    const heldItemTitle = heldItemRaw ? resolveCellTitle(heldItemRaw) : null;
    const craftGridOptions = [
      { value: 2, symbol: '2', label: '2x2' },
      { value: 3, symbol: '3', label: '3x3' },
      { value: 9, symbol: '9', label: '9x9' }
    ];
    const craftModeOptions: Array<{ value: RecipeCraftMode; symbol: string; label: string; disabled?: boolean }> = [
      { value: 'shaped', symbol: '■', label: 'Форменный' },
      { value: 'shapeless', symbol: '◇', label: 'Бесформенный', disabled: gridSize === 9 }
    ];
    const craftBindingOptions: Array<{ value: RecipeBindingMode; symbol: string; label: string; disabled?: boolean }> = [
      { value: 'soft', symbol: '↔', label: 'Свободная', disabled: recipe.recipe_type === 'ct_shapeless' },
      { value: 'strict', symbol: '⊙', label: 'Точная', disabled: recipe.recipe_type === 'ct_shapeless' }
    ];
    const craftStatusSymbols = [
      { key: 'grid', symbol: String(gridSize), active: true },
      { key: 'mode', symbol: recipeCraftMode === 'shaped' ? '■' : '◇', active: true },
      { key: 'binding', symbol: recipe.recipe_type === 'ct_shapeless' ? '×' : recipeBindingMode === 'strict' ? '⊙' : '↔', active: recipe.recipe_type !== 'ct_shapeless' }
    ];
    return (
      <div className="workspace-panel-shell panel-recipe-builder">
        <Panel
          title="Создать рецепт"
          subtitle="Сетка, входные предметы и результат"
          className="recipe-builder-panel"
          actions={(
            <div className="recipe-panel-actions">
              <div className="history-nav" aria-label="recipe-history-navigation">
                <button type="button" className="ghost-button history-button" aria-label="recipe-history-back" title="История назад" disabled={!recipeBackHistory.length} onClick={() => restoreRecipeFromHistory(-1)}>← История назад</button>
                <span className="history-status">История: назад {recipeBackHistory.length}, вперед {recipeForwardHistory.length}</span>
                <button type="button" className="ghost-button history-button" aria-label="recipe-history-forward" title="История вперед" disabled={!recipeForwardHistory.length} onClick={() => restoreRecipeFromHistory(1)}>История вперед →</button>
              </div>
              <details className="recipe-actions-menu" data-close-on-select>
                <summary>Действия</summary>
                <div className="recipe-actions-popover">
                  <button type="button" className="secondary-button" aria-label="save-local" disabled={!canSaveActions} onClick={downloadCurrentRecipe}>Сохранить локально</button>
                  <button type="button" aria-label="save-cloud" disabled={!canSaveActions} onClick={() => void handleSaveToCloud()}>Сохранить в облако</button>
                  <button type="button" className="secondary-button" aria-label="save-draft-template" disabled={!canSaveActions} onClick={() => void handleSaveDraftTemplate()}>Сохранить в черновик</button>
                  <button type="button" className="ghost-button" disabled={!canCreateTemplates && !canEditRecipes} onClick={clearEditor}>Очистить</button>
                </div>
              </details>
            </div>
          )}
        >
          <div className="recipe-builder-controls">
            <label className="field-block">
              <span>Размер сетки</span>
              <select aria-label="recipe-grid-size" value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))}>
                {[2, 3, 9].map((size) => <option key={size} value={size}>{size}x{size}</option>)}
              </select>
            </label>
            <label className="field-block">
              <span>Тип рецепта</span>
              <select aria-label="recipe-craft-mode" value={recipeCraftMode} onChange={(event) => setRecipeCraftMode(event.target.value as RecipeCraftMode)}>
                <option value="shaped">Форменный</option>
                <option value="shapeless" disabled={gridSize === 9}>Бесформенный</option>
              </select>
            </label>
            <label className="field-block">
              <span>Позиция</span>
              <select aria-label="recipe-binding-mode" value={recipeBindingMode} disabled={recipe.recipe_type === 'ct_shapeless'} onChange={(event) => setRecipeBindingMode(event.target.value as RecipeBindingMode)}>
                <option value="soft">Свободная</option>
                <option value="strict">Точная</option>
              </select>
            </label>
          </div>

          <div className="grid-meta"><span>{t('status.size')}</span><strong>{summary}</strong><span>{t('fields.parsedCells')}</span><strong>{filledCells}</strong><span>{t('fields.nullCells')}</span><strong>{nullCells}</strong></div>
          {heldItemRaw ? (
            <div className="touch-held-item-bar" aria-label="touch-held-item">
              <span className="touch-held-item-icon" aria-hidden="true">
                {renderHeldItemIcon(heldItemRaw)}
              </span>
              <span className="touch-held-item-text">
                <strong>{heldItemTitle ?? heldItemRaw}</strong>
                <code>{heldItemRaw}</code>
              </span>
              <button
                type="button"
                className="ghost-button touch-held-item-clear"
                aria-label="clear-held-item"
                onClick={() => setHeldItemRaw(null)}
              >
                x
              </button>
            </div>
          ) : null}
          <div className="grid-scroll-zone recipe-builder-grid">
            <div className="recipe-craft-board">
              <details className="craft-board-menu" data-close-on-select>
                <summary aria-label="craft-board-menu">
                  <span aria-hidden="true">...</span>
                  <span className="craft-board-menu-state" aria-hidden="true">
                    {craftStatusSymbols.map((item) => (
                      <span key={item.key} className={`craft-state-symbol ${item.active ? 'is-active' : 'is-inactive'}`}>{item.symbol}</span>
                    ))}
                  </span>
                </summary>
                <div className="craft-board-menu-popover">
                  <div className="craft-board-settings" aria-label="craft-board-settings">
                    <div className="craft-board-setting-group">
                      <span className="craft-board-setting-title">Размер сетки</span>
                      <div className="craft-board-setting-options">
                        {craftGridOptions.map((option) => {
                          const active = gridSize === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={`craft-setting-option ${active ? 'is-active' : 'is-inactive'}`}
                              aria-label={`craft-grid-${option.value}`}
                              data-keep-menu-open
                              onClick={() => setGridSize(option.value)}
                            >
                              <span className="craft-setting-symbol">{option.symbol}</span>
                              <span>{option.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="craft-board-setting-group">
                      <span className="craft-board-setting-title">Тип рецепта</span>
                      <div className="craft-board-setting-options">
                        {craftModeOptions.map((option) => {
                          const active = recipeCraftMode === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={`craft-setting-option ${active ? 'is-active' : 'is-inactive'}`}
                              aria-label={`craft-mode-${option.value}`}
                              disabled={option.disabled}
                              data-keep-menu-open
                              onClick={() => setRecipeCraftMode(option.value)}
                            >
                              <span className="craft-setting-symbol">{option.symbol}</span>
                              <span>{option.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="craft-board-setting-group">
                      <span className="craft-board-setting-title">Позиция</span>
                      <div className="craft-board-setting-options">
                        {craftBindingOptions.map((option) => {
                          const active = recipeBindingMode === option.value && recipe.recipe_type !== 'ct_shapeless';
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={`craft-setting-option ${active ? 'is-active' : 'is-inactive'}`}
                              aria-label={`craft-binding-${option.value}`}
                              disabled={option.disabled}
                              data-keep-menu-open
                              onClick={() => setRecipeBindingMode(option.value)}
                            >
                              <span className="craft-setting-symbol">{option.symbol}</span>
                              <span>{option.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => openCraftEditorModal({ kind: 'output' })} disabled={!canCreateTemplates && !canEditRecipes}>Детальные настройки output</button>
                  <button type="button" className="secondary-button" aria-label="copy-craft-body" onClick={copyCurrentCraftBody}>Скопировать текущее тело крафта</button>
                  <button type="button" aria-label="paste-craft-body" disabled={!craftBodyTemplate || (!canCreateTemplates && !canEditRecipes)} onClick={pasteCraftBody}>Вставить тело крафта</button>
                </div>
              </details>
              <RecipeGrid
                matrix={matrixWithResolution}
                atlas={itemPanelAtlas}
                atlasImageUrl={itemPanelAtlas ? normalizeAtlasImageUrl(itemPanelAtlas.image_url) : ''}
                displayMode={uiPreferences.display_mode}
                animationsEnabled={areAnimationsEnabled}
                editorMode={(canCreateTemplates || canEditRecipes) ? uiPreferences.editor_mode : 'view'}
                extremeGroupGap={uiPreferences.workspace_layout.extreme_grid_gap ?? 8}
                heldItemRaw={heldItemRaw}
                tooltipsDisabled={isLayoutSettingsOpen || isCraftEditorOpen || isNbtEditorOpen || Boolean(customItemForm)}
                resolveCellTitle={resolveCellTitle}
                resolveIconStyle={resolveRecipeGridIconStyle}
                renderItemTooltip={renderItemTooltip}
                onItemHover={updateHoveredItemRaw}
                onCellClick={handleCraftCellClick}
                onCellContextMenu={handleCraftCellContextMenu}
                onCellDrop={(row, col, value) => handleRecipeItemDrop({ kind: 'cell', row, col }, value)}
                onCellChange={(row, col, value) => {
                  setMatrixCell(row, col, value);
                }}
              />
              <div className="craft-arrow" aria-hidden="true" />
              <button
                type="button"
                className="output-icon-slot output-icon-button craft-output-slot"
                data-item-raw={outputRaw || undefined}
                aria-label="craft-output-slot"
                aria-disabled={!canCreateTemplates && !canEditRecipes}
                onMouseEnter={() => updateHoveredItemRaw(outputRaw || null)}
                onMouseLeave={() => updateHoveredItemRaw((current) => (current === outputRaw ? null : current))}
                onFocus={() => updateHoveredItemRaw(outputRaw || null)}
                onBlur={() => updateHoveredItemRaw((current) => (current === outputRaw ? null : current))}
                onClick={() => {
                  if (!canCreateTemplates && !canEditRecipes) return;
                  handleCraftOutputClick();
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  if (!canCreateTemplates && !canEditRecipes) return;
                  if (event.ctrlKey && outputRaw) {
                    openCustomItemEditor(outputRaw, 'user', 'local', { kind: 'output' });
                    return;
                  }
                  setCellRaw({ kind: 'output' }, '');
                }}
                onDragOver={(event) => {
                  if (canCreateTemplates || canEditRecipes) {
                    event.preventDefault();
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!canCreateTemplates && !canEditRecipes) return;
                  handleRecipeItemDrop({ kind: 'output' }, event.dataTransfer.getData('text/plain'));
                }}
              >
                {renderCraftItemIcon(outputRaw, recipe.output_resolution?.icon_url, recipe.output_resolution?.animated, recipe.output_resolution?.animation_meta?.frametime, outputDisplayName ?? outputRaw)}
                {outputRaw ? renderItemTooltip(outputRaw) : null}
              </button>
              <div className="craft-recipe-nav" aria-label="craft-recipe-navigation">
                <button
                  type="button"
                  className="craft-nav-arrow"
                  aria-label="similar-recipe-prev"
                  disabled={!similarRecipes || similarRecipes.matches.length <= 1 || similarRecipes.index <= 0}
                  onClick={() => changeSimilarRecipe(-1)}
                >{'<'}</button>
                <span className="craft-nav-counter">
                  {similarRecipes ? `${similarRecipes.index + 1}/${similarRecipes.matches.length}` : '1/1'}
                </span>
                <button
                  type="button"
                  className="craft-nav-arrow"
                  aria-label="similar-recipe-next"
                  disabled={!similarRecipes || similarRecipes.matches.length <= 1 || similarRecipes.index >= similarRecipes.matches.length - 1}
                  onClick={() => changeSimilarRecipe(1)}
                >{'>'}</button>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  function getRecipeAvailability(raw: string): 'available' | 'missing' | 'unknown' {
    const keys = recipeLookupKeysForRaw(raw);
    if (keys.some((key) => uploadedDraftOutputKeys.has(key))) {
      return 'available';
    }
    const knownValues = keys.map((key) => recipeAvailability[key]).filter((value) => value !== undefined);
    if (knownValues.some((value) => value === true)) return 'available';
    if (knownValues.some((value) => value === false)) return 'missing';
    return 'unknown';
  }

  function rawWithoutNbt(raw: string): string {
    return raw.replace(/\.withTag\([\s\S]*\)\s*$/, '').trim();
  }

  function getItemPanelModName(raw: string, fallbackKey: string): string {
    const parsed = parseItemRaw(rawWithoutNbt(raw));
    return (parsed?.key ?? fallbackKey).split(':')[0] || 'unknown';
  }

  function findItemPanelEntryForRaw(raw: string): ItemPanelEntry | null {
    const direct = itemPanelEntryByRaw.get(raw);
    if (direct) return direct;
    const parsed = parseItemRaw(rawWithoutNbt(raw));
    if (!parsed) return null;
    const metaMap = itemPanelTranslations.byKeyMeta.get(parsed.key);
    if (parsed.meta !== null) {
      const exact = metaMap?.get(parsed.meta);
      if (exact) return exact;
    }
    if (metaMap?.size) {
      const firstMeta = [...metaMap.keys()].sort((left, right) => left - right)[0];
      return metaMap.get(firstMeta) ?? null;
    }
    return itemPanelTranslations.entries.find((entry) => entry.key === parsed.key) ?? null;
  }

  function renderItemTooltip(raw: string, entryOverride?: ItemPanelEntry | null) {
    const entry = entryOverride ?? findItemPanelEntryForRaw(raw);
    const title = entry?.displayRu || entry?.displayEn || resolveCellTitle(raw).replace(/\*$/, '') || raw;
    const itemIdLabel = entry?.legacyId != null ? `${entry.legacyId}:${entry.meta}` : rawWithoutNbt(raw);
    const modName = getItemPanelModName(raw, entry?.key ?? rawWithoutNbt(raw));
    const hasRecipe = getRecipeAvailability(raw) === 'available';
    const hasNbtTag = entry ? itemPanelEntryHasNbtTag(entry) || rawHasNbtTag(raw) : rawHasNbtTag(raw);
    return (
      <span className="item-tooltip nei-tooltip" aria-hidden="true">
        <span className="nei-tooltip-title">
          <span>{title}</span>
          <span className="nei-tooltip-id">{itemIdLabel}</span>
        </span>
        <span className="nei-tooltip-row">
          <span>Мод</span>
          <strong>{modName}</strong>
        </span>
        <span className="nei-tooltip-row">
          <span>Рецепт</span>
          <strong className={hasRecipe ? 'is-yes' : 'is-no'}>{hasRecipe ? 'да' : 'нет'}</strong>
        </span>
        <span className="nei-tooltip-row">
          <span>NBT</span>
          <strong className={hasNbtTag ? 'is-yes' : 'is-no'}>{hasNbtTag ? 'да' : 'нет'}</strong>
        </span>
      </span>
    );
  }

  function openCustomItemEditor(raw: string, scope: 'global' | 'user', storage: 'local' | 'backend' = 'local', target: CraftEditorTarget | null = null) {
    const effectiveStorage = scope === 'global' ? 'backend' : storage;
    const existing = customItems.find((item) => item.item_raw === raw && item.scope === scope && (item.storage ?? 'backend') === effectiveStorage);
    const sourceRaw = existing?.source_raw ?? raw;
    const itemRaw = existing?.item_raw ?? raw;
    const parsed = parseRawForEditor(itemRaw);
    const nbtRaw = existing?.nbt_raw ?? '';
    setCustomItemNbtRoot(nbtRaw ? (parseNbtNode(nbtRaw).kind === 'compound' ? parseNbtNode(nbtRaw) as NbtCompoundNode : { kind: 'compound', entries: [{ key: 'value', value: parseNbtNode(nbtRaw) }] }) : parsed.nbtRoot);
    setCollapsedNbtPaths({});
    setCustomItemForm({
      mode: target ? 'craft' : 'nei',
      target,
      id: existing?.id ?? null,
      scope,
      storage: effectiveStorage,
      sourceRaw,
      itemRaw,
      displayName: existing?.display_name ?? resolveCellTitle(raw).replace(/\*$/, '') ?? raw,
      nbtRaw,
      comment: existing?.comment ?? ''
    });
    setNeiContextMenu(null);
    setIsCraftEditorOpen(false);
    setIsNbtEditorOpen(false);
  }

  async function saveCustomItemForm() {
    if (!customItemForm) return;
    const nbtRaw = buildNbtRawFromRoot(customItemNbtRoot);
    const itemRawBase = rawWithoutNbt(customItemForm.itemRaw);
    const itemRaw = nbtRaw ? `${itemRawBase}.withTag(${nbtRaw})` : itemRawBase;
    if (customItemForm.mode === 'craft' && customItemForm.target) {
      setCellRaw(customItemForm.target, itemRaw);
      setCustomItemsStatus('Предмет применен к рецепту');
      setCustomItemForm(null);
      return;
    }
    if (customItemForm.storage === 'local') {
      const now = new Date().toISOString();
      const saved: CustomItem = {
        id: customItemForm.id ?? localCustomItemId(authUser.email, itemRaw),
        scope: 'user',
        storage: 'local',
        owner_email: authUser.email.trim().toLowerCase(),
        created_by_email: authUser.email.trim().toLowerCase(),
        source_raw: customItemForm.sourceRaw,
        item_raw: itemRaw,
        display_name: customItemForm.displayName.trim() || itemRaw,
        nbt_raw: nbtRaw || null,
        comment: customItemForm.comment.trim(),
        created_at: customItemForm.id ? undefined : now,
        updated_at: now
      };
      setCustomItems((current) => {
        const withoutSaved = current.filter((item) => item.id !== saved.id && !(item.storage === 'local' && item.item_raw === saved.item_raw));
        const next = [saved, ...withoutSaved];
        persistLocalCustomItems(authUser.email, next);
        return next;
      });
      setCustomItemsStatus('Локальный предмет сохранен в кэше браузера');
      setCustomItemForm(null);
      return;
    }
    try {
      const payload = await saveCustomItem({
        id: customItemForm.id && customItemForm.id > 0 ? customItemForm.id : null,
        scope: customItemForm.scope,
        source_raw: customItemForm.sourceRaw,
        item_raw: itemRaw,
        display_name: customItemForm.displayName.trim() || itemRaw,
        nbt_raw: nbtRaw || null,
        comment: customItemForm.comment.trim()
      });
      setCustomItems((current) => {
        const saved = { ...payload.item, storage: 'backend' as const };
        const withoutSaved = current.filter((item) => item.id !== saved.id || (item.storage ?? 'backend') !== 'backend');
        return [saved, ...withoutSaved];
      });
      setCustomItemsStatus('Предмет сохранен в backend custom_items');
      setCustomItemForm(null);
    } catch (error) {
      setCustomItemsStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function removeCustomItem(item: CustomItem) {
    if (item.storage === 'local') {
      setCustomItems((current) => {
        const next = current.filter((currentItem) => currentItem.id !== item.id);
        persistLocalCustomItems(authUser.email, next);
        return next;
      });
      setCustomItemsStatus('Локальный предмет удален');
      setNeiContextMenu(null);
      return;
    }
    try {
      await deleteCustomItem(item.id);
      setCustomItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setCustomItemsStatus('Предмет удален');
      setNeiContextMenu(null);
    } catch (error) {
      setCustomItemsStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function renderNeiFavoriteItem(raw: string) {
    const title = resolveCellTitle(raw) || raw;
    const availability = getRecipeAvailability(raw);
    return (
      <NeiIconItem
        key={raw}
        raw={raw}
        ariaLabelPrefix="favorite-item"
        className={`nei-item favorite-item recipe-${availability} ${rawHasNbtTag(raw) ? 'has-nbt' : 'no-nbt'} ${heldItemRaw === raw ? 'is-held' : ''}`.trim()}
        icon={(
          <span className="nei-icon favorite-icon" aria-hidden="true">
            {renderCraftItemIcon(raw, getCachedItemIconUrl(raw), false, undefined, title)}
          </span>
        )}
        tooltip={renderItemTooltip(raw)}
        onHover={(nextRaw) => updateHoveredItemRaw((current) => {
          if (nextRaw) {
            return nextRaw;
          }
          return current === raw ? null : current;
        })}
        onPick={handleNeiItemPick}
        onOutputPick={(nextRaw) => handleRecipeItemDrop({ kind: 'output' }, nextRaw)}
        onOpenActions={openNeiItemActions}
        onInspect={(nextRaw, x, y) => inspectNeiItem(nextRaw, x, y)}
        onDragStart={(event, nextRaw) => {
          event.dataTransfer.setData('text/plain', nextRaw);
          event.dataTransfer.effectAllowed = 'copy';
          setHeldItemRaw(nextRaw);
        }}
        onDragEnd={(nextRaw) => {
          setHeldItemRaw((current) => (current === nextRaw ? null : current));
        }}
      />
    );
  }

  function renderNeiFavoritesPanel() {
    if (!canUseNeiFavorites) {
      return null;
    }
    const activeTab = activeNeiFavoriteTab();
    return (
      <NeiFavoritesPanel
        profile={neiFavorites}
        activeTab={activeTab}
        status={neiFavoritesStatus}
        hiddenPatternsDraft={neiHiddenPatternsDraft}
        newTabName={newFavoriteTabName}
        renderFavoriteItem={renderNeiFavoriteItem}
        onSelectTab={setActiveFavoriteTab}
        onRenameActiveTab={renameActiveFavoriteTab}
        onNewTabNameChange={setNewFavoriteTabName}
        onAddTab={addFavoriteTab}
        onDeleteActiveTab={deleteActiveFavoriteTab}
        onFavoriteHotkeyChange={updateFavoriteHotkey}
        onHiddenPatternsChange={updateNeiHiddenPatterns}
      />
    );
  }

  function renderNeiPanel() {
    const atlasImageUrl = itemPanelAtlas ? normalizeAtlasImageUrl(itemPanelAtlas.image_url) : '';
    return (
      <div className="workspace-panel-shell panel-nei">
        <Panel title="NEI предметы" subtitle="Поиск и перетаскивание в рецепт" className="nei-panel">
          <input aria-label="nei-search" type="search" value={neiSearchQuery} onChange={(event) => setNeiSearchQuery(event.target.value)} placeholder="Поиск предмета, mod:item или ID" />
          <div className="nei-pager" aria-label="nei-pagination">
            <button type="button" className="ghost-button icon-button" aria-label="nei-prev-page" disabled={neiPage <= 0} onClick={() => changeNeiPage(-1)}>‹</button>
            <strong>{neiPage + 1}/{neiPageCount}</strong>
            <button type="button" className="ghost-button icon-button" aria-label="nei-next-page" disabled={neiPage >= neiPageCount - 1} onClick={() => changeNeiPage(1)}>›</button>
          </div>
          <div
            ref={neiListRef}
            className="nei-list"
            aria-label="nei-items"
          >
            {neiItems.map((entry) => {
              const raw = itemPanelRaw(entry);
              let insertRaw = applyItemCaseAlias(raw);
              const overrideGroup = oreDictOverrides[raw];
              if (overrideGroup) {
                insertRaw = `<${overrideGroup}>`;
              }
              const iconUrl = itemSearchIcons[raw];
              const modIconStyle = buildModIconStyle(modIconManifest, modIconByRaw.get(raw));
              const atlasEntry = resolveAtlasEntryFromRaw(itemPanelAtlas, raw, wildcardCycleTick);
              const availability = getRecipeAvailability(raw);
              const nbtClass = itemPanelEntryHasNbtTag(entry) ? 'has-nbt' : 'no-nbt';
              const customForRaw = customItems.find((item) => item.item_raw === raw);
              const isFavorite = activeFavoriteRawSet.has(insertRaw) || activeFavoriteRawSet.has(raw);
              const atlasStyle = itemPanelAtlas && atlasEntry
                ? {
                  backgroundImage: `url(${atlasImageUrl})`,
                  backgroundPosition: `-${atlasEntry.x}px -${atlasEntry.y}px`,
                  backgroundSize: `${itemPanelAtlas.columns * itemPanelAtlas.tile_size}px ${itemPanelAtlas.rows * itemPanelAtlas.tile_size}px`
                }
                : undefined;
              return (
                <NeiIconItem
                  key={itemPanelEntryIdentity(entry)}
                  raw={raw}
                  pickRaw={insertRaw}
                  ariaLabelPrefix="nei-item"
                  className={`nei-item recipe-${availability} ${nbtClass} ${entry.customItemId ? 'is-custom' : ''} ${isFavorite ? 'is-favorite' : ''} ${heldItemRaw === insertRaw ? 'is-held' : ''}`.trim()}
                  icon={(
                    <span className={`nei-icon ${modIconStyle || atlasEntry || iconUrl ? 'has-icon' : 'is-loading'}`}>
                      {modIconStyle ? <span className="nei-atlas-icon" style={modIconStyle} /> : null}
                      {!modIconStyle && atlasStyle ? <span className="nei-atlas-icon" style={atlasStyle} /> : null}
                      {!modIconStyle && !atlasStyle && iconUrl ? (
                        <img
                          src={iconUrl}
                          alt=""
                          onError={() => {
                            setItemSearchIcons((current) => ({ ...current, [raw]: null }));
                          }}
                        />
                      ) : null}
                    </span>
                  )}
                  tooltip={renderItemTooltip(raw, entry)}
                  onHover={(nextRaw) => updateHoveredItemRaw((current) => {
                    if (nextRaw) {
                      return nextRaw;
                    }
                    return current === raw ? null : current;
                  })}
                  onPick={handleNeiItemPick}
                  onOutputPick={(nextRaw) => handleRecipeItemDrop({ kind: 'output' }, nextRaw)}
                  onOpenActions={(nextRaw, x, y, event) => {
                    if (event?.ctrlKey) {
                      openCustomItemEditor(raw, 'user', 'local');
                      return;
                    }
                    openNeiItemActions(nextRaw, x, y);
                  }}
                  onInspect={(nextRaw, x, y) => inspectNeiItem(nextRaw, x, y, entry)}
                  onDragStart={(event, nextRaw) => {
                    event.dataTransfer.setData('text/plain', nextRaw);
                    event.dataTransfer.effectAllowed = 'copy';
                    setHeldItemRaw(nextRaw);
                  }}
                  onDragEnd={(nextRaw) => {
                    setHeldItemRaw((current) => (current === nextRaw ? null : current));
                  }}
                >
                  <span className="nei-name" aria-hidden="true">{entry.displayRu || entry.displayEn || entry.key}</span>
                  <span className="nei-raw" aria-hidden="true">{raw}</span>
                  {customForRaw ? <span className="nei-custom-dot" aria-hidden="true" /> : null}
                  {overrideGroup ? <span className="nei-oredict-dot" aria-hidden="true">⊕</span> : null}
                  {isFavorite ? <span className="nei-favorite-dot" aria-hidden="true">A</span> : null}
                </NeiIconItem>
              );
            })}
          </div>
        </Panel>
      </div>
    );
  }

  function renderTouchItemInspection() {
    if (!touchItemInspection) return null;
    const raw = touchItemInspection.raw;
    return (
      <div
        className="mobile-item-inspection"
        style={getContextMenuStyle(touchItemInspection.x, touchItemInspection.y, { width: 300, height: 210 })}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="mobile-item-inspection-tooltip">
          {renderItemTooltip(raw, touchItemInspection.entry)}
        </div>
        <button
          type="button"
          className="mobile-item-inspection-more"
          aria-label={`touch-item-actions-${raw}`}
          onClick={() => openNeiItemActions(raw, touchItemInspection.x, touchItemInspection.y)}
        >
          ...
        </button>
      </div>
    );
  }

  function renderNeiContextMenu() {
    if (!neiContextMenu) return null;
    const raw = neiContextMenu.raw;
    const custom = customItems.find((item) => item.item_raw === raw);
    const pickerOpen = Boolean(neiContextMenu.customPickerOpen && customItems.length);
    const addedToTask = rawHasTask(raw);
    const taskStatusText = taskLookupStatus === 'loading' ? 'проверяю' : addedToTask ? 'да' : 'нет';
    const templateEnabled = loadTaskDefaultTemplate().enabled;
    const favoriteRaw = applyItemCaseAlias(raw);
    const isFavorite = activeFavoriteRawSet.has(favoriteRaw) || activeFavoriteRawSet.has(raw);
    return (
      <div
        className="context-menu nei-context-menu"
        style={getContextMenuStyle(neiContextMenu.x, neiContextMenu.y, { width: 340, height: pickerOpen ? 660 : (custom ? 470 : 440) })}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <strong>{raw}</strong>
        {canManageTasks ? (
          <div className="context-menu-status">
            <span>Добавлено в задачу</span>
            <strong className={addedToTask ? 'is-yes' : 'is-no'}>{taskStatusText}</strong>
          </div>
        ) : null}
        {canUseNeiFavorites ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              toggleNeiFavorite(raw);
              setNeiContextMenu(null);
            }}
          >
            {isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
          </button>
        ) : null}
        
        {(() => {
          const rawKey = parseItemRaw(raw)?.key.toLowerCase() ?? raw.toLowerCase();
          const groups = oreDictGroups[rawKey] || [];
          if (!groups.length) return null;
          return (
            <div className="context-menu-section" style={{ padding: '8px', background: 'var(--surface-sunken)', borderRadius: '4px', margin: '8px 0' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>OreDict группы:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {groups.map(group => {
                  const isActive = oreDictOverrides[raw] === group;
                  return (
                    <button 
                      key={group}
                      type="button" 
                      className={isActive ? 'primary-button' : 'ghost-button'}
                      style={{ textAlign: 'left', padding: '4px 8px', fontSize: '13px' }}
                      onClick={() => {
                        setOreDictOverrides(curr => ({ ...curr, [raw]: isActive ? null : group }));
                        setNeiContextMenu(null);
                      }}
                    >
                      {isActive ? '✓ ' : ''}&lt;ore:{group}&gt;
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {canManageTasks ? <button type="button" onClick={() => handleNeiItemTaskPrefill(raw)}>Добавить в задачу</button> : null}
        {canManageTasks ? (
          <button
            type="button"
            className="secondary-button"
            disabled={!templateEnabled}
            onClick={() => void handleNeiItemTemplateTask(raw)}
          >
            Добавить задачу по шаблону
          </button>
        ) : null}
        <button type="button" onClick={() => openCustomItemEditor(raw, 'user', 'local')}>Локальный custom item</button>
        <button type="button" className="secondary-button" onClick={() => openCustomItemEditor(raw, 'user', 'backend')}>Backend custom item</button>
        {canManageSettings ? <button type="button" className="secondary-button" onClick={() => openCustomItemEditor(raw, 'global', 'backend')}>Backend для всех</button> : null}
        <button
          type="button"
          className="ghost-button"
          disabled={!customItems.length}
          onClick={() => setNeiContextMenu((current) => current ? { ...current, customPickerOpen: !current.customPickerOpen } : current)}
        >
          Выбрать custom item
        </button>
        {pickerOpen ? (
          <div className="custom-picker-list" aria-label="custom-item-picker">
            {customItems.map((item) => (
              <button
                key={`${item.storage ?? 'backend'}-${item.id}`}
                type="button"
                className="custom-picker-item"
                onClick={() => {
                  handleNeiItemPick(item.item_raw);
                  setStatus(`Выбран custom item: ${item.display_name}`);
                  setNeiContextMenu(null);
                }}
              >
                <span>{item.storage === 'local' ? 'local' : item.scope === 'global' ? 'backend/global' : 'backend/user'}</span>
                <strong>{item.display_name}</strong>
                <code>{item.item_raw}</code>
                {item.comment ? <small>{item.comment}</small> : null}
              </button>
            ))}
          </div>
        ) : null}
        {custom ? <button type="button" className="danger-button" onClick={() => void removeCustomItem(custom)}>Удалить созданный предмет</button> : null}
        <button type="button" className="ghost-button" onClick={() => setNeiContextMenu(null)}>Закрыть</button>
      </div>
    );
  }

  function renderDraftTemplateContextMenu() {
    if (!draftTemplateContextMenu) return null;
    const draft = recipeDraftTemplates.find((item) => item.id === draftTemplateContextMenu.draftId);
    if (!draft) return null;
    return (
      <div
        className="context-menu draft-template-context-menu"
        style={getContextMenuStyle(draftTemplateContextMenu.x, draftTemplateContextMenu.y, { height: 150 })}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <strong>{draft.name}</strong>
        <button type="button" aria-label="open-draft-template" onClick={() => openRecipeDraftTemplate(draft)}>Редактировать рецепт</button>
        <button type="button" className="danger-button" aria-label="delete-draft-template" onClick={() => void removeRecipeDraftTemplate(draft.id)}>Удалить шаблон</button>
        <button type="button" className="ghost-button" onClick={() => setDraftTemplateContextMenu(null)}>Закрыть</button>
      </div>
    );
  }

  function renderCloudContextMenu() {
    if (!cloudContextMenu) return null;
    const file = cloudFiles.find((item) => item.path === cloudContextMenu.path);
    if (!file) return null;
    return (
      <div
        className="context-menu cloud-file-context-menu"
        style={getContextMenuStyle(cloudContextMenu.x, cloudContextMenu.y, { height: 190 })}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <strong>{file.name}</strong>
        <button type="button" onClick={() => void downloadCloudFile(file.path)}>Скачать</button>
        <button type="button" onClick={() => void renameCloudFile(file.path)}>Переименовать</button>
        <button type="button" className="danger-button" onClick={() => void deleteCloudFile(file.path)}>Удалить</button>
        <button type="button" className="ghost-button" onClick={() => setCloudContextMenu(null)}>Закрыть</button>
      </div>
    );
  }

  function renderRecipeUsesModal() {
    if (!recipeUsesModal) return null;
    const pageCount = Math.max(1, recipeUsesModal.matches.length);
    const safePage = clamp(recipeUsesModal.page, 0, pageCount - 1);
    const selectedRecipe = recipeUsesModal.matches[safePage] ?? null;
    const selectedTitle = selectedRecipe
      ? (resolveCellTitle(selectedRecipe.output.raw) || selectedRecipe.output.raw)
      : recipeUsesModal.raw;
    return (
      <div className="modal-backdrop" role="presentation" onClick={() => setRecipeUsesModal(null)}>
        <div className="modal modal-recipe-uses" role="dialog" aria-modal="true" aria-label="Использования предмета" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h2>Использования предмета</h2>
              <span className="modal-subtitle">{recipeUsesModal.raw}</span>
            </div>
            <div className="inline-actions">
              <button type="button" onClick={() => setRecipeUsesModal(null)}>Закрыть</button>
            </div>
          </div>
          <div className="settings-modal-body">
            {recipeUsesModal.status === 'loading' ? <div className="inline-status inline-status-default">Ищу рецепты...</div> : null}
            {recipeUsesModal.status === 'error' ? <div className="inline-status inline-status-warning">{recipeUsesModal.error ?? 'Не удалось загрузить применения.'}</div> : null}
            {recipeUsesModal.status === 'ready' && !recipeUsesModal.matches.length ? (
              <div className="inline-hint inline-hint-warning">Этот предмет не найден в ингредиентах рецептов.</div>
            ) : null}
            {selectedRecipe ? (
              <div className="recipe-uses-view">
                <div className="recipe-uses-output">
                  <button
                    type="button"
                    className="output-icon-slot output-icon-button"
                    data-item-raw={selectedRecipe.output.raw}
                    onMouseEnter={() => updateHoveredItemRaw(selectedRecipe.output.raw)}
                    onMouseLeave={() => updateHoveredItemRaw((current) => (current === selectedRecipe.output.raw ? null : current))}
                    onFocus={() => updateHoveredItemRaw(selectedRecipe.output.raw)}
                    onBlur={() => updateHoveredItemRaw((current) => (current === selectedRecipe.output.raw ? null : current))}
                    onClick={() => openRecipeFromUses(selectedRecipe)}
                  >
                    {renderCraftItemIcon(selectedRecipe.output.raw, selectedRecipe.output_resolution?.icon_url, selectedRecipe.output_resolution?.animated, selectedRecipe.output_resolution?.animation_meta?.frametime, selectedTitle)}
                    {renderItemTooltip(selectedRecipe.output.raw)}
                  </button>
                  <div>
                    <strong>{selectedTitle}</strong>
                    <span>{selectedRecipe.output.raw}</span>
                    <span>{selectedRecipe.source.path ?? 'Recipes'}</span>
                  </div>
                </div>
                <div className="grid-scroll-zone recipe-uses-grid">
                  <RecipeGrid
                    matrix={selectedRecipe.matrix}
                    atlas={itemPanelAtlas}
                    atlasImageUrl={itemPanelAtlas ? normalizeAtlasImageUrl(itemPanelAtlas.image_url) : ''}
                    displayMode={uiPreferences.display_mode}
                    animationsEnabled={areAnimationsEnabled}
                    editorMode="view"
                    extremeGroupGap={uiPreferences.workspace_layout.extreme_grid_gap ?? 8}
                    heldItemRaw={null}
                    tooltipsDisabled={false}
                    resolveCellTitle={resolveCellTitle}
                    resolveIconStyle={resolveRecipeGridIconStyle}
                    renderItemTooltip={renderItemTooltip}
                    onItemHover={updateHoveredItemRaw}
                    onCellClick={() => undefined}
                    onCellContextMenu={() => undefined}
                    onCellChange={() => undefined}
                  />
                </div>
                <div className="recipe-uses-actions">
                  <button type="button" className="ghost-button icon-button" aria-label="uses-prev-page" disabled={safePage <= 0} onClick={() => changeRecipeUsesPage(-1)}>‹</button>
                  <strong>{safePage + 1}/{pageCount}</strong>
                  <button type="button" className="ghost-button icon-button" aria-label="uses-next-page" disabled={safePage >= pageCount - 1} onClick={() => changeRecipeUsesPage(1)}>›</button>
                  <button type="button" className="secondary-button" onClick={() => openRecipeFromUses(selectedRecipe)}>Открыть рецепт</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  function renderHotkeyDebugPanel() {
    if (!isHotkeyDebugActive || !hotkeyDebugEvents.length) return null;
    return (
      <aside className="hotkey-debug-panel" aria-label="recipe-hotkey-debug">
        <div className="hotkey-debug-header">
          <strong>App debug</strong>
          <button type="button" className="ghost-button" onClick={() => setHotkeyDebugEvents([])}>clear</button>
        </div>
        <ol className="hotkey-debug-list">
          {hotkeyDebugEvents.map((entry) => (
            <li key={entry.id} className={`hotkey-debug-event hotkey-debug-${entry.level}`}>
              <div className="hotkey-debug-line">
                <span>{entry.timestamp}</span>
                <strong>{entry.message}</strong>
                <em>{debugCategoryLabels[entry.category]}</em>
              </div>
              {entry.details ? (
                <dl>
                  {Object.entries(entry.details).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{formatHotkeyDebugValue(value)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          ))}
        </ol>
      </aside>
    );
  }

  function renderCustomItemModal() {
    if (!customItemForm) return null;
    const canUseGlobalScope = canManageSettings;
    const isCraftMode = customItemForm.mode === 'craft';
    const nbtRawPreview = buildNbtRawFromRoot(customItemNbtRoot);
    const itemRawBase = rawWithoutNbt(customItemForm.itemRaw);
    const finalRawPreview = nbtRawPreview ? `${itemRawBase}.withTag(${nbtRawPreview})` : itemRawBase;
    return (
      <div className="modal-backdrop" role="presentation" onClick={() => setCustomItemForm(null)}>
        <div className="modal modal-scalable modal-custom-item" role="dialog" aria-modal="true" aria-label="Редактор предмета" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h2>{isCraftMode ? 'Редактор предмета в рецепте' : 'Custom item'}</h2>
              <span className="modal-subtitle">{isCraftMode ? 'Изменения применятся только к выбранной ячейке или output.' : 'Создание и хранение пользовательского варианта предмета.'}</span>
            </div>
            <div className="inline-actions">
              <button type="button" onClick={() => setCustomItemForm(null)}>Закрыть</button>
            </div>
          </div>
          <div className="settings-modal-body custom-item-editor-body">
            <section className="custom-item-summary">
              <div>
                <span>Исходный raw</span>
                <code>{customItemForm.sourceRaw}</code>
              </div>
              <div>
                <span>Итоговый raw</span>
                <code>{finalRawPreview || '?'}</code>
              </div>
            </section>

            <section className="settings-section custom-nbt-section">
              <div className="settings-section-title">
                <h3>NBT</h3>
                <span>{nbtRawPreview ? nbtRawPreview : 'NBT не задан.'}</span>
              </div>
              <NbtTreeEditor
                root={customItemNbtRoot}
                collapsedPaths={collapsedNbtPaths}
                labelPrefix="custom-nbt"
                emptyText="NBT не задан. Добавьте поле, объект или список."
                onChange={setCustomItemNbtRoot}
                onCollapsedPathsChange={setCollapsedNbtPaths}
              />
            </section>

            <div className={`custom-item-config-grid ${isCraftMode ? 'is-craft-mode' : ''}`}>
              <section className="settings-section custom-main-section">
                <div className="settings-section-title compact">
                  <h3>Описание предмета</h3>
                  <span>{isCraftMode ? 'Только для текущего рецепта' : 'Название, raw и заметка'}</span>
                </div>
                <div className="settings-grid">
                  <label className="field-block">
                    <span>Название</span>
                    <input aria-label="custom-item-name" type="text" value={customItemForm.displayName} onChange={(event) => setCustomItemForm((current) => current ? { ...current, displayName: event.target.value } : current)} />
                  </label>
                  <label className="field-block">
                    <span>Raw предмета</span>
                    <input aria-label="custom-item-raw" type="text" value={customItemForm.itemRaw} onChange={(event) => setCustomItemForm((current) => current ? { ...current, itemRaw: event.target.value } : current)} />
                  </label>
                </div>
                <label className="field-block">
                  <span>Комментарий</span>
                  <textarea className="compact-textarea" aria-label="custom-item-comment" value={customItemForm.comment} onChange={(event) => setCustomItemForm((current) => current ? { ...current, comment: event.target.value } : current)} placeholder="Что это за предмет и зачем он нужен" rows={3} />
                </label>
                <div className="inline-hint">Для переливающихся вариантов укажите meta `*`, например `&lt;minecraft:wool:*&gt;`.</div>
              </section>

              {!isCraftMode ? (
                <section className="settings-section custom-save-section">
                  <div className="settings-section-title compact">
                    <h3>Где сохранить</h3>
                    <span>{customItemForm.storage === 'local' ? 'local hash' : '.cubixrecipes_admin/custom_items'}</span>
                  </div>
                  <div className="custom-save-options" role="group" aria-label="custom-item-storage">
                    <label className={`custom-save-option ${customItemForm.storage === 'local' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="custom-item-storage"
                        checked={customItemForm.storage === 'local'}
                        onChange={() => setCustomItemForm((current) => current ? { ...current, storage: 'local', scope: 'user' } : current)}
                      />
                      <strong>Только для меня</strong>
                      <span>LocalStorage по hash пользователя.</span>
                    </label>
                    <label className={`custom-save-option ${customItemForm.storage === 'backend' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="custom-item-storage"
                        checked={customItemForm.storage === 'backend'}
                        onChange={() => setCustomItemForm((current) => current ? { ...current, storage: 'backend' } : current)}
                      />
                      <strong>Backend</strong>
                      <span>Отдельная папка custom items, не scripts.</span>
                    </label>
                  </div>
                  {customItemForm.storage === 'local' ? (
                    <div className="inline-hint inline-hint-warning">Локальный custom item хранится в кэше браузера. После очистки LocalStorage/кэша он исчезнет.</div>
                  ) : (
                    <div className="inline-hint">Backend custom items сохраняются отдельно от рецептов: <code>.cubixrecipes_admin/custom_items/items.json</code>.</div>
                  )}
                  {customItemForm.storage === 'backend' ? (
                    <label className="field-block">
                      <span>Область backend</span>
                      <select
                        aria-label="custom-item-scope"
                        value={customItemForm.scope}
                        disabled={!canUseGlobalScope}
                        onChange={(event) => setCustomItemForm((current) => current ? { ...current, scope: event.target.value as 'global' | 'user' } : current)}
                      >
                        <option value="user">Только мой backend-предмет</option>
                        <option value="global">Для всех</option>
                      </select>
                    </label>
                  ) : null}
                </section>
              ) : null}
            </div>
            {customItemsStatus ? <div className="inline-status inline-status-default">{customItemsStatus}</div> : null}
            <div className="inline-actions">
              <button type="button" className="secondary-button" onClick={() => void saveCustomItemForm()}>{isCraftMode ? 'Применить к рецепту' : 'Сохранить предмет'}</button>
              <button type="button" className="ghost-button" onClick={() => setCustomItemForm(null)}>Отмена</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderWipeUpdateModal() {
    if (!isWipeUpdateOpen) return null;
    const summary = itemCatalogSummary ?? {};
    return (
      <div className="modal-backdrop" role="presentation" onClick={() => setIsWipeUpdateOpen(false)}>
        <div className="modal wipe-update-modal" role="dialog" aria-modal="true" aria-label="Обновление вайпа" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h2>Обновление вайпа</h2>
              <span className="modal-subtitle">CSV, иконки, атласы и построчный itempanel.json в один общий каталог</span>
            </div>
            <div className="inline-actions">
              <button type="button" onClick={() => setIsWipeUpdateOpen(false)}>Закрыть</button>
            </div>
          </div>
          <div className="settings-modal-body wipe-update-steps">
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>1. itempanel.csv</h3>
                <span>Список предметов, legacy ID, meta и локализованные названия.</span>
              </div>
              <label
                className="file-drop-zone compact-drop-zone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleItemPanelCsvFiles(event.dataTransfer.files);
                }}
              >
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    if (event.target.files) {
                      void handleItemPanelCsvFiles(event.target.files);
                      event.currentTarget.value = '';
                    }
                  }}
                />
                <strong>Загрузить itempanel.csv</strong>
                <span>{itemPanelCsvUploading ? 'Загрузка...' : itemPanelCsvMessage || 'Ожидает CSV из NEI dump.'}</span>
              </label>
            </section>
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>2. Иконки</h3>
                <span>ZIP архивы modid_x32.zip или modid_x256.zip с PNG.</span>
              </div>
              <label
                className="file-drop-zone compact-drop-zone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleModIconArchiveFiles(event.dataTransfer.files);
                }}
              >
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(event) => {
                    if (event.target.files) {
                      void handleModIconArchiveFiles(event.target.files);
                      event.currentTarget.value = '';
                    }
                  }}
                />
                <strong>Загрузить ZIP иконок</strong>
                <span>{modIconUploading ? 'Загрузка...' : modIconMessage || 'Можно загрузить несколько архивов по очереди.'}</span>
              </label>
            </section>
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>3. Атласы</h3>
                <span>После загрузки ZIP пересоберите атласы для отображения иконок.</span>
              </div>
              <div className="inline-actions">
                <button type="button" className="secondary-button" disabled={modIconGenerating || !(modIconStatus?.archives.length)} onClick={() => void handleGenerateModIconAtlases()}>Сгенерировать атласы</button>
                <span>{modIconGenerating ? 'Генерация...' : `Атласов: ${modIconManifest?.atlases.length ?? modIconStatus?.manifest?.atlases.length ?? 0}`}</span>
              </div>
            </section>
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>4. itempanel.json</h3>
                <span>Построчный SNBT файл должен совпадать с itempanel.csv по количеству строк и порядку.</span>
              </div>
              <label
                className="file-drop-zone compact-drop-zone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleItemPanelJsonFiles(event.dataTransfer.files);
                }}
              >
                <input
                  type="file"
                  accept=".json,application/json,text/plain"
                  onChange={(event) => {
                    if (event.target.files) {
                      void handleItemPanelJsonFiles(event.target.files);
                      event.currentTarget.value = '';
                    }
                  }}
                />
                <strong>Загрузить itempanel.json</strong>
                <span>{itemPanelJsonUploading ? 'Загрузка...' : itemPanelJsonMessage || 'Файл с SNBT строками из NEI dump.'}</span>
              </label>
            </section>
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>5. oredict.txt (опционально)</h3>
                <span>Экспорт Forge Ore Dictionary, используется для замен &lt;ore:group&gt;.</span>
              </div>
              <label
                className="file-drop-zone compact-drop-zone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleOreDictFile(event.dataTransfer.files);
                }}
              >
                <input
                  type="file"
                  accept=".txt,text/plain"
                  onChange={(event) => {
                    if (event.target.files) {
                      void handleOreDictFile(event.target.files);
                      event.currentTarget.value = '';
                    }
                  }}
                />
                <strong>Загрузить oredict.txt</strong>
                <span>{oreDictUploading ? 'Загрузка...' : oreDictMessage || 'Ожидает файл oredict.txt.'}</span>
              </label>
            </section>
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>6. Объединение и проверка</h3>
                <span>После объединения NEI получает raw-варианты с .withTag(...), а редактор строит дерево NBT.</span>
              </div>
              <div className="kv-grid">
                <div><span>Всего</span><strong>{String(summary.entries ?? itemPanelTranslations.entries.length)}</strong></div>
                <div><span>CSV</span><strong>{String(summary.csv_entries ?? 0)}</strong></div>
                <div><span>SNBT строк</span><strong>{String(summary.snbt_rows ?? 0)}</strong></div>
                <div><span>NBT варианты</span><strong>{String(summary.nbt_entries ?? 0)}</strong></div>
                <div><span>Merged CSV</span><strong>{summary.merged_csv_exists ? 'создан' : 'нет'}</strong></div>
              </div>
              <div className="inline-actions">
                <button type="button" className="secondary-button" disabled={itemPanelMerging} onClick={() => void handleMergeItemPanelFiles()}>{itemPanelMerging ? 'Объединение...' : 'Объединить файлы'}</button>
                <button type="button" className="ghost-button" onClick={() => void refreshItemCatalogTranslations()}>Обновить каталог</button>
                <button type="button" className="ghost-button" disabled={!summary.merged_csv_exists} onClick={() => window.open(getItemPanelMergedCsvUrl(), '_blank', 'noopener,noreferrer')}>Открыть объединенный файл</button>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  function renderModIconsPanel() {
    const manifest = modIconStatus?.manifest ?? modIconManifest;
    const atlasEntries = manifest ? [...Object.values(manifest.entries.x32), ...Object.values(manifest.entries.x256)] : [];
    return (
      <div className="workspace-layout workspace-layout-admin">
        <div className="workspace-column workspace-left">
          <div className="workspace-panel-shell panel-admin-mod-icons">
            <Panel title="Атласы" subtitle="ZIP архивы формата modid_x32.zip или modid_x256.zip с PNG внутри">
              <label
                className="file-drop-zone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleModIconArchiveFiles(event.dataTransfer.files);
                }}
              >
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(event) => {
                    if (event.target.files) {
                      void handleModIconArchiveFiles(event.target.files);
                      event.currentTarget.value = '';
                    }
                  }}
                />
                <strong>Загрузить ZIP архив иконок</strong>
                <span>Например: energyadditions_x32.zip с папкой energyadditions_x32/ и PNG-файлами внутри</span>
              </label>
              <div className="file-actions">
                <button type="button" disabled={modIconUploading || Boolean(modIconArchiveAction)} onClick={() => void refreshModIconStatus()}>Обновить статус</button>
                <button type="button" className="secondary-button" disabled={modIconGenerating || Boolean(modIconArchiveAction) || !(modIconStatus?.archives.length)} onClick={() => void handleGenerateModIconAtlases()}>Сгенерировать атласы</button>
              </div>
              {modIconMessage ? <div className="inline-status inline-status-default">{modIconMessage}</div> : null}
              <div className="admin-file-list">
                {(modIconStatus?.archives ?? []).map((archive) => (
                  <div key={archive.name} className="admin-file-row">
                    <div>
                      <strong>{archive.name}</strong>
                      <span>{formatFileSize(archive.size)}</span>
                    </div>
                    <div className="admin-file-actions">
                      <span>{archive.modifiedAt ? new Date(archive.modifiedAt).toLocaleString() : '-'}</span>
                      <div className="inline-actions">
                        <button type="button" className="ghost-button" onClick={() => handleDownloadModIconArchive(archive.name)}>Скачать</button>
                        <button type="button" className="secondary-button" disabled={Boolean(modIconArchiveAction)} onClick={() => void handleCleanModIconArchive(archive.name)}>
                          {modIconArchiveAction === `clean:${archive.name}` ? 'Очистка...' : 'Очистить лишнее'}
                        </button>
                        <button type="button" className="ghost-button danger-lite-button" disabled={Boolean(modIconArchiveAction)} onClick={() => void handleDeleteModIconArchive(archive.name)}>
                          {modIconArchiveAction === `delete:${archive.name}` ? 'Удаление...' : 'Удалить'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {modIconStatus && !modIconStatus.archives.length ? <div className="inline-hint inline-hint-warning">Архивы ещё не загружены.</div> : null}
              </div>
            </Panel>
          </div>
        </div>
        <div className="workspace-column workspace-right">
          <div className="workspace-panel-shell panel-admin-mod-atlases">
            <Panel title="Атласы" subtitle="4096x4096 максимум, дополнительные страницы создаются автоматически">
              <div className="kv-grid">
                <div><span>Модов</span><strong>{manifest?.totalMods ?? 0}</strong></div>
                <div><span>Иконок</span><strong>{manifest?.totalIcons ?? atlasEntries.length}</strong></div>
                <div><span>Атласов</span><strong>{manifest?.atlases.length ?? 0}</strong></div>
                <div><span>Fallback</span><strong>itempanel atlas</strong></div>
              </div>
              {manifest?.rejected.length ? (
                <div className="inline-status inline-status-warning">Отклонено иконок: {manifest.rejected.length}</div>
              ) : null}
              <div className="mod-icon-preview-grid">
                {atlasEntries.map((entry) => {
                  const atlas = manifest?.atlases.find((item) => item.file === entry.atlasFile);
                  const previewScale = 40 / entry.w;
                  return (
                    <span
                      key={`${entry.size}-${entry.key ?? entry.modid}-${entry.x}-${entry.y}`}
                      className="mod-icon-preview"
                      title={`${entry.modid}: ${entry.iconName ?? entry.modid} x${entry.size}`}
                      style={{
                        backgroundImage: `url(${normalizeModIconImageUrl(entry.image_url)})`,
                        backgroundPosition: `-${entry.x * previewScale}px -${entry.y * previewScale}px`,
                        backgroundSize: `${(atlas?.columns ?? 1) * entry.w * previewScale}px ${(atlas?.rows ?? 1) * entry.h * previewScale}px`
                      }}
                      aria-label={`mod-icon-${entry.key ?? entry.modid}-x${entry.size}`}
                    />
                  );
                })}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    );
  }

  function renderCloudStoragePanel() {
    const currentScriptsDir = settings?.scripts_dir ?? '';
    const hasVolatileScriptsDir = currentScriptsDir ? isVolatileScriptsDir(currentScriptsDir) : false;
    return (
      <div className="workspace-layout workspace-layout-admin">
        <div className="workspace-column workspace-left">
          <div className="workspace-panel-shell panel-admin-cloud">
            <Panel title="Облачное хранилище" subtitle="Все найденные .zs файлы">
              <div className="admin-users-toolbar">
                <button type="button" className="secondary-button" onClick={() => void refreshCloudFiles()}>Обновить</button>
                <span>{cloudStatus}</span>
              </div>
              <div className={`cloud-storage-path ${hasVolatileScriptsDir ? 'is-warning' : 'is-ok'}`}>
                <div>
                  <span>Текущий scripts_dir</span>
                  <code>{currentScriptsDir || 'загружается...'}</code>
                </div>
                <strong>{hasVolatileScriptsDir ? 'Временный путь: файлы могут пропасть после деплоя.' : 'Persistent путь для активных .zs.'}</strong>
                {canManageSettings && currentScriptsDir !== PERSISTENT_SCRIPTS_DIR ? (
                  <button type="button" className="secondary-button" aria-label="use-persistent-scripts-dir" disabled={!settings || cloudStorageUpdating} onClick={() => void switchCloudStorageToPersistentPath()}>
                    Использовать /data/scripts
                  </button>
                ) : null}
              </div>
              <div className="admin-file-list" aria-label="cloud-zs-files">
                {cloudFiles.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    className="admin-file-row admin-file-button"
                    aria-label={`cloud-file-${file.name}`}
                    title={file.path}
                    onClick={() => void downloadCloudFile(file.path)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setCloudContextMenu({ path: file.path, x: event.clientX, y: event.clientY });
                    }}
                  >
                    <div>
                      <strong>{file.name}</strong>
                      <span>{file.path}</span>
                    </div>
                    <div>
                      <span>{formatFileSize(file.size)}</span>
                      <span>{file.recipeCount} recipes</span>
                    </div>
                  </button>
                ))}
                {!cloudFiles.length ? <div className="inline-hint inline-hint-warning">Файлы .zs не найдены.</div> : null}
              </div>
            </Panel>
          </div>
        </div>
        <div className="workspace-column workspace-right">
          {authUser.is_root_admin && isRootBackupOpen ? (
            <div className="workspace-panel-shell panel-root-backup">
              <Panel title="ROOT backup" subtitle="Скрытые копии не участвуют в работе сайта">
                <div className="admin-users-toolbar">
                  <button type="button" className="secondary-button" onClick={() => void refreshRootBackups()}>Обновить backup</button>
                  <span>{cloudBackupStatus}</span>
                </div>
                <div className="admin-file-list" aria-label="root-backup-files">
                  {cloudBackups.map((backup) => (
                    <button key={backup.id} type="button" className="admin-file-row admin-file-button" onClick={() => void downloadRootBackup(backup)}>
                      <div>
                        <strong>{backup.name}</strong>
                        <span>{backup.originalPath}</span>
                      </div>
                      <span>{formatFileSize(backup.size)}</span>
                    </button>
                  ))}
                  {!cloudBackups.length ? <div className="inline-hint inline-hint-warning">Backup пока пуст.</div> : null}
                </div>
              </Panel>
            </div>
          ) : (
            <div className="workspace-panel-shell panel-admin-cloud-note">
              <Panel title="Действия" subtitle="Контекстное меню файла">
                <div className="inline-hint">ПКМ по файлу: скачать, переименовать или удалить.</div>
              </Panel>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderRecipeFilesPanel() {
    const selectedUploadedDrafts = uploadedDrafts.filter((draft) => selectedUploadedDraftIds[draft.id]);
    const selectedUploadedDraftCount = selectedUploadedDrafts.length;
    const allUploadedDraftsSelected = uploadedDrafts.length > 0 && selectedUploadedDraftCount === uploadedDrafts.length;
    const activeUploadedDraft = getActiveUploadedDraft();
    const fileActionDrafts = getDraftsForFileAction();
    return (
      <div className="workspace-panel-shell panel-recipe-files">
        <Panel title="Файлы рецептов" subtitle="Загрузка, редактирование и скачивание">
          <label
            className="file-drop-zone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void importRecipeFiles(event.dataTransfer.files);
            }}
          >
            <input
              type="file"
              accept=".zs,text/plain"
              multiple
              onChange={(event) => {
                if (event.target.files) {
                  void importRecipeFiles(event.target.files);
                  event.currentTarget.value = '';
                }
              }}
            />
            <strong>Закиньте свои файлы для редактирования рецептов</strong>
            <span>.zs файлы можно перетащить сюда или выбрать через окно файла</span>
          </label>
          {uploadedDrafts.length ? (
            <div className="uploaded-drafts-list" aria-label="uploaded-drafts">
              <div className="uploaded-draft-toolbar">
                <label className="uploaded-draft-select-all">
                  <input
                    type="checkbox"
                    checked={allUploadedDraftsSelected}
                    onChange={(event) => setAllUploadedDraftsSelected(event.target.checked)}
                  />
                  <span>Все файлы</span>
                </label>
                <span>{selectedUploadedDraftCount ? `Выбрано: ${selectedUploadedDraftCount}` : `${uploadedDrafts.length} файлов`}</span>
              </div>
              {uploadedDrafts.map((draft) => (
                <div
                  key={draft.id}
                  role="button"
                  tabIndex={0}
                  className={`uploaded-draft-row ${selectedDraftId === draft.id ? 'active' : ''}`.trim()}
                  aria-label={`Открыть ${draft.name}`}
                  onClick={() => {
                    setSelectedDraftId(draft.id);
                    void handleParse(draft.text);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedDraftId(draft.id);
                      void handleParse(draft.text);
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    aria-label={`Выбрать ${draft.name}`}
                    checked={Boolean(selectedUploadedDraftIds[draft.id])}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    onChange={(event) => setUploadedDraftSelection(draft.id, event.target.checked)}
                  />
                  <span>{draft.name}</span>
                  <small>{Math.max(1, Math.round(draft.size / 1024))} KB</small>
                </div>
              ))}
            </div>
          ) : null}
          {activeUploadedDraft ? (
            <label className="field-block local-script-editor">
              <span>Локальный редактор .zs</span>
              <textarea
                aria-label="local-script-editor"
                value={activeUploadedDraft.text}
                onChange={(event) => updateUploadedDraftText(activeUploadedDraft.id, event.target.value)}
              />
            </label>
          ) : null}
          <div className="file-actions">
            <button type="button" className="secondary-button" aria-label="download-active-draft" disabled={!activeUploadedDraft} onClick={downloadActiveUploadedDraft}>Скачать текущий</button>
            <button type="button" aria-label="upload-drafts-cloud" disabled={!fileActionDrafts.length || !canManageCloudFiles} onClick={() => void uploadDraftsToCloud(fileActionDrafts)}>Выгрузить в Облако</button>
          </div>
          {selectedUploadedDraftCount ? (
            <div className="uploaded-draft-selection-actions">
              <button type="button" className="secondary-button" onClick={() => downloadUploadedDrafts(selectedUploadedDrafts)}>Скачать выбранные</button>
              <button type="button" className="ghost-button" onClick={() => deleteUploadedDrafts(selectedUploadedDrafts)}>Удалить выбранные</button>
              <button type="button" className="ghost-button" onClick={() => setSelectedUploadedDraftIds({})}>Снять выбор</button>
            </div>
          ) : null}
        </Panel>
      </div>
    );
  }

  function renderCloudUploadConflictModal() {
    if (!cloudUploadConflict) return null;
    return (
      <div className="modal-backdrop" role="presentation" onClick={() => resolveCloudUploadConflict('cancel')}>
        <div
          className="modal cloud-upload-conflict-modal"
          role="dialog"
          aria-modal="true"
          aria-label="cloud-upload-conflict"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-header">
            <div>
              <h2>Файл уже есть в Облаке</h2>
              <span className="modal-subtitle">Выберите, что сделать с файлом {cloudUploadConflict.filename}.</span>
            </div>
          </div>
          <div className="settings-modal-body">
            <div className="cloud-save-preview">
              <span>Файл</span>
              <strong>{cloudUploadConflict.filename}</strong>
            </div>
            <div className="cloud-conflict-actions">
              <button type="button" aria-label="cloud-upload-overwrite" onClick={() => resolveCloudUploadConflict('overwrite')}>Перезаписать</button>
              <button type="button" className="secondary-button" aria-label="cloud-upload-append" onClick={() => resolveCloudUploadConflict('append')}>Объединить</button>
              <button type="button" className="ghost-button" aria-label="cloud-upload-cancel" onClick={() => resolveCloudUploadConflict('cancel')}>Отмена</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderLocalSaveModal() {
    if (!isLocalSaveModalOpen) return null;
    const activeDraft = getActiveUploadedDraft();
    const canReplace = Boolean(activeDraft && findRecipeBlockInDraft(activeDraft));
    return (
      <div className="modal-backdrop" role="presentation" onClick={() => setIsLocalSaveModalOpen(false)}>
        <div
          className="modal cloud-save-modal"
          role="dialog"
          aria-modal="true"
          aria-label="local-save-choice"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-header">
            <div>
              <h2>Сохранить локально</h2>
              <span className="modal-subtitle">{activeDraft ? activeDraft.name : 'Локальный .zs файл не выбран'}</span>
            </div>
            <button type="button" className="ghost-button" onClick={() => setIsLocalSaveModalOpen(false)}>Закрыть</button>
          </div>
          <div className="settings-modal-body">
            <div className="cloud-save-preview">
              <span>Рецепт</span>
              <strong>{outputRaw}</strong>
            </div>
            <div className="cloud-conflict-actions">
              <button type="button" aria-label="local-save-download" onClick={() => executeLocalSave('download')}>Скачать .zs</button>
              <button type="button" className="secondary-button" aria-label="local-save-append" disabled={!activeDraft} onClick={() => executeLocalSave('append-uploaded')}>Добавить в файл</button>
              <button type="button" className="secondary-button" aria-label="local-save-replace" disabled={!canReplace} onClick={() => executeLocalSave('replace-uploaded')}>Заменить в файле</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderCloudSaveModal() {
    if (!isCloudSaveModalOpen) return null;
    const validation = validateCloudRecipeFilename(cloudSaveNameDraft);
    const visibleError = cloudSaveError || validation.error;
    return (
      <div className="modal-backdrop" role="presentation" onClick={() => { setIsCloudSaveModalOpen(false); setCloudSaveError(''); }}>
        <form
          className="modal cloud-save-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Сохранить рецепт в облако"
          onClick={(event) => event.stopPropagation()}
          onSubmit={(event) => {
            event.preventDefault();
            void submitCloudSave();
          }}
        >
          <div className="modal-header">
            <div>
              <h2>Выгрузить в Облако</h2>
              <span className="modal-subtitle">Сохранение доступно только в папку рецептов. Укажите имя файла, без пути.</span>
            </div>
            <button type="button" className="ghost-button" onClick={() => { setIsCloudSaveModalOpen(false); setCloudSaveError(''); }}>Закрыть</button>
          </div>
          <div className="settings-modal-body">
            <label className="field-block">
              <span>Имя .zs файла</span>
              <input
                aria-label="cloud-save-filename"
                autoFocus
                value={cloudSaveNameDraft}
                onChange={(event) => {
                  setCloudSaveNameDraft(event.target.value);
                  setCloudSaveError('');
                }}
                placeholder="new_recipe.zs"
              />
            </label>
            <div className="cloud-save-preview">
              <span>Файл в облаке</span>
              <strong>{validation.filename ?? '...'}</strong>
            </div>
            {visibleError ? <div className="inline-hint inline-hint-warning">{visibleError}</div> : null}
            <div className="inline-actions cloud-save-actions">
              <button type="button" className="ghost-button" onClick={() => { setIsCloudSaveModalOpen(false); setCloudSaveError(''); }}>Отмена</button>
              <button type="submit" disabled={Boolean(validation.error)}>Сохранить</button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  function renderSaveConflictModal() {
    if (!isSaveConflictModalOpen) return null;
    return (
      <div className="modal-backdrop" role="presentation" onClick={() => setIsSaveConflictModalOpen(false)}>
        <div
          className="modal save-conflict-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Выбор способа сохранения рецепта"
          onClick={(event) => event.stopPropagation()}
          style={{ maxWidth: '600px', width: '100%' }}
        >
          <div className="modal-header">
            <div>
              <h2>Сохранение рецепта</h2>
              <span className="modal-subtitle">
                Рецепт для предмета {outputRaw} уже существует в файлах проекта.
              </span>
            </div>
            <button type="button" className="ghost-button" onClick={() => setIsSaveConflictModalOpen(false)}>Закрыть</button>
          </div>
          <div className="settings-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            <div className="conflict-files-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
              {saveConflictMatches.map((match) => {
                const filePath = match.source.path || 'Неизвестный файл';
                const fileName = filePath.split(/[\\/]/).pop() || filePath;
                return (
                  <div key={match.recipe_uid} className="conflict-file-item" style={{
                    border: '1px solid var(--border-color, #3f3f46)',
                    borderRadius: '6px',
                    padding: '12px',
                    background: 'var(--bg-secondary, #18181b)'
                  }}>
                    <div style={{ marginBottom: '12px', wordBreak: 'break-all' }}>
                      <strong style={{ display: 'block', fontSize: '1.1em', marginBottom: '4px' }}>{fileName}</strong>
                      <span style={{ fontSize: '0.85em', color: 'var(--text-muted, #a1a1aa)' }}>{filePath}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => void executeConflictSaveOverwrite(match)}
                      >
                        Перезаписать рецепт
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void executeConflictSaveAdditional(filePath)}
                      >
                        Сохранить как дополнительный
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="inline-actions" style={{ borderTop: '1px solid var(--border-color, #3f3f46)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setIsSaveConflictModalOpen(false);
                  openCloudSaveModal();
                }}
              >
                Сохранить в отдельный файл
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setIsSaveConflictModalOpen(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderDraftCatalogIcon(raw: string) {
    let resolvedRaw = raw;
    if (raw.startsWith('<ore:') && raw.endsWith('>')) {
      const group = raw.slice(5, -1);
      const items = oreDictGroups[group.toLowerCase()] || [];
      if (items.length > 0) {
        const priorityMod = oreDictIconPriority[group];
        if (priorityMod) {
          const matched = items.find(item => item.toLowerCase().includes(priorityMod.toLowerCase()));
          if (matched) resolvedRaw = matched;
          else resolvedRaw = items[0];
        } else {
          resolvedRaw = items[0];
        }
      }
    }

    const modIconStyle = buildModIconStyle(modIconManifest, getModIconEntryForRaw(resolvedRaw));
    if (modIconStyle) {
      return <span className="nei-atlas-icon" style={modIconStyle} aria-hidden="true" />;
    }
    const atlasEntry = resolveAtlasEntryFromRaw(itemPanelAtlas, resolvedRaw, wildcardCycleTick);
    const atlasStyle = itemPanelAtlas && atlasEntry ? buildAtlasIconStyle(itemPanelAtlas, atlasEntry) : undefined;
    const iconUrl = itemSearchIcons[resolvedRaw];
    if (atlasStyle) {
      return <span className="nei-atlas-icon" style={atlasStyle} aria-hidden="true" />;
    }
    if (iconUrl) {
      return <img src={iconUrl} alt="" onError={() => setItemSearchIcons((current) => ({ ...current, [resolvedRaw]: null }))} />;
    }
    return null;
  }

  function renderDraftItemsPanel() {
    return (
      <div className="workspace-panel-shell panel-draft-items">
        <Panel title="Черновики" subtitle="Только предметы с сохранёнными шаблонами" className="draft-items-panel">
          <div className="draft-filter-grid">
            <input aria-label="draft-item-search" type="search" value={draftItemSearchQuery} onChange={(event) => setDraftItemSearchQuery(event.target.value)} placeholder="Поиск шаблона, mod:item или ID" />
            <select aria-label="draft-item-sort" value={draftItemSortMode} onChange={(event) => setDraftItemSortMode(event.target.value as DraftItemSortMode)}>
              <option value="date-desc">Сначала новые</option>
              <option value="date-asc">Сначала старые</option>
              <option value="drafts-desc">Сначала больше черновиков</option>
              <option value="drafts-asc">Сначала меньше черновиков</option>
              <option value="name">По названию</option>
            </select>
            <select aria-label="draft-item-group" value={draftItemGroupMode} onChange={(event) => setDraftItemGroupMode(event.target.value as DraftItemGroupMode)}>
              <option value="none">Без группировки</option>
              <option value="mod">По моду</option>
              <option value="author">По персоналу</option>
              <option value="date">По дате</option>
              <option value="grid-size">По типу сетки</option>
            </select>
          </div>
          <div className="nei-pager" aria-label="draft-item-pagination">
            <button type="button" className="ghost-button icon-button" aria-label="draft-items-prev-page" disabled={draftItemPage <= 0} onClick={() => changeDraftItemPage(-1)}>‹</button>
            <strong>{draftItemPage + 1}/{draftItemPageCount}</strong>
            <button type="button" className="ghost-button icon-button" aria-label="draft-items-next-page" disabled={draftItemPage >= draftItemPageCount - 1} onClick={() => changeDraftItemPage(1)}>›</button>
          </div>
          <div className="draft-item-list" aria-label="draft-item-list">
            {draftItemsPage.length === 0 ? (
              <div className="draft-empty-state">Нет сохранённых шаблонов.</div>
            ) : groupedDraftItems.map((group) => {
              const isCollapsed = Boolean(collapsedDraftGroups[group.key]);
              return (
                <div key={group.key} className="draft-item-group">
                  {draftItemGroupMode !== 'none' && (
                    <button
                      type="button"
                      className={`draft-group-header${isCollapsed ? ' is-collapsed' : ''}`}
                      onClick={() => setCollapsedDraftGroups((curr) => ({ ...curr, [group.key]: !isCollapsed }))}
                    >
                      <span className="draft-group-chevron" aria-hidden="true">▼</span>
                      {group.name}
                    </button>
                  )}
                  {!isCollapsed && (
                    <div className={`draft-group-items${draftItemGroupMode !== 'none' ? ' has-header' : ''}`}>
                      {group.items.map((entry) => {
                        const raw = entry.raw;
                        const draftCount = entry.draftCount;
                        const availability = getRecipeAvailability(raw);
                        const selected = raw === selectedDraftItemRaw;
                        const icon = renderDraftCatalogIcon(raw);
                        const nbtClass = entry.hasNbt ? 'has-nbt' : 'no-nbt';
                        return (
                          <button
                            key={raw}
                            type="button"
                            className={`draft-item-button recipe-${availability} ${nbtClass} ${draftCount > 0 ? 'has-drafts' : ''} ${selected ? 'active' : ''}`.trim()}
                            aria-label={`draft-item-${raw}`}
                            data-item-raw={raw}
                            onMouseEnter={() => updateHoveredItemRaw(raw)}
                            onFocus={() => updateHoveredItemRaw(raw)}
                            onMouseLeave={() => updateHoveredItemRaw((current) => (current === raw ? null : current))}
                            onBlur={() => updateHoveredItemRaw((current) => (current === raw ? null : current))}
                            onClick={() => setSelectedDraftItemRaw(raw)}
                          >
                            <span className={`nei-icon ${icon ? 'has-icon' : 'is-loading'}`}>
                              {icon}
                            </span>
                            {draftCount > 0 ? <span className="draft-count-badge">{draftCount}</span> : null}
                            {renderItemTooltip(raw)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    );
  }

  function renderDraftTemplatesPanel() {
    const selectedTitle = selectedDraftItemRaw ? resolveCellTitle(selectedDraftItemRaw) : 'Предмет не выбран';
    const draftPreviewAtlasUrl = itemPanelAtlas ? normalizeAtlasImageUrl(itemPanelAtlas.image_url) : '';
    return (
      <div className="workspace-panel-shell panel-draft-templates">
        <Panel title="Шаблоны" subtitle={selectedDraftItemRaw ?? 'Выберите предмет слева'} className="draft-templates-panel">
          {selectedDraftItemRaw ? (
            <div className="draft-selected-item">
              <span className="output-icon-slot draft-selected-icon">{renderCraftItemIcon(selectedDraftItemRaw, undefined, false, 1, selectedTitle)}</span>
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
                    <button type="button" aria-label="edit-selected-draft-template" onClick={() => openRecipeDraftTemplate(activeDraftPreview)}>Редактировать рецепт</button>
                  </div>
                  <div className="draft-preview-grid">
                  <RecipeGrid matrix={activeDraftPreview.recipe.matrix} atlas={itemPanelAtlas} atlasImageUrl={draftPreviewAtlasUrl} displayMode={uiPreferences.display_mode} animationsEnabled={areAnimationsEnabled} editorMode="view" extremeGroupGap={uiPreferences.workspace_layout.extreme_grid_gap ?? 8} heldItemRaw={null} resolveCellTitle={resolveCellTitle} resolveIconStyle={resolveRecipeGridIconStyle} renderItemTooltip={renderItemTooltip} onItemHover={() => undefined} onCellClick={() => undefined} onCellContextMenu={() => undefined} onCellChange={() => undefined} />
                  </div>
                </div>
              ) : null}
              <div className="draft-template-list" aria-label="draft-template-list">
                {selectedDraftTemplates.map((draft) => {
                  const active = draft.id === activeDraftPreview?.id;
                  return (
                    <div
                      key={draft.id}
                      className={`draft-template-card ${active ? 'active' : ''}`.trim()}
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
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setDraftTemplateContextMenu({ draftId: draft.id, x: event.clientX, y: event.clientY });
                      }}
                    >
                      <div className="draft-template-card-head">
                        <div className="draft-template-main">
                          <strong>{draft.name}</strong>
                          <span>{new Date(draft.updatedAt).toLocaleString()}</span>
                          <span>{draft.createdByEmail}</span>
                        </div>
                        <span className="draft-template-status">{active ? 'В превью' : 'Просмотр'}</span>
                      </div>
                      <div className="draft-template-actions">
                        <button
                          type="button"
                          className="secondary-button draft-template-edit"
                          aria-label={`edit-draft-template-${draft.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openRecipeDraftTemplate(draft);
                          }}
                        >
                          Редактировать рецепт
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="inline-hint inline-hint-warning">Нет шаблонов для выбранного предмета.</div>
          )}
        </Panel>
      </div>
    );
  }

  function renderTextureToolsPanel() {
    return (
      <div className="workspace-panel-shell panel-textures">
        <Panel title={t('textures.modsDropdown')} subtitle={uiPreferences.language === 'ru' ? 'Кэш иконок из itempanel.csv' : 'Icon cache from itempanel.csv'} className="texture-panel">
          <div className="texture-toolbar">
            <button type="button" className="secondary-button" aria-expanded={isTextureModsOpen} onClick={() => setIsTextureModsOpen((value) => !value)}>{t('textures.modsDropdown')}</button>
            <button type="button" onClick={() => void loadSelectedTextures()} disabled={textureLoadState === 'running' || textureLoadState === 'paused'}>{t('textures.loadSelected')}</button>
            {textureLoadState === 'running' ? (
              <button type="button" className="ghost-button" onClick={handlePauseTextureLoading}>{t('textures.stop')}</button>
            ) : null}
            {textureLoadState === 'paused' ? (
              <button type="button" className="ghost-button" onClick={handleResumeTextureLoading}>{t('textures.resume')}</button>
            ) : null}
            {textureLoadState !== 'idle' ? (
              <button type="button" className="ghost-button" onClick={handleCancelTextureLoading}>{t('textures.cancel')}</button>
            ) : null}
          </div>
          {textureLoadStatus ? <div className="inline-status inline-status-default texture-status-line">{textureLoadStatus}</div> : null}
          <div className="texture-menu-header">
            <strong>{uiPreferences.language === 'ru' ? 'Моды' : 'Mods'}</strong>
            <div className="view-menu-actions">
              <button type="button" className="ghost-button" onClick={() => setAllTextureModSelections(true)}>{t('textures.selectAll')}</button>
              <button type="button" className="ghost-button" onClick={() => setAllTextureModSelections(false)}>{t('textures.clearAll')}</button>
            </div>
          </div>
          {isTextureModsOpen && itemPanelModSummaries.length ? (
            <ul className="toolbar-texture-list texture-list-panel">
              {itemPanelModSummaries.map((summary) => (
                <li key={summary.modid} className="toolbar-texture-item">
                  <label className="view-toggle" aria-label={`select-mod-${summary.modid}`}>
                    <input
                      type="checkbox"
                      checked={selectedTextureMods[summary.modid] ?? true}
                      onChange={(event) => toggleTextureModSelection(summary.modid, event.target.checked)}
                    />
                    <span>{summary.modid}</span>
                  </label>
                  <span>{summary.itemCount}</span>
                  <span>{t('textures.progress')}: {summary.completionText}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {isTextureModsOpen && !itemPanelModSummaries.length ? <p className="toolbar-texture-empty">{t('textures.empty')}</p> : null}
          {!isTextureModsOpen ? (
            <div className="kv-grid">
              <div><span>{uiPreferences.language === 'ru' ? 'Модов' : 'Mods'}</span><strong>{itemPanelModSummaries.length}</strong></div>
              <div><span>{t('status.icons')}</span><strong>{iconsResolved}/{iconTotal}</strong></div>
              <div><span>{t('textures.progress')}</span><strong>{itemPanelModSummaries.find((summary) => selectedTextureMods[summary.modid] ?? true)?.completionText ?? '0%'}</strong></div>
            </div>
          ) : null}
        </Panel>
      </div>
    );
  }

  function renderAdminUsersContent() {
    return (
      <>
          <div className="admin-users-toolbar">
            <button type="button" className="secondary-button" onClick={() => void refreshAdminUsers()}>Обновить</button>
            <span>{adminUsersStatus}</span>
          </div>
          <div className="admin-users-list">
            {adminUsers.map((user) => (
              <div key={user.id} className="admin-user-row">
                <div className="user-chip" title={user.email}>
                  {user.avatar_url ? <img src={user.avatar_url} alt="" /> : null}
                  <span>{user.email}</span>
                  {user.is_root_admin ? <strong>root</strong> : null}
                </div>
                <select
                  aria-label={`role-${user.email}`}
                  value={user.role}
                  disabled={user.is_root_admin}
                  onChange={(event) => void changeAdminUserRole(user.id, event.target.value as UserRole)}
                >
                  <option value="default">default</option>
                  <option value="moderator">moderator</option>
                  <option value="admin">admin</option>
                </select>
              </div>
            ))}
          </div>
      </>
    );
  }

  function renderAccessControlContent() {
    return (
      <div className="access-control-panel">
        <div className="admin-users-toolbar">
          <button type="button" className="secondary-button" onClick={() => void refreshAccessControl()}>Обновить whitelist</button>
          <span>{accessStatus}</span>
        </div>
        <label className="switch-field">
          <span>Whitelist режим</span>
          <input
            aria-label="whitelist-enabled"
            type="checkbox"
            checked={accessControl.whitelist_enabled}
            onChange={(event) => void saveAccessControl(event.target.checked)}
          />
        </label>
        <label className="field-block">
          <span>Whitelist email</span>
          <textarea
            aria-label="whitelist-emails"
            value={accessWhitelistDraft}
            onChange={(event) => setAccessWhitelistDraft(event.target.value)}
          />
        </label>
        <button type="button" className="secondary-button" aria-label="save-whitelist" onClick={() => void saveAccessControl()}>Сохранить whitelist</button>
      </div>
    );
  }

  function renderAdminUsersPanel() {
    if (!canManageRoles) return null;
    return (
      <div className="workspace-panel-shell panel-admin-users">
        <Panel title="Персонал" subtitle="Роли и доступ по Google почте">
          {renderAdminUsersContent()}
          {renderAccessControlContent()}
        </Panel>
      </div>
    );
  }

  function renderDebugEventsList() {
    if (!hotkeyDebugEvents.length) {
      return <div className="inline-hint">Debug включен, но событий пока нет. Выполни действие в интерфейсе, чтобы оно появилось здесь.</div>;
    }
    return (
      <ol className="debug-log-list">
        {hotkeyDebugEvents.map((entry) => (
          <li key={entry.id} className={`debug-log-event debug-log-${entry.level}`}>
            <div className="debug-log-event-head">
              <span>{entry.timestamp}</span>
              <strong>{entry.message}</strong>
              <em>{debugCategoryLabels[entry.category]}</em>
              <code>{entry.level}</code>
            </div>
            {entry.details ? (
              <dl>
                {Object.entries(entry.details).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        ))}
      </ol>
    );
  }

  function renderItemCaseAliasPanel() {
    const report = itemCaseAliasReport;
    const summary = report?.summary;
    const manualAliases = report?.manualItemAliases ?? {};
    const logAliases = report?.logItemAliases ?? {};
    const matchedByKey = new Map((report?.matchedItems ?? []).map((item) => [item.lower_key, item]));
    const missingByKey = new Map((report?.missingItems ?? []).map((item) => [item.lower_key, item]));
    const aliasRows = report
      ? Object.entries(report.itemAliases)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([lowerKey, original]) => ({
          lowerKey,
          original,
          source: manualAliases[lowerKey] ? 'manual' : logAliases[lowerKey] ? 'log' : 'auto',
          item: matchedByKey.get(lowerKey) ?? missingByKey.get(lowerKey) ?? null
        }))
      : [];
    return (
      <div className="debug-section-grid">
        <section className="settings-section">
          <div className="settings-section-title">
            <h3>Словарь регистра</h3>
            <span>Временный lowercase → original-case словарь из загруженных в Облако .zs и сверка с itempanel.csv.</span>
          </div>
          <div className="file-actions">
            <button type="button" className="secondary-button" disabled={!canManageModIcons || itemCaseAliasGenerating} onClick={() => void handleGenerateItemCaseAliasReport()}>Сгенерировать отчет</button>
            <button type="button" className="ghost-button" disabled={!canManageModIcons || itemCaseAliasGenerating} onClick={() => void refreshItemCaseAliasReport()}>Обновить статус</button>
          </div>
          <label className="case-alias-log-upload">
            <span>fml-client-latest.log</span>
            <input aria-label="item-case-alias-fml-log" type="file" accept=".log,text/plain" disabled={!canManageModIcons || itemCaseAliasLogUploading} onChange={(event) => {
              void handleItemCaseAliasLogFiles(event.target.files ?? []);
              event.target.value = '';
            }} />
          </label>
          {itemCaseAliasStatus ? <div className="inline-status inline-status-default">{itemCaseAliasStatus}</div> : null}
          {summary ? (
            <div className="kv-grid">
              <div><span>Файлов .zs</span><strong>{summary.scriptFiles}</strong></div>
              <div><span>Item refs</span><strong>{summary.scriptItemRefs}</strong></div>
              <div><span>Уникальных ключей</span><strong>{summary.uniqueItemKeys}</strong></div>
              <div><span>Mixed-case</span><strong>{summary.mixedCaseItemAliases}</strong></div>
              <div><span>Совпало с itempanel</span><strong>{summary.matchedItemKeys}</strong></div>
              <div><span>Не найдено</span><strong>{summary.missingItemKeys}</strong></div>
              <div><span>Из FML log</span><strong>{summary.logItemAliases ?? Object.keys(logAliases).length}</strong></div>
              <div><span>Ручных значений</span><strong>{summary.manualItemAliases ?? Object.keys(manualAliases).length}</strong></div>
              <div><span>Конфликтов item</span><strong>{summary.itemConflicts}</strong></div>
              <div><span>Мобов/NBT ids</span><strong>{summary.uniqueEntityKeys}</strong></div>
            </div>
          ) : (
            <div className="inline-hint inline-hint-warning">Отчет еще не создан. Нажми генерацию, чтобы собрать словарь и список пропусков.</div>
          )}
          {report ? (
            <div className="case-alias-paths">
              <span>Источник: <code>{report.sourceLabel ?? summary?.sourceLabel ?? summary?.scriptsDir ?? 'Облако'}</code></span>
              <span>Словарь: <code>{report.aliasesPath}</code></span>
              <span>Отчет: <code>{report.reportPath}</code></span>
              {report.fmlLogAliasesPath ? <span>FML log: <code>{report.fmlLogAliasesPath}</code></span> : null}
              {report.fmlLogSummary ? <span>FML source: <code>{report.fmlLogSummary.sourceFilename ?? 'fml-client-latest.log'} ({report.fmlLogSummary.totalMatches} строк)</code></span> : null}
              {report.manualAliasesPath ? <span>Ручные значения: <code>{report.manualAliasesPath}</code></span> : null}
            </div>
          ) : null}
        </section>
        <section className="settings-section">
          <div className="settings-section-title">
            <h3>Добавить вручную</h3>
            <span>Ключ хранится в нижнем регистре, значение сохраняет оригинальный регистр из рецепта.</span>
          </div>
          <div className="case-alias-manual-form">
            <label className="field-block">
              <span>Ключ lowercase</span>
              <input aria-label="manual-alias-key" type="text" value={manualAliasKey} onChange={(event) => setManualAliasKey(event.target.value)} placeholder="draconicevolution:customspawner" />
            </label>
            <label className="field-block">
              <span>Значение original-case</span>
              <input aria-label="manual-alias-value" type="text" value={manualAliasValue} onChange={(event) => setManualAliasValue(event.target.value)} placeholder="DraconicEvolution:customSpawner" />
            </label>
            <button type="button" className="secondary-button" aria-label="save-manual-alias" disabled={!canManageModIcons || manualAliasSaving} onClick={() => void handleSaveManualItemCaseAlias()}>Добавить в словарь</button>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section-title">
            <h3>Таблица словаря</h3>
            <span>{aliasRows.length ? `${aliasRows.length} значений` : 'Словарь появится после генерации или ручного добавления.'}</span>
          </div>
          {aliasRows.length ? (
            <div className="case-alias-table-wrap">
              <table className="case-alias-table">
                <thead>
                  <tr>
                    <th>lowercase key</th>
                    <th>original-case</th>
                    <th>Источник</th>
                    <th>Файлы</th>
                  </tr>
                </thead>
                <tbody>
                  {aliasRows.map((row) => (
                    <tr key={row.lowerKey}>
                      <td><code>{row.lowerKey}</code></td>
                      <td><code>{row.original}</code></td>
                      <td><span className={`case-alias-source case-alias-source-${row.source}`}>{row.source === 'manual' ? 'ручной' : row.source === 'log' ? 'log' : 'cloud'}</span></td>
                      <td>{row.item?.files.slice(0, 3).join(', ') ?? (row.source === 'log' ? report.fmlLogSummary?.sourceFilename ?? 'fml-client-latest.log' : '-')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
        <section className="settings-section">
          <div className="settings-section-title">
            <h3>Не найдено в itempanel</h3>
            <span>{summary ? `${summary.missingItemKeys} ключей` : 'Список появится после генерации.'}</span>
          </div>
          {report?.missingByMod && report.missingByMod.length ? (
            <div className="missing-mod-list">
              {report.missingByMod.slice(0, 16).map((item) => (
                <div key={item.modid} className="admin-file-row">
                  <strong>{item.modid || 'unknown'}</strong>
                  <span>{item.count}</span>
                </div>
              ))}
            </div>
          ) : null}
          {report?.missingItems && report.missingItems.length ? (
            <div className="admin-file-list case-alias-missing-list">
              {report.missingItems.slice(0, 80).map((item) => (
                <div key={item.lower_key} className="admin-file-row">
                  <div>
                    <strong>{item.original}</strong>
                    <span>{item.lower_key}</span>
                  </div>
                  <span>{item.files[0] ?? ''}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  function renderDebugSectionContent() {
    const selectedTextureCount = itemPanelModSummaries.filter((summary) => selectedTextureMods[summary.modid] ?? true).length;
    const canSaveActions = Boolean(getValidOutputRaw()) && (canCreateTemplates || canEditRecipes);
    const rawPayload = {
      recipe,
      matrix,
      outputRaw,
      status,
      saveStatus,
      lastApiStatus,
      lastParseResult,
      workspaceTab,
      heldItemRaw,
      hoveredItemRaw,
      uiPreferences,
      debugFilters,
      debugLevelFilters,
      backendAvailable,
      textureLoadState,
      textureLoadStatus,
      cloudStatus,
      buttons: {
        saveLocal: canSaveActions,
        saveCloud: canSaveActions,
        saveDraft: canSaveActions,
        clear: canCreateTemplates || canEditRecipes,
        back: recipeBackHistory.length > 0,
        forward: recipeForwardHistory.length > 0
      },
      uploadedDrafts: uploadedDrafts.map((draft) => ({ id: draft.id, name: draft.name, size: draft.size, lastModified: draft.lastModified })),
      recipeDraftTemplates: recipeDraftTemplates.map((draft) => ({ id: draft.id, outputRaw: draft.outputRaw, name: draft.name, createdByEmail: draft.createdByEmail, updatedAt: draft.updatedAt }))
    };
    const iconLabSampleRaw = outputRaw || visibleNeiRawItems[0] || '<minecraft:planks>';
    const iconLabSampleTitle = resolveCellTitle(iconLabSampleRaw) || iconLabSampleRaw;
    const iconLabUsesOutput = Boolean(outputRaw) && iconLabSampleRaw === outputRaw;
    const iconLabIconUrl = iconLabUsesOutput ? recipe.output_resolution?.icon_url : itemSearchIcons[iconLabSampleRaw];
    const iconLabAnimated = iconLabUsesOutput ? recipe.output_resolution?.animated : false;
    const iconLabFrameTime = iconLabUsesOutput ? recipe.output_resolution?.animation_meta?.frametime : undefined;

    switch (debugSection) {
      case 'modIcons':
        return canManageModIcons ? renderModIconsPanel() : <div className="inline-hint inline-hint-warning">Управление иконками доступно только администраторам.</div>;
      case 'iconSettings':
        return canManageSettings ? (
          <IconSettingsPanel
            settings={uiPreferences.icon_surfaces}
            renderSampleIcon={() => renderCraftItemIcon(iconLabSampleRaw, iconLabIconUrl, iconLabAnimated, iconLabFrameTime, iconLabSampleTitle)}
            onChange={patchIconSurface}
            onResetAll={resetIconSurfaces}
          />
        ) : <div className="inline-hint inline-hint-warning">Настройки иконок доступны только администраторам.</div>;
      case 'iconLab':
        return (
          <IconScaleLab
            sampleRaw={iconLabSampleRaw}
            sampleTitle={iconLabSampleTitle}
            renderSampleIcon={() => renderCraftItemIcon(iconLabSampleRaw, iconLabIconUrl, iconLabAnimated, iconLabFrameTime, iconLabSampleTitle)}
          />
        );
      case 'access':
        return (
          <div className="debug-section-grid">
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>Персонал</h3>
                <span>Роли пользователей и доступ по Google почте.</span>
              </div>
              {canManageRoles ? renderAdminUsersContent() : <div className="inline-hint inline-hint-warning">Управление ролями доступно только администраторам.</div>}
            </section>
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>Whitelist</h3>
                <span>Допуск операторов и админов на сайт.</span>
              </div>
              {canManageRoles ? renderAccessControlContent() : null}
            </section>
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>Доступ по ролям</h3>
                <span>Справочник текущих ролей сайта.</span>
              </div>
              <div className="permissions-grid">
                <div><strong>admin</strong><span>файлы, рецепты, настройки, роли, отладка</span></div>
                <div><strong>moderator</strong><span>создание шаблонов и черновиков</span></div>
                <div><strong>default</strong><span>только просмотр</span></div>
              </div>
            </section>
          </div>
        );
      case 'caseAliases':
        return renderItemCaseAliasPanel();
      case 'oreDictPriority':
        return renderOreDictPriorityPanel();
      case 'modReplacement':
        return renderModReplacementPanel();
      case 'recipe':
        return (
          <div className="debug-section-grid">
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>Рецепт</h3>
                <span>Состояние текущей сетки и результата.</span>
              </div>
              <div className="kv-grid">
                <div><span>Тип</span><strong>{recipe.recipe_type}</strong></div>
                <div><span>Позиция</span><strong>{recipeBindingMode}</strong></div>
                <div><span>Размер</span><strong>{summary}</strong></div>
                <div><span>Заполнено</span><strong>{filledCells}</strong></div>
                <div><span>Пусто</span><strong>{nullCells}</strong></div>
                <div><span>Проблемных ячеек</span><strong>{unresolvedCells}</strong></div>
              </div>
            </section>
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>Output</h3>
                <span>{outputDisplayName ?? outputRaw}</span>
              </div>
              <div className="recipe-uses-output">
                <span className="output-icon-slot">{renderCraftItemIcon(outputRaw, recipe.output_resolution?.icon_url, recipe.output_resolution?.animated, recipe.output_resolution?.animation_meta?.frametime, outputDisplayName ?? outputRaw)}</span>
                <div>
                  <strong>{outputRaw}</strong>
                  <span>{recipe.output_resolution?.icon_url ? 'Иконка найдена' : 'Иконка не найдена'}</span>
                </div>
              </div>
            </section>
          </div>
        );
      case 'runtime':
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
                <div><span>Texture mods</span><strong>{selectedTextureCount}/{itemPanelModSummaries.length}</strong></div>
                <div><span>Cloud</span><strong>{cloudStatus || 'idle'}</strong></div>
                <div><span>Шаблонов</span><strong>{recipeDraftTemplates.length}</strong></div>
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
                <div><span>Clear</span><strong>{canCreateTemplates || canEditRecipes ? 'enabled' : 'disabled'}</strong></div>
                <div><span>Back</span><strong>{recipeBackHistory.length ? 'enabled' : 'disabled'}</strong></div>
                <div><span>Forward</span><strong>{recipeForwardHistory.length ? 'enabled' : 'disabled'}</strong></div>
              </div>
            </section>
          </div>
        );
      case 'logs':
        return (
          <div className="debug-section-grid">
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>Фильтры вывода</h3>
                <span>Эти же настройки доступны в модальном окне настроек.</span>
              </div>
              <div className="debug-filter-grid">
                {Object.entries(debugCategoryLabels).map(([category, label]) => (
                  <label key={category} className="view-toggle">
                    <input type="checkbox" checked={debugFilters[category as DebugCategory]} onChange={(event) => toggleDebugFilter(category as DebugCategory, event.target.checked)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <div className="debug-filter-grid">
                {Object.entries(debugLevelLabels).map(([level, label]) => (
                  <label key={level} className="view-toggle">
                    <input type="checkbox" checked={debugLevelFilters[level as HotkeyDebugLevel]} onChange={(event) => toggleDebugLevel(level as HotkeyDebugLevel, event.target.checked)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </section>
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>Лента событий</h3>
                <span>{isHotkeyDebugActive ? `Событий: ${hotkeyDebugEvents.length}` : 'Debug выключен в настройках.'}</span>
              </div>
              {renderDebugEventsList()}
            </section>
          </div>
        );
      case 'raw':
        return <pre className="raw-block debug-raw-block">{JSON.stringify(rawPayload, null, 2)}</pre>;
      default:
        return (
          <div className="debug-section-grid">
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>Статус</h3>
                <span>{status}</span>
              </div>
              <StatusBar items={statusItems} />
            </section>
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>Диагностика</h3>
                <span>Краткая проверка текущего рецепта.</span>
              </div>
              <ul className="diagnostics-list">
                <li>Unresolved cells: {unresolvedCells}</li>
                <li>Output icon: {recipe.output_resolution?.icon_url ?? 'not found'}</li>
                <li>Current file: {recipe.source.path ?? 'unsaved'}</li>
              </ul>
            </section>
            <section className="settings-section">
              <div className="settings-section-title">
                <h3>Быстрый debug</h3>
                <span>Последние ключевые состояния.</span>
              </div>
              <div className="kv-grid">
                <div><span>Последний API</span><strong>{lastApiStatus}</strong></div>
                <div><span>Parse result</span><strong>{lastParseResult}</strong></div>
                <div><span>Иконка output</span><strong>{recipe.output_resolution?.icon_url ? 'найдена' : 'нет'}</strong></div>
                <div><span>Debug</span><strong>{isHotkeyDebugActive ? 'включен' : 'выключен'}</strong></div>
              </div>
            </section>
          </div>
        );
    }
  }

  function renderOreDictPriorityPanel() {
    const groupsWithMultipleMods = Object.entries(oreDictGroups).filter(([, items]) => {
      const mods = new Set(items.map(item => parseItemRaw(item)?.key.split(':')[0] || 'unknown'));
      return mods.size > 1;
    }).sort((a, b) => a[0].localeCompare(b[0]));

    return (
      <div className="workspace-layout workspace-layout-admin">
        <div className="workspace-column workspace-left">
          <div className="workspace-panel-shell panel-admin-mod-icons">
            <Panel title="Приоритет модов OreDict" subtitle="Выбор мода по умолчанию для отображения иконки группы">
              <section className="settings-section">
                <div className="settings-section-title">
                  <h3>Группы с несколькими вариантами</h3>
                  <span>Настройка сохраняется локально в браузере.</span>
                </div>
                {groupsWithMultipleMods.length === 0 ? (
                  <div className="inline-hint">Нет групп с предметами из разных модов (или словарь не загружен).</div>
                ) : (
                  <div className="case-alias-table-wrap">
                    <table className="case-alias-table">
                      <thead>
                        <tr>
                          <th>Группа</th>
                          <th>Доступные моды</th>
                          <th>Приоритет</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupsWithMultipleMods.map(([group, items]) => {
                          const mods = Array.from(new Set(items.map(item => parseItemRaw(item)?.key.split(':')[0] || 'unknown')));
                          const currentPriority = oreDictIconPriority[group] || '';
                          return (
                            <tr key={group}>
                              <td><code>ore:{group}</code></td>
                              <td>{mods.join(', ')}</td>
                              <td>
                                <select 
                                  value={currentPriority}
                                  onChange={(e) => setOreDictIconPriority(curr => ({ ...curr, [group]: e.target.value }))}
                                  style={{ width: '100%', padding: '4px', background: 'var(--surface-sunken)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}
                                >
                                  <option value="">(первый попавшийся)</option>
                                  {mods.map(mod => <option key={mod} value={mod}>{mod}</option>)}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </Panel>
          </div>
        </div>
      </div>
    );
  }

  async function handleScanReplacement(modid: string) {
    if (!modid) {
      setScannedReplacementItems([]);
      setReplacementMappings({});
      return;
    }
    setReplacementLoading(true);
    setReplacementStatus(uiPreferences.language === 'ru' ? 'Сканирую крафты...' : 'Scanning recipes...');
    try {
      const response = await scanModReplacement(modid);
      setScannedReplacementItems(response.items);
      const initial: Record<string, string> = {};
      response.items.forEach((item) => {
        initial[item.raw] = '';
      });
      setReplacementMappings(initial);
      setReplacementStatus(
        uiPreferences.language === 'ru'
          ? `Найдено предметов: ${response.items.length}`
          : `Found items: ${response.items.length}`
      );
    } catch (error) {
      setReplacementStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setReplacementLoading(false);
    }
  }

  async function handleReplaceModItems() {
    if (!selectedReplacementMod) return;
    
    const activeReplacements: Record<string, string> = {};
    let hasUnmapped = false;
    scannedReplacementItems.forEach((item) => {
      const mapped = replacementMappings[item.raw];
      if (mapped) {
        activeReplacements[item.raw] = mapped;
      } else {
        hasUnmapped = true;
      }
    });

    if (hasUnmapped) {
      const msg = uiPreferences.language === 'ru'
        ? 'Пожалуйста, заполните все пустые ячейки перед заменой!'
        : 'Please fill all empty slots before replacing!';
      alert(msg);
      return;
    }

    if (Object.keys(activeReplacements).length === 0) {
      const msg = uiPreferences.language === 'ru'
        ? 'Нет предметов для замены.'
        : 'No items to replace.';
      alert(msg);
      return;
    }

    const confirmMsg = uiPreferences.language === 'ru'
      ? `Вы действительно хотите заменить ${Object.keys(activeReplacements).length} предметов во всех рецептах? Это изменит файлы конфигурации.`
      : `Are you sure you want to replace ${Object.keys(activeReplacements).length} items in all recipes? This will modify configuration files.`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    setReplacementLoading(true);
    setReplacementStatus(uiPreferences.language === 'ru' ? 'Заменяю предметы во всех файлах...' : 'Replacing items in all files...');
    try {
      const response = await replaceModItems(selectedReplacementMod, activeReplacements);
      const successMsg = uiPreferences.language === 'ru'
        ? `Успешно заменено предметов: ${response.count} в ${response.files.length} файлах!`
        : `Successfully replaced ${response.count} items in ${response.files.length} files!`;
      setReplacementStatus(successMsg);
      alert(successMsg);
      void handleScanReplacement(selectedReplacementMod);
    } catch (error) {
      setReplacementStatus(error instanceof Error ? error.message : String(error));
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setReplacementLoading(false);
    }
  }

  useEffect(() => {
    if (workspaceTab === 'technical' && debugSection === 'modReplacement' && selectedReplacementMod) {
      void handleScanReplacement(selectedReplacementMod);
    }
  }, [selectedReplacementMod, workspaceTab, debugSection]);

  function renderModReplacementPanel() {
    return (
      <div className="workspace-layout workspace-layout-admin" style={{ display: 'flex', gap: '16px', height: 'calc(100vh - 120px)' }}>
        <div className="workspace-column workspace-left" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Panel title={uiPreferences.language === 'ru' ? 'Замена модификации' : 'Mod Replacement'} subtitle={uiPreferences.language === 'ru' ? 'Позволяет массово заменить все предметы выбранного мода на новые аналоги в рецептах' : 'Allows bulk replacing all items of the selected mod with new counterparts in recipes'}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ marginBottom: '16px' }}>
                <label className="field-block">
                  <span>{uiPreferences.language === 'ru' ? 'Выберите модификацию для замены:' : 'Select modification to replace:'}</span>
                  <select
                    value={selectedReplacementMod}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedReplacementMod(val);
                      void handleScanReplacement(val);
                    }}
                    style={{ width: '100%', padding: '8px', background: 'var(--surface-sunken)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}
                  >
                    <option value="">-- {uiPreferences.language === 'ru' ? 'Выберите мод' : 'Select mod'} --</option>
                    {itemPanelModSummaries.map((mod) => (
                      <option key={mod.modid} value={mod.modid}>
                        {mod.modid} ({mod.itemCount} {uiPreferences.language === 'ru' ? 'предм.' : 'items'})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {replacementStatus ? (
                <div className="inline-status inline-status-default" style={{ marginBottom: '16px' }}>
                  <span>{replacementStatus}</span>
                </div>
              ) : null}

              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '4px', background: 'var(--surface-sunken)', minHeight: '300px' }}>
                {scannedReplacementItems.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {selectedReplacementMod ? (uiPreferences.language === 'ru' ? 'Нет предметов этого мода в рецептах.' : 'No items of this mod found in recipes.') : (uiPreferences.language === 'ru' ? 'Выберите мод для сканирования.' : 'Select a mod to scan.')}
                  </div>
                ) : (
                  <table className="case-alias-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
                        <th style={{ padding: '8px' }}>{uiPreferences.language === 'ru' ? 'Оригинальный предмет' : 'Original Item'}</th>
                        <th style={{ padding: '8px', width: '40px', textAlign: 'center' }}></th>
                        <th style={{ padding: '8px' }}>{uiPreferences.language === 'ru' ? 'Новый предмет (замена)' : 'New Item (replacement)'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scannedReplacementItems.map((item) => {
                        const mapped = replacementMappings[item.raw] || '';
                        
                        const handleSlotClick = () => {
                          if (heldItemRaw) {
                            setReplacementMappings(curr => ({ ...curr, [item.raw]: heldItemRaw }));
                            setHeldItemRaw(null);
                          } else if (mapped) {
                            setHeldItemRaw(mapped);
                            setReplacementMappings(curr => ({ ...curr, [item.raw]: '' }));
                          }
                        };

                        const handleSlotContextMenu = (e: MouseEvent) => {
                          e.preventDefault();
                          setReplacementMappings(curr => ({ ...curr, [item.raw]: '' }));
                        };

                        const handleSlotDrop = (e: DragEvent) => {
                          e.preventDefault();
                          const value = e.dataTransfer.getData('text/plain');
                          if (value) {
                            setReplacementMappings(curr => ({ ...curr, [item.raw]: value }));
                          }
                        };

                        return (
                          <tr key={item.raw} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td style={{ padding: '8px', verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="output-icon-slot" style={{ display: 'inline-flex', padding: 0, border: 'none', background: 'transparent' }}>
                                  {renderCraftItemIcon(item.raw, item.icon_url, item.animated, 1, item.display_name || item.raw)}
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
                                onContextMenu={(e) => handleSlotContextMenu(e as any)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => handleSlotDrop(e as any)}
                                title={mapped ? (uiPreferences.language === 'ru' ? 'Нажмите чтобы взять, правый клик чтобы очистить' : 'Click to pick up, right-click to clear') : (uiPreferences.language === 'ru' ? 'Положите предмет из NEI сюда' : 'Drop item from NEI here')}
                              >
                                {mapped ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {renderCraftItemIcon(mapped, getCachedItemIconUrl(mapped), false, 1, resolveCellTitle(mapped))}
                                    <span style={{ fontSize: '13px' }}>{resolveCellTitle(mapped) || mapped}</span>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{uiPreferences.language === 'ru' ? 'Пусто' : 'Empty'}</span>
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
                  disabled={replacementLoading || scannedReplacementItems.length === 0}
                  onClick={() => void handleReplaceModItems()}
                  style={{ padding: '10px 20px', fontWeight: 'bold' }}
                >
                  {replacementLoading ? (uiPreferences.language === 'ru' ? 'Замена...' : 'Replacing...') : (uiPreferences.language === 'ru' ? 'Заменить все предметы в рецептах' : 'Replace all items in recipes')}
                </button>
              </div>
            </div>
          </Panel>
        </div>
        <div className="workspace-column workspace-right" style={{ width: '380px', display: 'flex', flexDirection: 'column', height: '100%' }}>
          {renderNeiPanel()}
        </div>
      </div>
    );
  }

  function renderTechnicalWorkspace() {
    const sections: Array<{ id: DebugSection; label: string; description: string; visible: boolean }> = [
      { id: 'overview', label: 'Обзор', description: 'Статус и быстрые проверки', visible: true },
      { id: 'modIcons', label: 'Атласы', description: 'ZIP и атласы', visible: canManageModIcons },
      { id: 'iconSettings', label: 'Иконки', description: 'Размеры всех меню', visible: canManageSettings },
      { id: 'iconLab', label: 'Иконки тест', description: '64 варианта размера', visible: canUseDebug },
      { id: 'access', label: 'Доступ', description: 'Роли и whitelist', visible: canManageRoles },
      { id: 'caseAliases', label: 'Словарь регистра', description: 'Облако → itempanel', visible: canManageModIcons },
      { id: 'oreDictPriority', label: 'OreDict иконки', description: 'Приоритет модов', visible: canManageModIcons },
      { id: 'modReplacement', label: 'Замена мода', description: 'Замена предметов мода в рецептах', visible: canEditRecipes },
      { id: 'runtime', label: 'Состояния', description: 'UI, API, загрузки', visible: canUseDebug },
      { id: 'logs', label: 'Логи', description: 'Фильтры и события', visible: canUseDebug },
      { id: 'recipe', label: 'Текущий рецепт', description: 'Сетка, output, история', visible: canUseDebug },
      { id: 'raw', label: 'Сырые данные', description: 'JSON snapshot', visible: canUseDebug }
    ];

    return (
      <div className="debug-shell" aria-label="debug-workspace">
        <aside className="debug-sidebar" aria-label="debug-navigation">
          <strong>Техническая панель</strong>
          {sections.filter((section) => section.visible).map((section) => (
            <button
              key={section.id}
              type="button"
              className={`debug-nav-button ${debugSection === section.id ? 'active' : ''}`.trim()}
              aria-label={`debug-section-${section.id}`}
              onClick={() => setDebugSection(section.id)}
            >
              <span>{section.label}</span>
              <small>{section.description}</small>
            </button>
          ))}
          {canManageModIcons ? (
            <button type="button" className="debug-nav-button debug-nav-action" aria-label="Обновление вайпа" onClick={() => setIsWipeUpdateOpen(true)}>
              <span>Обновление вайпа</span>
              <small>CSV, SNBT, атласы</small>
            </button>
          ) : null}
        </aside>
        <section className="debug-content">
          {renderDebugSectionContent()}
        </section>
      </div>
    );
  }

  function renderWorkspace() {
    if (workspaceTab === 'recipe') {
      return (
        <div className="workspace-layout workspace-layout-drafts">
          <div className="workspace-column workspace-left">{renderDraftItemsPanel()}</div>
          <div className="workspace-column workspace-right">{renderDraftTemplatesPanel()}</div>
        </div>
      );
    }
    if (workspaceTab === 'tasks' && canManageTasks) {
      return (
        <RecipeTasksBoard
          authUser={authUser}
          itemOptions={taskItemOptions}
          prefillItem={taskPrefillItem}
          onOpenRecipe={(raw) => void openRecipeForItem(raw)}
          renderItemIcon={(raw) => renderCraftItemIcon(raw, undefined, false, undefined, resolveCellTitle(raw))}
          renderItemTooltip={renderItemTooltip}
          resolveItemTitle={resolveCellTitle}
        />
      );
    }
    if (workspaceTab === 'cloud' && canManageCloudFiles) {
      return renderCloudStoragePanel();
    }
    if (workspaceTab === 'technical' && canUseTechnicalPanel) {
      return renderTechnicalWorkspace();
    }
    return (
      <MobileRecipeWorkspace
        canUseNeiFavorites={canUseNeiFavorites}
        recipeBuilder={renderRecipeBuilderPanel()}
        recipeFiles={renderRecipeFilesPanel()}
        neiPanel={renderNeiPanel()}
        neiFavoritesPanel={canUseNeiFavorites ? renderNeiFavoritesPanel() : undefined}
      />
    );
  }

  function renderPanel(panel: PanelLayoutItem) {
    const panelId = panel.id;
    const common = {};

    switch (panelId) {
      case 'hero':
        return (
          <div key={panelId} className={`workspace-panel-shell panel-${panelId}`}>
            <Panel title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('app.subtitle')} {...common} className="hero-panel">
              <div className="hero-panel-grid">
                <div>
                  <p className="eyebrow">{t('app.name')}</p>
                  <h1>{t('app.title')}</h1>
                </div>
                <div className="hero-summary-grid">
                  <div><span>{t('app.file')}</span><strong>{recipe.source.path ?? t('app.unsaved')}</strong></div>
                  <div><span>{t('app.uid')}</span><strong>{recipe.recipe_uid}</strong></div>
                  <div><span>{t('app.source')}</span><strong>{recipe.source.kind}</strong></div>
                </div>
              </div>
            </Panel>
          </div>
        );
      case 'statusBar':
        return (
          <div key={panelId} className={`workspace-panel-shell panel-${panelId}`}>
            <Panel title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('status.logReady')} {...common}>
              <StatusBar items={statusItems} />
            </Panel>
          </div>
        );
      case 'toolbar':
        return null;
      case 'input':
        return (
          <div key={panelId} className={`workspace-panel-shell panel-${panelId}`}>
            <Panel title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('fields.sourceText')} {...common}>
              <div className="field-header">
                <span>{t('fields.sourceText')}</span>
                <div className="inline-actions">
                  <button type="button" className="secondary-button" disabled={!canCreateTemplates && !canEditRecipes} onClick={() => void handlePasteFromClipboard()}>{t('toolbar.paste')}</button>
                  <button type="button" className="ghost-button" disabled={!canCreateTemplates && !canEditRecipes} onClick={() => setInput('')}>{t('toolbar.clear')}</button>
                </div>
              </div>
              <textarea aria-label="paste-input" value={input} readOnly={!canCreateTemplates && !canEditRecipes} onChange={handleInputChange} onPaste={handleInputPaste} />
              <div className={`inline-status inline-status-${inputStatusTone}`}>
                <strong>{t('status.status')}:</strong>
                <span>{status}</span>
              </div>
              {!backendAvailable ? (
                <div className="inline-hint inline-hint-warning">
                  FastAPI backend недоступен. Frontend ходит в <code>{apiPath('')}</code>, а dev proxy сейчас ожидает backend по адресу <code>{getBackendTargetHint()}</code>. Запусти backend и повтори запрос.
                </div>
              ) : null}
            </Panel>
          </div>
        );
      case 'output':
        return (
          <div key={panelId} className={`workspace-panel-shell panel-${panelId}`}>
            <Panel title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('panel.output')} {...common}>
              <div className="output-card">
                <button
                  type="button"
                  className="output-icon-slot output-icon-button"
                  data-item-raw={outputRaw || undefined}
                  onMouseEnter={() => updateHoveredItemRaw(outputRaw || null)}
                  onMouseLeave={() => updateHoveredItemRaw((current) => (current === outputRaw ? null : current))}
                  onFocus={() => updateHoveredItemRaw(outputRaw || null)}
                  onBlur={() => updateHoveredItemRaw((current) => (current === outputRaw ? null : current))}
                  onClick={() => openCraftEditorModal({ kind: 'output' })}
                >
                  {renderCraftItemIcon(outputRaw, recipe.output_resolution?.icon_url, recipe.output_resolution?.animated, recipe.output_resolution?.animation_meta?.frametime, outputDisplayName ?? outputRaw)}
                  {outputRaw ? renderItemTooltip(outputRaw) : null}
                </button>
                <div className="output-details">
                  <div className="output-title-row"><h3>{outputDisplayName ?? t('values.unresolved')}</h3><span className={`badge ${recipe.output_resolution?.icon_url ? 'badge-success' : 'badge-warning'}`}>{recipe.output_resolution?.icon_url ? 'icon' : t('values.placeholder')}</span></div>
                  <label className="field-block"><span>{t('fields.rawOutput')}</span><input aria-label="output-raw" type="text" value={outputRaw} onChange={(event) => {
                    const value = event.target.value;
                    setOutputRaw(value);
                    setRecipe((current) => ({ ...current, output: { ...current.output, raw: value } }));
                  }} /></label>
                  <div className="kv-grid">
                    <div><span>{t('fields.displayName')}</span><strong>{outputDisplayName ?? t('values.unresolved')}</strong></div>
                    <div><span>{t('fields.rawId')}</span><strong>{outputRaw || '?'}</strong></div>
                    <div><span>{t('fields.iconStatus')}</span><strong>{recipe.output_resolution?.icon_url ?? t('values.placeholder')}</strong></div>
                    <div><span>{t('fields.strategy')}</span><strong>{recipe.output_resolution?.strategy ?? 'n/a'}</strong></div>
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        );
      case 'grid':
        return (
          <div key={panelId} className={`workspace-panel-shell panel-${panelId}`}>
            <Panel title={getPanelLabel(uiPreferences.language, panelId)} subtitle={`${t('status.size')}: ${summary}`} {...common} className="grid-panel">
              <div className="grid-meta"><span>{t('status.size')}</span><strong>{summary}</strong><span>{t('fields.parsedCells')}</span><strong>{filledCells}</strong><span>{t('fields.nullCells')}</span><strong>{nullCells}</strong></div>
              <div className="grid-scroll-zone">
                <RecipeGrid matrix={matrixWithResolution} atlas={itemPanelAtlas} atlasImageUrl={itemPanelAtlas ? normalizeAtlasImageUrl(itemPanelAtlas.image_url) : ''} displayMode={uiPreferences.display_mode} animationsEnabled={areAnimationsEnabled} editorMode={uiPreferences.editor_mode} extremeGroupGap={uiPreferences.workspace_layout.extreme_grid_gap ?? 8} heldItemRaw={heldItemRaw} tooltipsDisabled={isLayoutSettingsOpen || isCraftEditorOpen || isNbtEditorOpen || Boolean(customItemForm)} resolveCellTitle={resolveCellTitle} resolveIconStyle={resolveRecipeGridIconStyle} renderItemTooltip={renderItemTooltip} onItemHover={updateHoveredItemRaw} onCellClick={handleCraftCellClick} onCellContextMenu={handleCraftCellContextMenu} onCellDrop={(row, col, value) => handleRecipeItemDrop({ kind: 'cell', row, col }, value)} onCellChange={(row, col, value) => {
                  setMatrixCell(row, col, value);
                }} />
              </div>
            </Panel>
          </div>
        );
      case 'settings':
        return (
          <div key={panelId} className={`workspace-panel-shell panel-${panelId}`}>
            <Panel title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('fields.visiblePanels')} {...common}>
              <div className="recipe-settings-modern">
                <div className="settings-section-title compact">
                  <h3>Крафт</h3>
                  <span>{recipe.recipe_type}</span>
                </div>
                <div className="settings-grid">
                  <label className="field-block"><span>Сетка</span><select aria-label="settings-grid-size" value={recipe.grid_w} onChange={(event) => setGridSize(Number(event.target.value))}>{[2, 3, 9].map((size) => <option key={size} value={size}>{size}x{size}</option>)}</select></label>
                  <label className="field-block"><span>Тип</span><select aria-label="settings-craft-mode" value={recipeCraftMode} onChange={(event) => setRecipeCraftMode(event.target.value as RecipeCraftMode)}><option value="shaped">Форменный</option><option value="shapeless" disabled={recipe.grid_w >= 9}>Бесформенный</option></select></label>
                  <label className="field-block"><span>Позиция</span><select aria-label="settings-binding-mode" value={recipeBindingMode} disabled={recipe.recipe_type === 'ct_shapeless'} onChange={(event) => setRecipeBindingMode(event.target.value as RecipeBindingMode)}><option value="soft">Свободная</option><option value="strict">Точная</option></select></label>
                  <label className="field-block"><span>{t('fields.metaMode')}</span><select aria-label="meta-mode" value={metaMode} onChange={(event) => setMetaMode(event.target.value)}><option value="strict">{t('parseModes.strict')}</option><option value="wildcard">{t('parseModes.wildcard')}</option><option value="ignore">{t('parseModes.ignore')}</option></select></label>
                </div>
                <div className="settings-section-title compact">
                  <h3>Вид</h3>
                  <span>{uiPreferences.editor_mode}</span>
                </div>
                <div className="settings-grid">
                  <label className="field-block"><span>{t('fields.displayMode')}</span><select value={uiPreferences.display_mode} onChange={(event) => patchUiPreferences({ display_mode: event.target.value as DisplayMode })}><option value="text">text</option><option value="icons">icons</option></select></label>
                  <label className="field-block switch-field"><span>{t('fields.animations')}</span><input type="checkbox" checked={uiPreferences.animations_enabled} onChange={(event) => patchUiPreferences({ animations_enabled: event.target.checked })} /></label>
                  <label className="field-block"><span>{t('fields.density')}</span><select value={uiPreferences.density_mode} onChange={(event) => patchUiPreferences({ density_mode: event.target.value as DensityMode })}><option value="compact">compact</option><option value="normal">normal</option><option value="wide">wide</option></select></label>
                  <label className="field-block"><span>{t('fields.editorMode')}</span><select value={uiPreferences.editor_mode} onChange={(event) => patchUiPreferences({ editor_mode: event.target.value as EditorMode })}><option value="view">view</option><option value="edit">edit</option></select></label>
                  <label className="field-block"><span>Зазор 3x3</span><input aria-label="extreme-grid-gap" type="range" min={0} max={24} value={uiPreferences.workspace_layout.extreme_grid_gap ?? 8} onChange={(event) => patchUiPreferences({ workspace_layout: { ...uiPreferences.workspace_layout, extreme_grid_gap: Number(event.target.value) } })} /></label>
                </div>
              </div>
            </Panel>
          </div>
        );
      case 'info':
      case 'debug':
      case 'diagnostics':
      case 'preview':
      case 'raw': {
        const renderExtra = () => {
          switch (panelId) {
            case 'info':
              return <div className="kv-grid"><div><span>{t('status.type')}</span><strong>{recipe.recipe_type}</strong></div><div><span>{t('fields.sourceFile')}</span><strong>{recipe.source.path ?? '?'}</strong></div><div><span>{t('app.uid')}</span><strong>{recipe.recipe_uid}</strong></div><div><span>{t('fields.originPath')}</span><strong>{recipe.source.path ?? settings?.project_config_path ?? '?'}</strong></div></div>;
            case 'debug':
              return <div className="kv-grid"><div><span>{t('fields.lastApiStatus')}</span><strong>{lastApiStatus}</strong></div><div><span>{t('fields.lastParseResult')}</span><strong>{lastParseResult}</strong></div><div><span>{t('fields.iconFound')}</span><strong>{recipe.output_resolution?.icon_url ? t('values.yes') : t('values.no')}</strong></div></div>;
            case 'diagnostics':
              return <ul className="diagnostics-list"><li>Unresolved cells: {unresolvedCells}</li><li>Output icon: {recipe.output_resolution?.icon_url ?? 'not found'}</li><li>Current file: {recipe.source.path ?? 'unsaved'}</li></ul>;
            case 'preview':
              return <div className="preview-block"><strong>{outputDisplayName ?? outputRaw}</strong><span>{recipe.recipe_type}</span><span>{summary}</span></div>;
            default:
              return <pre className="raw-block">{JSON.stringify({ recipe, matrix, ui: uiPreferences }, null, 2)}</pre>;
          }
        };
        return (
          <div key={panelId} className={`workspace-panel-shell panel-${panelId}`}>
            <Panel title={getPanelLabel(uiPreferences.language, panelId)} subtitle={panelId === 'diagnostics' ? getTabLabel(uiPreferences.language, 'diagnostics') : undefined} {...common}>{renderExtra()}</Panel>
          </div>
        );
      }
      default:
        return null;
    }
  }

  const activeServerName = activeServerId
    ? (serversList.find((server) => server.id === activeServerId)?.name || activeServerId)
    : null;

  return (
    <main className={`app-shell theme-${uiPreferences.theme_mode} density-${uiPreferences.density_mode} mode-${uiPreferences.editor_mode} columns-${uiPreferences.workspace_layout.columns} ${uiPreferences.workspace_layout.compact_header ? 'compact-header' : ''}`} style={getAppShellStyle()} onMouseDownCapture={handleHeldItemOutsideMouseDown} onContextMenuCapture={handleHeldItemContextMenu}>
      <div className="utility-bar">
        <MobileAppMenu
          appName="CubixRecipes"
          userEmail={authUser.email}
          userRole={authUser.role}
          serverName={activeServerName}
          tabs={workspaceTabs}
          activeTab={workspaceTab}
          onSelectTab={(tabId) => setWorkspaceTab(tabId as WorkspaceTab)}
          onResetServer={onResetServer}
          language={uiPreferences.language}
          canManageSettings={canManageSettings}
          canOpenSettings={canOpenSettings}
          onLanguageChange={(language) => patchUiPreferences({ language })}
          onOpenSettings={() => setIsLayoutSettingsOpen(true)}
          onLogout={onLogout}
          editorTools={workspaceTab === 'editor' ? renderRecipeFilesPanel() : undefined}
        />
        <div className="brand-with-server">
          <strong>CubixRecipes</strong>
          {activeServerId && (
            <div className="active-server-chip" title="Активный сервер">
              <span className="server-icon">🖥️</span>
              <span className="server-name-label">
                {activeServerName}
              </span>
              {onResetServer && (
                <button
                  type="button"
                  className="change-server-inline-btn"
                  onClick={onResetServer}
                  title="Сменить сервер"
                >
                  🔁
                </button>
              )}
            </div>
          )}
        </div>
        <nav className="main-tabs" aria-label="workspace-tabs">
          {workspaceTabs.map((tab) => (
            <button key={tab.id} type="button" data-testid={`workspace-tab-${tab.id}`} className={`main-tab-button ${workspaceTab === tab.id ? 'active' : ''}`} onClick={() => setWorkspaceTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="utility-actions">
          <div className="user-chip" title={authUser.email}>
            {authUser.avatar_url ? <img src={authUser.avatar_url} alt="" /> : null}
            <span>{authUser.email}</span>
            <strong>{authUser.role}</strong>
          </div>
          <label className="language-switch compact-switch"><select aria-label={t('app.language')} disabled={!canManageSettings} value={uiPreferences.language} onChange={(event) => patchUiPreferences({ language: event.target.value as UiLanguage })}><option value="ru">Русский</option><option value="en">English</option></select></label>
          {canOpenSettings ? <button type="button" className="secondary-button" onClick={() => setIsLayoutSettingsOpen(true)}>{t('app.settings')}</button> : null}
          <button type="button" className="ghost-button" onClick={() => void onLogout()}>Logout</button>
        </div>
      </div>

      {renderWorkspace()}

      {heldItemRaw ? (
        <div
          ref={heldCursorRef}
          className="held-item-cursor"
          aria-hidden="true"
        >
          {renderHeldItemIcon(heldItemRaw)}
        </div>
      ) : null}
      {renderHotkeyDebugPanel()}
      {renderTouchItemInspection()}
      {renderNeiContextMenu()}
      {renderDraftTemplateContextMenu()}
      {renderCloudContextMenu()}
      {renderCustomItemModal()}
      {renderWipeUpdateModal()}
      {renderRecipeUsesModal()}
      {renderCloudUploadConflictModal()}
      {renderLocalSaveModal()}
      {renderCloudSaveModal()}
      {renderSaveConflictModal()}

      {isLayoutSettingsOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsLayoutSettingsOpen(false)}>
          <div className="modal settings-modal" role="dialog" aria-modal="true" aria-label="Настройки" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Настройки</h2>
              <div className="inline-actions">
                <button type="button" onClick={() => setIsLayoutSettingsOpen(false)}>Закрыть</button>
              </div>
            </div>
            <div className="settings-modal-body">
              {canManageSettings ? (
                <>
              <label className="field-block settings-scale-control">
                <span>Масштаб интерфейса</span>
                <select aria-label="ui-scale" value={uiPreferences.ui_scale} onChange={(event) => patchUiPreferences({ ui_scale: Number(event.target.value) as UiScale })}>
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
                  onChange={(event) => patchUiPreferences({ nei_page_size: clamp(Math.floor(Number(event.target.value) || 32), 16, 512) })}
                >
                  {[16, 32, 64, 96, 128, 256, 512].map((size) => (
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
                  onChange={(event) => setSharedCraftDraftMode(event.target.checked)}
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
                    onChange={(event) => setHotkeyDebugEnabledForAdmin(event.target.checked)}
                  />
                </label>
                <div className="settings-section-title compact">
                  <h3>Категории</h3>
                  <span>{Object.values(debugFilters).filter(Boolean).length}/{Object.keys(debugFilters).length}</span>
                </div>
                <div className="debug-filter-grid">
                  {Object.entries(debugCategoryLabels).map(([category, label]) => (
                    <label key={category} className="view-toggle">
                      <input type="checkbox" checked={debugFilters[category as DebugCategory]} onChange={(event) => toggleDebugFilter(category as DebugCategory, event.target.checked)} />
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
                      <input type="checkbox" checked={debugLevelFilters[level as HotkeyDebugLevel]} onChange={(event) => toggleDebugLevel(level as HotkeyDebugLevel, event.target.checked)} />
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
                    <input aria-label="nei-favorite-hotkey" type="text" value={neiFavorites.favoriteHotkey} onChange={(event) => updateFavoriteHotkey(event.target.value)} placeholder="A или Ctrl+A" />
                  </label>
                  <label className="field-block">
                    <span>Скрывать из NEI</span>
                    <textarea
                      aria-label="nei-hidden-patterns"
                      className="compact-textarea"
                      value={neiHiddenPatternsDraft}
                      onChange={(event) => updateNeiHiddenPatterns(event.target.value)}
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
      ) : null}

      {isCraftEditorOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => { setIsCraftEditorOpen(false); setIsNbtEditorOpen(false); }}>
          <div className="modal modal-scalable craft-editor-modal" style={getModalScaleStyle('craft')} role="dialog" aria-modal="true" aria-label="Craft editor" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{craftEditorTarget.kind === 'output' ? 'Редактирование output' : `Редактирование ячейки ${craftEditorTarget.row + 1},${craftEditorTarget.col + 1}`}</h2>
              <div className="inline-actions">
                {renderModalScaleControl('craft')}
                <button type="button" onClick={() => { setIsCraftEditorOpen(false); setIsNbtEditorOpen(false); }}>Закрыть</button>
              </div>
            </div>
            <div className="settings-modal-body">
              <label className="field-block">
                <span>Поиск предмета (ID, ID:meta, mod:item, mod:item:meta, RU/EN)</span>
                <div className="inline-actions">
                  <input aria-label="item-search" type="text" value={itemSearchQuery} onChange={(event) => setItemSearchQuery(event.target.value)} placeholder="например: draconicrevolt:der_awakeneddemonicblock или 482:1" />
                  <button type="button" className="ghost-button" aria-label="clear-item-search" onClick={() => setItemSearchQuery('')}>Очистить</button>
                </div>
                {itemSearchSuggestions.length ? (
                  <div className="suggestions-list" role="listbox" aria-label="item-search-suggestions">
                    {itemSearchSuggestions.map((entry) => (
                      <button key={itemPanelEntryIdentity(entry)} type="button" className="suggestion-item suggestion-item-with-icon" onClick={() => applyItemSearchSuggestion(entry)}>
                        {(() => {
                          const raw = itemPanelRaw(entry);
                          const iconUrl = itemSearchIcons[raw];
                          const modIconStyle = buildModIconStyle(modIconManifest, getModIconEntryForRaw(raw));
                          return (
                            <span className="suggestion-icon-slot" aria-hidden="true">
                              {modIconStyle ? <span className="nei-atlas-icon" style={modIconStyle} /> : iconUrl ? <img src={iconUrl} alt="" loading="lazy" /> : '□'}
                            </span>
                          );
                        })()}
                        <div className="suggestion-content">
                          <strong>{itemPanelRaw(entry)}</strong>
                          <span>{entry.displayRu}</span>
                          {entry.displayEn && entry.displayEn !== entry.displayRu ? <span>{entry.displayEn}</span> : null}
                        </div>
                        {renderItemTooltip(itemPanelRaw(entry), entry)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </label>
              <label className="field-block">
                <span>Raw предмета (формат parser: {'<modid:item[:meta]>'})</span>
                <textarea
                  aria-label="craft-source-modal"
                  value={craftSourceDraft}
                  onChange={(event) => {
                    setCraftSourceMode('raw');
                    setCraftSourceDraft(event.target.value);
                  }}
                  rows={6}
                />
              </label>
              <div className="field-block">
                <span>Структурный редактор item</span>
                <div className="settings-grid">
                  <label className="field-block">
                    <span>Mod</span>
                    <input aria-label="item-mod-input" type="text" value={itemModDraft} onChange={(event) => setItemModDraft(event.target.value)} />
                  </label>
                  <label className="field-block">
                    <span>Item</span>
                    <input aria-label="item-name-input" type="text" value={itemNameDraft} onChange={(event) => setItemNameDraft(event.target.value)} />
                  </label>
                  <label className="field-block">
                    <span>Meta</span>
                    <input aria-label="item-meta-input" type="number" min={0} value={itemMetaDraft} onChange={(event) => setItemMetaDraft(event.target.value)} />
                  </label>
                </div>
                <div className="inline-actions">
                  <button type="button" className="secondary-button" aria-label="open-nbt-editor" onClick={() => setIsNbtEditorOpen(true)}>Открыть NBT</button>
                  <span>{nbtRootDraft.entries.length ? `NBT полей: ${nbtRootDraft.entries.length}` : 'NBT не задан'}</span>
                  {craftSourceMode === 'raw' ? <button type="button" className="ghost-button" onClick={() => setCraftSourceMode('structured')}>Использовать поля</button> : null}
                </div>
                <div className="raw-preview-line"><span>Итоговый raw</span><strong>{structuredCraftRaw || '?'}</strong></div>
              </div>
              {craftEditorTarget.kind === 'output' ? (
                <section className="settings-section remove-template-settings">
                  <div className="settings-section-title compact">
                    <h3>Удаление рецепта</h3>
                    <span>{activeRemoveTemplateId() === 'none' ? 'выключено' : 'включено'}</span>
                  </div>
                  <label className="field-block switch-field">
                    <span>Добавлять recipes.remove перед рецептом</span>
                    <input
                      aria-label="remove-recipe-enabled"
                      type="checkbox"
                      checked={activeRemoveTemplateId() !== 'none'}
                      onChange={(event) => setActiveRemoveTemplateId(event.target.checked ? BUILTIN_REMOVE_TEMPLATES[0].id : 'none')}
                    />
                  </label>
                  <div className="settings-grid">
                    <label className="field-block">
                      <span>Шаблон удаления</span>
                      <select aria-label="remove-recipe-template" value={activeRemoveTemplateId()} onChange={(event) => setActiveRemoveTemplateId(event.target.value)}>
                        <option value="none">Без удаления</option>
                        {removeTemplateOptions().map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="field-block">
                      <span>Новый шаблон</span>
                      <input aria-label="remove-template-draft" type="text" value={removeTemplateDraft} onChange={(event) => setRemoveTemplateDraft(event.target.value)} />
                    </label>
                  </div>
                  <div className="inline-actions">
                    <button type="button" className="secondary-button" aria-label="add-remove-template" onClick={addCustomRemoveTemplate}>Добавить шаблон</button>
                  </div>
                </section>
              ) : null}
              <div className="inline-actions">
                <button type="button" className="ghost-button" aria-label="clear-craft-source" onClick={() => { setCraftSourceMode('raw'); setCraftSourceDraft(''); }}>Очистить raw</button>
                <button type="button" className="secondary-button" aria-label="copy-craft-source" onClick={() => void handleCraftModalCopy()}>Скопировать</button>
                <button type="button" className="secondary-button" aria-label="paste-craft-source" onClick={() => void handleCraftModalPaste()}>Вставить</button>
                <button
                  type="button"
                  onClick={() => {
                    const rawCandidate = craftSourceMode === 'structured' ? structuredCraftRaw : craftSourceDraft;
                    const trimmed = rawCandidate.trim();
                    if (trimmed.includes('.addShaped') || trimmed.includes('.addShapeless')) {
                      void handleParse(trimmed);
                      return;
                    }
                    setCellRaw(craftEditorTarget, trimmed);
                    setIsCraftEditorOpen(false);
                    setIsNbtEditorOpen(false);
                  }}
                >
                  Применить
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isNbtEditorOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsNbtEditorOpen(false)}>
          <div className="modal modal-scalable modal-nbt-tree" style={getModalScaleStyle('nbtTree')} role="dialog" aria-modal="true" aria-label="NBT tree editor" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Дерево NBT</h2>
              <div className="inline-actions">
                {renderModalScaleControl('nbtTree')}
                <button type="button" onClick={() => setIsNbtEditorOpen(false)}>Закрыть</button>
              </div>
            </div>
            <div className="settings-modal-body">
              <NbtTreeEditor
                root={nbtRootDraft}
                collapsedPaths={collapsedNbtPaths}
                labelPrefix="nbt"
                onChange={setNbtRootDraft}
                onCollapsedPathsChange={setCollapsedNbtPaths}
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
