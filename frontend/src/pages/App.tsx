import { type CSSProperties, type MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Panel } from '../components/Panel';
import { RecipeGrid } from '../components/RecipeGrid';
import { StatusBar } from '../components/StatusBar';
import { AnimatedIcon } from '../components/AnimatedIcon';
import { apiPath, getBackendTargetHint, getItemPanelFallbackToFirstMetaEnabled } from '../config/runtime';
import { createTranslator, getPanelLabel, getTabLabel } from '../i18n';
import { ApiConflictError, createRecipeTemplate, deleteCustomItem, deleteRecipeDraftTemplate, deleteZsCloudFile, downloadZsCloudBackup, downloadZsCloudFile, generateModIconAtlases, getItemPanelAtlas, getModIconAdminStatus, getModIconAtlasManifest, getProjectSettings, listCustomItems, listRecipeDraftTemplates, listUsers, listZsCloudBackups, listZsCloudFiles, parseText, renameZsCloudFile, resolveItemRaw, saveCustomItem, saveRecipeAs, saveRecipeDraftTemplate, searchRecipesByOutput, searchRecipesByOutputs, searchRecipesUsingItem, updateProjectUiPreferences, updateRecipe, updateUserRole, uploadModIconArchive, uploadZsCloudFile } from '../services/api';
import { logFrontendEvent } from '../services/debugLog';
import { can } from '../auth/permissions';
import { AppTab, AuthUser, CellValue, CustomItem, DensityMode, DisplayMode, EditorMode, ItemPanelAtlas, ItemPanelAtlasEntry, ModIconAdminStatus, ModIconAtlasEntry, ModIconAtlasManifest, PanelId, PanelLayoutItem, ProjectSettings, RecipeDraftTemplate, RecipeView, ThemeMode, UiLanguage, UiPreferences, UiScale, UserRole, WorkspaceLayout, ZsCloudBackup, ZsCloudFile } from '../types';

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
  bottom_height: 260
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

type ModalScaleKey = 'help' | 'layout' | 'craft' | 'nbtTree';
type WorkspaceTab = 'editor' | 'recipe' | 'modIcons' | 'cloud' | 'debug';
type RecipeType = 'ct_shaped' | 'ct_shapeless' | 'avaritia_extreme_shaped';
type RecipeCraftMode = 'shaped' | 'shapeless';
type RecipeBindingMode = 'soft' | 'strict';

const defaultUiPreferences: UiPreferences = {
  display_mode: 'text',
  animations_enabled: true,
  density_mode: 'normal',
  editor_mode: 'edit',
  theme_mode: 'dark',
  ui_scale: 1.15,
  language: 'ru',
  active_view_tab: 'editor',
  reset_layout_version: 4,
  panel_layout: defaultPanelLayout,
  workspace_layout: defaultWorkspaceLayout
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
  raw?: string;
  customItemId?: number;
  customScope?: 'global' | 'user';
  customOwnerEmail?: string | null;
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

type UploadedDraftRecipeMatch = {
  sourceId: string;
  sourceName: string;
  block: string;
  matchedRaw: string;
  createdByEmail?: string;
  templateId?: string;
};

type DraftItemSortMode = 'name' | 'drafts-desc' | 'drafts-asc';

type DraftItemEntry = {
  raw: string;
  draftCount: number;
  title: string;
  searchText: string;
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
};

type CloudFileContextMenuState = {
  path: string;
  x: number;
  y: number;
};

type CustomItemFormState = {
  id: number | null;
  scope: 'global' | 'user';
  sourceRaw: string;
  itemRaw: string;
  displayName: string;
  nbtRaw: string;
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
const NEI_PAGE_SIZE = 240;
const LOCAL_DRAFT_SCHEMA_VERSION = 1;
const LOCAL_DRAFT_STORAGE_PREFIX = 'cubixrecipes:local-draft:v1';
const LOCAL_DRAFT_SAVE_DELAY_MS = 250;
const LOCAL_DRAFT_MAX_HISTORY = 20;
const LOCAL_DRAFT_MAX_UPLOADED_DRAFTS = 8;
const LOCAL_DRAFT_MAX_UPLOADED_TEXT = 180_000;
const HOTKEY_DEBUG_ENABLED_STORAGE_KEY = 'cubixrecipes:hotkey-debug-enabled:v1';
const RECIPE_DRAFT_STORAGE_PREFIX = 'cubixrecipes:recipe-drafts:v1';
const RECIPE_DRAFT_MAX_TEMPLATES = 200;
const DRAFT_ITEM_PAGE_SIZE = 240;

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

type CloudUploadConflictMode = 'overwrite' | 'append' | 'cancel';
type CloudUploadConflictState = {
  filename: string;
  resolve: (mode: CloudUploadConflictMode) => void;
};

type HotkeyDebugLevel = 'info' | 'success' | 'warning' | 'error';
type HotkeyDebugDetails = Record<string, string | number | boolean | null | undefined>;
type HotkeyDebugEvent = {
  id: number;
  timestamp: string;
  level: HotkeyDebugLevel;
  message: string;
  details?: HotkeyDebugDetails;
};

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

type NbtScalarType = 'byte' | 'short' | 'int' | 'long' | 'float' | 'double' | 'string' | 'byte_array' | 'int_array' | 'long_array';
type NbtNodeType = NbtScalarType | 'list' | 'compound';
type NbtScalarNode = { kind: 'scalar'; value: string; scalarType: NbtScalarType };
type NbtListNode = { kind: 'list'; items: NbtNode[] };
type NbtCompoundNode = { kind: 'compound'; entries: { key: string; value: NbtNode }[] };
type NbtNode = NbtScalarNode | NbtListNode | NbtCompoundNode;

interface AppProps {
  authUser?: AuthUser;
  onLogout?: () => Promise<void>;
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

function cloneMatrix(matrix: CellValue[][]): CellValue[][] {
  return matrix.map((row) => [...row]);
}

function toCellMatrix(recipe: RecipeView): CellValue[][] {
  return recipe.matrix.map((row) => row.map((cell) => cell.raw));
}

function maxGridWidth(matrix: CellValue[][]): number {
  return Math.max(0, ...matrix.map((row) => row.length));
}

function normalizeGridSize(size: number): 2 | 3 | 9 {
  if (size >= 9) return 9;
  return size <= 2 ? 2 : 3;
}

function resizeMatrix(matrix: CellValue[][], size: number): CellValue[][] {
  return Array.from({ length: size }, (_, rowIndex) => (
    Array.from({ length: size }, (_, colIndex) => matrix[rowIndex]?.[colIndex] ?? null)
  ));
}

function rowIsEmpty(row: CellValue[]): boolean {
  return row.every((cell) => !cell || cell === 'null');
}

function columnIsEmpty(matrix: CellValue[][], index: number): boolean {
  return matrix.every((row) => index >= row.length || !row[index] || row[index] === 'null');
}

function trimMatrixEdges(matrix: CellValue[][]): CellValue[][] {
  if (!matrix.length) return [[null]];
  let top = 0;
  let bottom = matrix.length;
  while (top < bottom && rowIsEmpty(matrix[top])) top += 1;
  while (bottom > top && rowIsEmpty(matrix[bottom - 1])) bottom -= 1;
  const cropped = matrix.slice(top, bottom).map((row) => [...row]);
  if (!cropped.length) return [[null]];
  let left = 0;
  let right = maxGridWidth(cropped);
  while (left < right && columnIsEmpty(cropped, left)) left += 1;
  while (right > left && columnIsEmpty(cropped, right - 1)) right -= 1;
  const trimmed = cropped.map((row) => row.slice(left, right));
  const width = Math.max(1, maxGridWidth(trimmed));
  return trimmed.map((row) => [...row, ...Array.from({ length: Math.max(0, width - row.length) }, () => null)]);
}

function matrixForRecipeSource(matrix: CellValue[][], recipeType: string, bindingMode: RecipeBindingMode): CellValue[][] {
  if (recipeType === 'avaritia_extreme_shaped' || bindingMode === 'strict' || recipeType === 'ct_shapeless') {
    const width = Math.max(1, maxGridWidth(matrix));
    return matrix.length
      ? matrix.map((row) => [...row, ...Array.from({ length: Math.max(0, width - row.length) }, () => null)])
      : [[null]];
  }
  return trimMatrixEdges(matrix);
}

function recipeTypeFromCraftMode(mode: RecipeCraftMode, gridSize: number): RecipeType {
  if (gridSize >= 9) return 'avaritia_extreme_shaped';
  return mode === 'shapeless' ? 'ct_shapeless' : 'ct_shaped';
}

function craftModeFromRecipeType(recipeType: string): RecipeCraftMode {
  return recipeType === 'ct_shapeless' ? 'shapeless' : 'shaped';
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

function recipeDraftStorageKey(email: string): string {
  return `${RECIPE_DRAFT_STORAGE_PREFIX}:${localDraftUserHash(email)}`;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isCellMatrix(value: unknown): value is CellValue[][] {
  return Array.isArray(value) && value.every((row) => (
    Array.isArray(row) && row.every((cell) => cell === null || typeof cell === 'string')
  ));
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

function normalizeLocalDraftState(value: unknown): LocalDraftState | null {
  if (!isObjectRecord(value) || !isRecipeView(value.recipe) || !isCellMatrix(value.matrix)) {
    return null;
  }

  const workspaceTab = value.workspaceTab === 'recipe' || value.workspaceTab === 'modIcons' || value.workspaceTab === 'cloud' || value.workspaceTab === 'debug' ? value.workspaceTab : 'editor';
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

function loadLocalDraftPayload(email: string): LocalDraftPayload | null {
  try {
    const raw = window.localStorage.getItem(localDraftStorageKey(email));
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
  const outputPattern = /(?:addShaped|addShapeless)\s*\(\s*(<[^>]+>(?:\.withTag\([\s\S]*?\))?)/g;
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

function collectRecipeBlocks(source: string): string[] {
  const blocks: string[] = [];
  const blockPattern = /(?:recipes\.addShaped|recipes\.addShapeless|mods\.avaritia\.ExtremeCrafting\.addShaped)\([\s\S]*?\);/g;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(source)) !== null) {
    blocks.push(match[0]);
  }
  return blocks;
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
    customOwnerEmail: item.owner_email ?? null
  };
}

function normalizeAtlasImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith('/api/')) {
    return apiPath(imageUrl.slice(4));
  }
  return imageUrl;
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

const nbtScalarTypes: NbtScalarType[] = ['byte', 'short', 'int', 'long', 'float', 'double', 'string', 'byte_array', 'int_array', 'long_array'];
const nbtNodeTypeOptions: NbtNodeType[] = [...nbtScalarTypes, 'list', 'compound'];

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

function defaultNodeForType(type: NbtNodeType): NbtNode {
  if (type === 'compound') return { kind: 'compound', entries: [] };
  if (type === 'list') return { kind: 'list', items: [] };
  return { kind: 'scalar', value: '', scalarType: type };
}

function nodeType(node: NbtNode): NbtNodeType {
  if (node.kind === 'compound') return 'compound';
  if (node.kind === 'list') return 'list';
  return node.scalarType;
}

function normalizeNodeTypeChange(nextType: NbtNodeType, current: NbtNode): NbtNode {
  if (nextType === 'compound') {
    return current.kind === 'compound' ? current : { kind: 'compound', entries: [] };
  }
  if (nextType === 'list') {
    return current.kind === 'list' ? current : { kind: 'list', items: [] };
  }
  if (current.kind === 'scalar') {
    return { ...current, scalarType: nextType };
  }
  return { kind: 'scalar', value: '', scalarType: nextType };
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
    bottom_height: defaultWorkspaceLayout.bottom_height
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
    language: (source?.language ?? 'ru') as UiLanguage,
    active_view_tab: (source?.active_view_tab ?? 'editor') as AppTab,
    reset_layout_version: source?.reset_layout_version ?? 4,
    panel_layout: normalizePanelLayout(source?.panel_layout),
    workspace_layout: normalizeWorkspaceLayout(source?.workspace_layout)
  };
}

export default function App({ authUser = fallbackAuthUser, onLogout = async () => undefined }: AppProps) {
  const localDraftRef = useRef<LocalDraftPayload | null | undefined>(undefined);
  if (localDraftRef.current === undefined) {
    localDraftRef.current = loadLocalDraftPayload(authUser.email);
  }
  const restoredDraft = localDraftRef.current?.state ?? null;

  const [input, setInput] = useState(restoredDraft?.input ?? '');
  const [matrix, setMatrix] = useState<CellValue[][]>(() => restoredDraft ? cloneMatrix(restoredDraft.matrix) : cloneMatrix(defaultMatrix));
  const [status, setStatus] = useState('Готово');
  const [strictBinding, setStrictBinding] = useState(restoredDraft?.strictBinding ?? defaultRecipe.binding_mode === 'strict');
  const [metaMode, setMetaMode] = useState(restoredDraft?.metaMode ?? 'strict');
  const [recipe, setRecipe] = useState<RecipeView>(restoredDraft?.recipe ?? defaultRecipe);
  const [outputRaw, setOutputRaw] = useState(restoredDraft?.outputRaw ?? defaultRecipe.output.raw);
  const [isLayoutSettingsOpen, setIsLayoutSettingsOpen] = useState(false);
  const [isCraftEditorOpen, setIsCraftEditorOpen] = useState(false);
  const [isNbtEditorOpen, setIsNbtEditorOpen] = useState(false);
  const [isCloudSaveModalOpen, setIsCloudSaveModalOpen] = useState(false);
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
  const [itemPanelAtlas, setItemPanelAtlas] = useState<ItemPanelAtlas | null | undefined>(undefined);
  const [modIconManifest, setModIconManifest] = useState<ModIconAtlasManifest | null>(null);
  const [heldItemRaw, setHeldItemRaw] = useState<string | null>(null);
  const [hoveredItemRaw, setHoveredItemRaw] = useState<string | null>(null);
  const [uploadedDrafts, setUploadedDrafts] = useState<UploadedDraft[]>(restoredDraft?.uploadedDrafts ?? []);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(restoredDraft?.selectedDraftId ?? null);
  const [selectedUploadedDraftIds, setSelectedUploadedDraftIds] = useState<Record<string, boolean>>({});
  const [recipeDraftTemplates, setRecipeDraftTemplates] = useState<RecipeDraftTemplate[]>(() => loadRecipeDraftTemplates(authUser.email));
  const [selectedDraftItemRaw, setSelectedDraftItemRaw] = useState<string | null>(null);
  const [draftItemSearchQuery, setDraftItemSearchQuery] = useState('');
  const [draftItemSortMode, setDraftItemSortMode] = useState<DraftItemSortMode>('drafts-desc');
  const [draftItemPage, setDraftItemPage] = useState(0);
  const [previewDraftTemplateId, setPreviewDraftTemplateId] = useState<string | null>(null);
  const [draftTemplateContextMenu, setDraftTemplateContextMenu] = useState<DraftTemplateContextMenuState | null>(null);
  const [recipeAvailability, setRecipeAvailability] = useState<Record<string, boolean>>({});
  const [recipeUsesModal, setRecipeUsesModal] = useState<RecipeUsesModalState | null>(null);
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
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  const [customItemsStatus, setCustomItemsStatus] = useState('');
  const [neiContextMenu, setNeiContextMenu] = useState<NeiContextMenuState | null>(null);
  const [customItemForm, setCustomItemForm] = useState<CustomItemFormState | null>(null);
  const [customItemNbtRoot, setCustomItemNbtRoot] = useState<NbtCompoundNode>({ kind: 'compound', entries: [] });
  const [wildcardCycleTick, setWildcardCycleTick] = useState(0);
  const [adminUsers, setAdminUsers] = useState<AuthUser[]>([]);
  const [adminUsersStatus, setAdminUsersStatus] = useState('');
  const [modIconStatus, setModIconStatus] = useState<ModIconAdminStatus | null>(null);
  const [modIconMessage, setModIconMessage] = useState('');
  const [modIconUploading, setModIconUploading] = useState(false);
  const [modIconGenerating, setModIconGenerating] = useState(false);
  const [cloudFiles, setCloudFiles] = useState<ZsCloudFile[]>([]);
  const [cloudStatus, setCloudStatus] = useState('');
  const [cloudContextMenu, setCloudContextMenu] = useState<CloudFileContextMenuState | null>(null);
  const [isRootBackupOpen, setIsRootBackupOpen] = useState(false);
  const [cloudBackups, setCloudBackups] = useState<ZsCloudBackup[]>([]);
  const [cloudBackupStatus, setCloudBackupStatus] = useState('');
  const [itemSearchIcons, setItemSearchIcons] = useState<Record<string, string | null>>(() => {
    try {
      const raw = window.localStorage.getItem(ITEM_SEARCH_ICON_CACHE_KEY);
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
  const autoParseTimerRef = useRef<number | null>(null);
  const settingsRetryTimerRef = useRef<number | null>(null);
  const latestUiPreferencesRef = useRef<UiPreferences>(defaultUiPreferences);
  const hasLocalUiChangesRef = useRef(false);
  const lastRequestedParseRef = useRef('');
  const texturePauseRef = useRef(false);
  const textureCancelRef = useRef(false);
  const iconRequestRef = useRef<Set<string>>(new Set());
  const neiListRef = useRef<HTMLDivElement | null>(null);
  const cursorPointRef = useRef({ x: 0, y: 0 });
  const heldCursorRef = useRef<HTMLDivElement | null>(null);
  const cursorFrameRef = useRef<number | null>(null);
  const hoveredItemRawRef = useRef<string | null>(null);
  const hotkeyDebugCounterRef = useRef(0);

  const t = createTranslator(uiPreferences.language);
  const areAnimationsEnabled = uiPreferences.animations_enabled;
  const canEditRecipes = can(authUser, 'recipes:edit');
  const canCreateTemplates = can(authUser, 'templates:create');
  const canManageSettings = can(authUser, 'settings:manage');
  const canManageRoles = can(authUser, 'roles:manage');
  const canUseDebug = can(authUser, 'debug:manage');
  const canManageModIcons = can(authUser, 'mod-icons:manage');
  const canManageCloudFiles = can(authUser, 'files:manage');
  const isHotkeyDebugActive = canManageSettings && isHotkeyDebugEnabled;
  const workspaceTabs = [
    { id: 'editor' as const, label: uiPreferences.language === 'ru' ? 'Главное меню' : 'Main menu', visible: true },
    { id: 'recipe' as const, label: uiPreferences.language === 'ru' ? 'Черновики' : 'Drafts', visible: canCreateTemplates || canEditRecipes },
    { id: 'modIcons' as const, label: uiPreferences.language === 'ru' ? 'Иконки модов' : 'Mod icons', visible: canManageModIcons },
    { id: 'cloud' as const, label: uiPreferences.language === 'ru' ? 'Облако .zs' : '.zs cloud', visible: canManageCloudFiles },
    { id: 'debug' as const, label: uiPreferences.language === 'ru' ? 'Отладка' : 'Debug', visible: canUseDebug }
  ].filter((tab) => tab.visible);

  function logHotkeyDebug(message: string, details?: HotkeyDebugDetails, level: HotkeyDebugLevel = 'info') {
    if (!isHotkeyDebugActive) {
      return;
    }
    const entry: HotkeyDebugEvent = {
      id: hotkeyDebugCounterRef.current + 1,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      level,
      message,
      details
    };
    hotkeyDebugCounterRef.current = entry.id;
    setHotkeyDebugEvents((current) => [entry, ...current].slice(0, 32));
    console.info('[CubixRecipes R/U debug]', message, details ?? {});
  }

  function setHotkeyDebugEnabledForAdmin(enabled: boolean) {
    if (!canManageSettings) {
      return;
    }
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
    try {
      const payload = await downloadZsCloudFile(path);
      downloadBlobFile(payload.filename, payload.blob);
      setCloudStatus(`Файл скачан: ${payload.filename}`);
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function renameCloudFile(path: string) {
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
    } else {
      setAdminUsers([]);
      setAdminUsersStatus('');
    }
  }, [canManageRoles]);

  useEffect(() => {
    if (workspaceTab === 'modIcons' && canManageModIcons) {
      void refreshModIconStatus();
    }
  }, [workspaceTab, canManageModIcons]);

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
          setCustomItems(payload.items);
          setCustomItemsStatus(`Предметов: ${payload.items.length}`);
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
  }, []);

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
  }, [workspaceTab, canCreateTemplates, canEditRecipes, canManageModIcons, canManageCloudFiles, canUseDebug]);

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
    if (heldItemRaw) {
      moveHeldCursor();
    }
  }, [heldItemRaw]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHeldItemRaw(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = recipeHotkeyAction(event);
      if (!action) {
        return;
      }
      if (event.repeat) {
        logHotkeyDebug('keydown ignored: repeat', { key: event.key, code: event.code }, 'warning');
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      const inspection = inspectActiveItemRaw();
      const raw = inspection.raw;
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
      if (action === 'recipe') {
        void openRecipeForItem(raw);
      } else {
        void openRecipeUsesForItem(raw);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hoveredItemRaw, heldItemRaw]);

  const summary = useMemo(() => `${matrix.length}x${matrix[0]?.length ?? 0}`, [matrix]);
  const recipeCraftMode = craftModeFromRecipeType(recipe.recipe_type);
  const recipeBindingMode: RecipeBindingMode = strictBinding ? 'strict' : 'soft';
  const structuredCraftRaw = useMemo(
    () => buildStructuredItemRaw(itemModDraft, itemNameDraft, itemMetaDraft, nbtRootDraft),
    [itemModDraft, itemNameDraft, itemMetaDraft, nbtRootDraft]
  );
  const outputDisplayNameFromResolver = recipe.output_resolution?.display_name;
  const filledCells = useMemo(() => matrix.flat().filter((cell) => cell && cell !== 'null').length, [matrix]);
  const nullCells = useMemo(() => matrix.flat().filter((cell) => !cell || cell === 'null').length, [matrix]);
  const unresolvedCells = useMemo(() => matrix.flat().filter((cell) => cell && !String(cell).startsWith('<')).length, [matrix]);
  const iconsResolved = recipe.output_resolution?.icon_url ? 1 : 0;
  const iconTotal = filledCells + (outputRaw ? 1 : 0);
  const inputStatusTone = !backendAvailable || lastApiStatus === t('values.error') || status.includes('Ошибка') || status.includes('Backend unavailable') ? 'warning' : status === t('status.loaded') ? 'success' : 'default';
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
      const fallbackResolution = typeof cell === 'string' ? (resolutionByRaw.get(cell) ?? (itemSearchIcons[cell] ? { item_raw: cell, icon_url: itemSearchIcons[cell], display_name: resolveCellTitle(cell), strategy: 'itempanel_cache' } : null)) : null;
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
    return { '--ui-scale': uiPreferences.ui_scale } as CSSProperties;
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
    if (craftHash === lastLocalDraftHashRef.current) {
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
        window.localStorage.setItem(localDraftStorageKey(authUser.email), JSON.stringify(payload));
        lastLocalDraftHashRef.current = craftHash;
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
    let cancelled = false;
    async function loadItemPanelTranslations() {
      const fallbackToFirstMeta = getItemPanelFallbackToFirstMetaEnabled();
      try {
        const cached = window.localStorage.getItem(ITEMPANEL_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as { entries?: ItemPanelEntry[] };
          if (Array.isArray(parsed.entries) && parsed.entries.length) {
            setItemPanelTranslations(buildItemPanelTranslationsFromEntries(parsed.entries, fallbackToFirstMeta));
          }
        }
      } catch {
        // ignore corrupted cache
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
          const uniqueEntries = dedupeItemPanelEntries(entries);
          setItemPanelTranslations(buildItemPanelTranslationsFromEntries(uniqueEntries, fallbackToFirstMeta));
          try {
            window.localStorage.setItem(ITEMPANEL_CACHE_KEY, JSON.stringify({ entries: uniqueEntries }));
          } catch {
            // ignore cache persistence errors
          }
        }
      } catch {
        // optional source
      }
    }
    void loadItemPanelTranslations();
    return () => {
      cancelled = true;
    };
  }, []);

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
  }, []);

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
  }, []);

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

  function patchPanelLayout(nextLayout: PanelLayoutItem[]) {
    persistUiPreferences({ ...latestUiPreferencesRef.current, panel_layout: normalizePanelLayout(nextLayout) });
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
  const neiCatalogEntries = useMemo(() => [...customItemEntries, ...itemPanelTranslations.entries], [customItemEntries, itemPanelTranslations.entries]);
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

  const filteredNeiItems = useMemo(() => {
    const query = neiSearchQuery.trim().toLowerCase();
    return query
      ? neiCatalogEntries.filter((entry) => (
        entry.key.includes(query)
        || entry.displayRu.toLowerCase().includes(query)
        || entry.displayEn.toLowerCase().includes(query)
        || String(entry.legacyId ?? '').includes(query)
      ))
      : neiCatalogEntries;
  }, [neiSearchQuery, neiCatalogEntries]);

  const neiPageCount = Math.max(1, Math.ceil(filteredNeiItems.length / NEI_PAGE_SIZE));
  const neiItems = useMemo(() => {
    const safePage = clamp(neiPage, 0, neiPageCount - 1);
    const start = safePage * NEI_PAGE_SIZE;
    return filteredNeiItems.slice(start, start + NEI_PAGE_SIZE);
  }, [filteredNeiItems, neiPage, neiPageCount]);

  const visibleNeiRawItems = useMemo(() => neiItems.map((entry) => itemPanelRaw(entry)), [neiItems]);
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
    const grouped = new Map<string, { raw: string; draftIds: Set<string> }>();
    recipeDraftTemplates.forEach((template) => {
      const raw = template.outputRaw;
      const group = grouped.get(raw) ?? { raw, draftIds: new Set<string>() };
      group.draftIds.add(template.id);
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
          searchText: `${entry.raw} ${title} ${panelEntry?.displayEn ?? ''} ${panelEntry?.legacyId ?? ''}`.toLowerCase()
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
      return left.title.localeCompare(right.title);
    });
  }, [customItems, draftItemSearchQuery, draftItemSortMode, itemPanelTranslations, recipeDraftTemplates]);
  const draftItemPageCount = Math.max(1, Math.ceil(draftItemEntries.length / DRAFT_ITEM_PAGE_SIZE));
  const draftItemsPage = useMemo(() => {
    const safePage = clamp(draftItemPage, 0, draftItemPageCount - 1);
    return draftItemEntries.slice(safePage * DRAFT_ITEM_PAGE_SIZE, safePage * DRAFT_ITEM_PAGE_SIZE + DRAFT_ITEM_PAGE_SIZE);
  }, [draftItemEntries, draftItemPage, draftItemPageCount]);
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
  }, [draftItemSearchQuery, draftItemSortMode]);

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
    try {
      window.localStorage.setItem(ITEM_SEARCH_ICON_CACHE_KEY, JSON.stringify(itemSearchIcons));
    } catch {
      // ignore cache persistence errors
    }
  }, [itemSearchIcons]);

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
    const [modid, ...nameParts] = entry.key.split(':');
    const itemName = nameParts.join(':');
    setItemModDraft(modid);
    setItemNameDraft(itemName);
    setItemMetaDraft(String(entry.meta));
    setNbtRootDraft({ kind: 'compound', entries: [] });
    setCollapsedNbtPaths({});
    const nextRaw = buildItemRawValue(entry.key, entry.meta);
    setCraftSourceDraft(nextRaw);
    setCraftSourceMode('structured');
    setItemSearchQuery(`${entry.key}:${entry.meta}`);
  }

  function setNbtPathCollapsed(path: string, collapsed: boolean) {
    setCollapsedNbtPaths((current) => ({ ...current, [path]: collapsed }));
  }

  function updateRootEntry(index: number, updater: (entry: NbtCompoundNode['entries'][number]) => NbtCompoundNode['entries'][number]) {
    setNbtRootDraft((current) => ({
      ...current,
      entries: current.entries.map((entry, entryIndex) => (entryIndex === index ? updater(entry) : entry))
    }));
  }

  function addRootEntry(type: NbtNodeType = 'int') {
    setNbtRootDraft((current) => ({
      ...current,
      entries: [...current.entries, { key: '', value: defaultNodeForType(type) }]
    }));
  }

  function renderNbtNodeEditor(node: NbtNode, path: string, onChange: (nextNode: NbtNode) => void): JSX.Element {
    const currentType = nodeType(node);
    const isCollapsed = collapsedNbtPaths[path] ?? false;
    if (node.kind === 'scalar') {
      return (
        <div className="nbt-row-grid">
          <input aria-label={`nbt-value-${path}`} type="text" value={node.value} placeholder="значение" onChange={(event) => onChange({ ...node, value: event.target.value })} />
          <select aria-label={`nbt-type-${path}`} value={currentType} onChange={(event) => onChange(normalizeNodeTypeChange(event.target.value as NbtNodeType, node))}>
            {nbtNodeTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
      );
    }
    if (node.kind === 'compound') {
      return (
        <div className="nbt-node-block">
          <div className="inline-actions">
            <button type="button" className="ghost-button" aria-label={`toggle-nbt-${path}`} onClick={() => setNbtPathCollapsed(path, !isCollapsed)}>{isCollapsed ? 'Развернуть' : 'Свернуть'}</button>
            <select aria-label={`nbt-type-${path}`} value={currentType} onChange={(event) => onChange(normalizeNodeTypeChange(event.target.value as NbtNodeType, node))}>
              {nbtNodeTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <button type="button" className="ghost-button" aria-label={`add-nbt-child-${path}`} onClick={() => onChange({ ...node, entries: [...node.entries, { key: '', value: defaultNodeForType('int') }] })}>Добавить поле</button>
          </div>
          {!isCollapsed ? (
            <div className="nbt-children">
              {node.entries.map((entry, index) => (
                <div key={path + index} className="nbt-entry-line">
                  <input aria-label={`nbt-key-${path}-${index}`} type="text" value={entry.key} placeholder="ключ" onChange={(event) => onChange({ ...node, entries: node.entries.map((nodeEntry, nodeIndex) => nodeIndex === index ? { ...nodeEntry, key: event.target.value } : nodeEntry) })} />
                  {renderNbtNodeEditor(entry.value, `${path}.${index}`, (nextValue) => onChange({
                    ...node,
                    entries: node.entries.map((nodeEntry, nodeIndex) => nodeIndex === index ? { ...nodeEntry, value: nextValue } : nodeEntry)
                  }))}
                  <button type="button" className="ghost-button" aria-label={`delete-nbt-child-${path}-${index}`} onClick={() => onChange({ ...node, entries: node.entries.filter((_, nodeIndex) => nodeIndex !== index) })}>Удалить</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      );
    }
    return (
      <div className="nbt-node-block">
        <div className="inline-actions">
          <button type="button" className="ghost-button" aria-label={`toggle-nbt-${path}`} onClick={() => setNbtPathCollapsed(path, !isCollapsed)}>{isCollapsed ? 'Развернуть' : 'Свернуть'}</button>
          <select aria-label={`nbt-type-${path}`} value={currentType} onChange={(event) => onChange(normalizeNodeTypeChange(event.target.value as NbtNodeType, node))}>
            {nbtNodeTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <button type="button" className="ghost-button" aria-label={`add-nbt-item-${path}`} onClick={() => onChange({ ...node, items: [...node.items, defaultNodeForType('int')] })}>Добавить элемент</button>
        </div>
        {!isCollapsed ? (
          <div className="nbt-children">
            {node.items.map((item, index) => (
              <div key={path + index} className="nbt-entry-line">
                <span className="nbt-list-index">[{index}]</span>
                {renderNbtNodeEditor(item, `${path}.${index}`, (nextNode) => onChange({
                  ...node,
                  items: node.items.map((value, valueIndex) => valueIndex === index ? nextNode : value)
                }))}
                <button type="button" className="ghost-button" aria-label={`delete-nbt-item-${path}-${index}`} onClick={() => onChange({ ...node, items: node.items.filter((_, valueIndex) => valueIndex !== index) })}>Удалить</button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
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

  function setCellRaw(target: CraftEditorTarget, raw: string) {
    if (target.kind === 'output') {
      setOutputRaw(raw);
      setRecipe((current) => ({
        ...current,
        output: { ...current.output, raw },
        output_resolution: itemSearchIcons[raw]
          ? { item_raw: raw, icon_url: itemSearchIcons[raw], display_name: resolveCellTitle(raw), strategy: 'itempanel_cache' }
          : current.output_resolution
      }));
      setSaveStatus(t('values.unsavedChanges'));
      return;
    }
    setMatrixCell(target.row, target.col, raw);
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

  function handleRecipeItemDrop(target: CraftEditorTarget, raw: string) {
    const normalized = raw.trim();
    if (!normalized) return;
    setCellRaw(target, normalized);
  }

  function setMatrixCell(row: number, col: number, raw: string | null) {
    const nextRaw = raw === null || raw === '' || raw === 'null' ? null : raw;
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

  function handleCraftCellContextMenu(row: number, col: number) {
    setMatrixCell(row, col, null);
  }

  function handleCraftOutputClick() {
    if (!heldItemRaw) {
      return;
    }
    handleRecipeItemDrop({ kind: 'output' }, heldItemRaw);
  }

  function handleNeiItemPick(raw: string) {
    setHeldItemRaw((current) => (current === raw ? null : raw));
  }

  function findUploadedDraftRecipeBlock(raw: string): UploadedDraftRecipeMatch | null {
    for (const key of recipeLookupKeysForRaw(raw)) {
      const match = uploadedDraftRecipeIndex.get(key);
      if (match) return match;
    }
    return null;
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
      const match = lookupResults.find(({ result }) => Boolean(result.matches[0]))?.result.matches[0];
      if (!match) {
        logHotkeyDebug('backend lookup empty, checking uploaded drafts', { raw: normalizedRaw, keys: lookupKeys.join(', ') }, 'warning');
        if (await openRecipeFromUploadedDraft(normalizedRaw, draftMatch ?? undefined)) {
          return;
        }
        setStatus(`Рецепт для ${normalizedRaw} не найден в Recipes и локальных черновиках.`);
        setLastApiStatus(t('values.ok'));
        return;
      }
      applyRecipe(match, undefined, { rememberCurrent: true });
      logHotkeyDebug('recipe applied', { requestedRaw: normalizedRaw, outputRaw: match.output.raw, recipeUid: match.recipe_uid, sourcePath: match.source.path ?? 'Recipes' }, 'success');
      setHeldItemRaw(null);
      setWorkspaceTab('editor');
      setStatus(`Открыт рецепт ${match.output.raw} из ${match.source.path ?? 'Recipes'}.`);
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

  function restoreRecipeFromHistory(direction: -1 | 1) {
    if (direction === -1) {
      const previous = recipeBackHistory[recipeBackHistory.length - 1];
      if (!previous) return;
      setRecipeBackHistory((current) => current.slice(0, -1));
      setRecipeForwardHistory((current) => [createRecipeHistoryEntry(), ...current].slice(0, 40));
      applyRecipe(previous.recipe, previous.input);
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

  function buildRecipeSource(): string {
    if (recipe.recipe_type === 'ct_shapeless') {
      const ingredients = matrix.flat().filter((cell): cell is string => Boolean(cell && cell !== 'null'));
      return `recipes.addShapeless(${outputRaw.trim()}, [${ingredients.join(', ')}]);\n`;
    }
    const call = recipe.recipe_type === 'avaritia_extreme_shaped'
      ? 'mods.avaritia.ExtremeCrafting.addShaped'
      : 'recipes.addShaped';
    const sourceMatrix = matrixForRecipeSource(matrix, recipe.recipe_type, recipeBindingMode);
    const rows = sourceMatrix
      .map((row) => `  [${row.map((cell) => cell?.trim() || 'null').join(', ')}]`)
      .join(',\n');
    return `${call}(${outputRaw.trim()}, [\n${rows}\n]);\n`;
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
    downloadTextFile(currentRecipeFilename(), input.trim() ? input : buildRecipeSource());
    setStatus('Рецепт скачан.');
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
      const updated = await updateRecipe({ recipeUid: recipe.recipe_uid, recipeType: recipe.recipe_type, outputRaw, matrix, name: recipe.name, bindingMode: recipeBindingMode });
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
        const response = await saveRecipeAs({ recipeUid: created.recipe_uid, recipeType: created.recipe_type, outputRaw, matrix, name: created.name, targetPath, bindingMode: recipeBindingMode });
        applyRecipe(response.recipe, input);
      } else {
        const response = await saveRecipeAs({ recipeUid: recipe.recipe_uid, recipeType: recipe.recipe_type, outputRaw, matrix, name: recipe.name, targetPath, bindingMode: recipeBindingMode });
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

  async function handleSaveToCloud() {
    if (!requireOutputForSave()) return;
    if (recipe.source.kind === 'generated' || recipe.recipe_uid === 'new-recipe') {
      await handleSaveAs();
      return;
    }
    await handleSave();
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
    const modIconStyle = buildModIconStyle(modIconManifest, modIconByRaw.get(raw));
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
    const modIconStyle = buildModIconStyle(modIconManifest, modIconByRaw.get(raw));
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

  function renderRecipeBuilderPanel() {
    const gridSize = matrix.length;
    const canSaveActions = Boolean(getValidOutputRaw()) && (canCreateTemplates || canEditRecipes);
    return (
      <div className="workspace-panel-shell panel-recipe-builder">
        <Panel
          title="Создать рецепт"
          subtitle="Сетка, входные предметы и результат"
          className="recipe-builder-panel"
          actions={(
            <div className="inline-actions">
              <button type="button" className="ghost-button icon-button" aria-label="recipe-history-back" title="Предыдущий открытый рецепт" disabled={!recipeBackHistory.length} onClick={() => restoreRecipeFromHistory(-1)}>‹</button>
              <button type="button" className="ghost-button icon-button" aria-label="recipe-history-forward" title="Следующий открытый рецепт" disabled={!recipeForwardHistory.length} onClick={() => restoreRecipeFromHistory(1)}>›</button>
              <button type="button" className="secondary-button" aria-label="save-local" disabled={!canSaveActions} onClick={downloadCurrentRecipe}>Сохранить локально</button>
              <button type="button" aria-label="save-cloud" disabled={!canSaveActions} onClick={() => void handleSaveToCloud()}>Сохранить в облако</button>
              <button type="button" className="secondary-button" aria-label="save-draft-template" disabled={!canSaveActions} onClick={() => void handleSaveDraftTemplate()}>Сохранить в черновик</button>
              <button type="button" className="ghost-button" disabled={!canCreateTemplates && !canEditRecipes} onClick={clearEditor}>Очистить</button>
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
            <label className="field-block recipe-output-drop">
              <span>Результат крафта</span>
              <input
                aria-label="output-raw"
                value={outputRaw}
                onChange={(event) => handleRecipeItemDrop({ kind: 'output' }, event.target.value)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  handleRecipeItemDrop({ kind: 'output' }, event.dataTransfer.getData('text/plain'));
                }}
              />
            </label>
          </div>
          <div className="grid-meta"><span>{t('status.size')}</span><strong>{summary}</strong><span>{t('fields.parsedCells')}</span><strong>{filledCells}</strong><span>{t('fields.nullCells')}</span><strong>{nullCells}</strong></div>
          <div className="grid-scroll-zone recipe-builder-grid">
            <div className="recipe-craft-board">
              <RecipeGrid
                matrix={matrixWithResolution}
                atlas={itemPanelAtlas}
                atlasImageUrl={itemPanelAtlas ? normalizeAtlasImageUrl(itemPanelAtlas.image_url) : ''}
                displayMode={uiPreferences.display_mode}
                animationsEnabled={areAnimationsEnabled}
                editorMode={(canCreateTemplates || canEditRecipes) ? uiPreferences.editor_mode : 'view'}
                heldItemRaw={heldItemRaw}
                tooltipsDisabled={isLayoutSettingsOpen || isCraftEditorOpen || isNbtEditorOpen || Boolean(customItemForm)}
                resolveCellTitle={resolveCellTitle}
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
                title={outputDisplayName ?? outputRaw}
              >
                {renderCraftItemIcon(outputRaw, recipe.output_resolution?.icon_url, recipe.output_resolution?.animated, recipe.output_resolution?.animation_meta?.frametime, outputDisplayName ?? outputRaw)}
              </button>
              <button type="button" className="secondary-button craft-detail-button" disabled={!canCreateTemplates && !canEditRecipes} onClick={() => openCraftEditorModal({ kind: 'output' })}>Детальные настройки</button>
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
    const known = keys.map((key) => recipeAvailability[key]).find((value) => value !== undefined);
    if (known === true) return 'available';
    if (known === false) return 'missing';
    return 'unknown';
  }

  function rawWithoutNbt(raw: string): string {
    return raw.replace(/\.withTag\([\s\S]*\)\s*$/, '').trim();
  }

  function openCustomItemEditor(raw: string, scope: 'global' | 'user') {
    const existing = customItems.find((item) => item.item_raw === raw && item.scope === scope);
    const sourceRaw = existing?.source_raw ?? raw;
    const itemRaw = existing?.item_raw ?? raw;
    const parsed = parseRawForEditor(itemRaw);
    const nbtRaw = existing?.nbt_raw ?? '';
    setCustomItemNbtRoot(nbtRaw ? (parseNbtNode(nbtRaw).kind === 'compound' ? parseNbtNode(nbtRaw) as NbtCompoundNode : { kind: 'compound', entries: [{ key: 'value', value: parseNbtNode(nbtRaw) }] }) : parsed.nbtRoot);
    setCustomItemForm({
      id: existing?.id ?? null,
      scope,
      sourceRaw,
      itemRaw,
      displayName: existing?.display_name ?? resolveCellTitle(raw).replace(/\*$/, '') ?? raw,
      nbtRaw
    });
    setNeiContextMenu(null);
  }

  async function saveCustomItemForm() {
    if (!customItemForm) return;
    const nbtRaw = buildNbtRawFromRoot(customItemNbtRoot);
    const itemRawBase = rawWithoutNbt(customItemForm.itemRaw);
    const itemRaw = nbtRaw ? `${itemRawBase}.withTag(${nbtRaw})` : itemRawBase;
    try {
      const payload = await saveCustomItem({
        id: customItemForm.id,
        scope: customItemForm.scope,
        source_raw: customItemForm.sourceRaw,
        item_raw: itemRaw,
        display_name: customItemForm.displayName.trim() || itemRaw,
        nbt_raw: nbtRaw || null
      });
      setCustomItems((current) => {
        const withoutSaved = current.filter((item) => item.id !== payload.item.id);
        return [payload.item, ...withoutSaved];
      });
      setCustomItemsStatus('Предмет сохранен');
      setCustomItemForm(null);
    } catch (error) {
      setCustomItemsStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function removeCustomItem(item: CustomItem) {
    try {
      await deleteCustomItem(item.id);
      setCustomItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setCustomItemsStatus('Предмет удален');
      setNeiContextMenu(null);
    } catch (error) {
      setCustomItemsStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function addCustomNbtRootEntry(type: NbtNodeType) {
    setCustomItemNbtRoot((current) => ({ ...current, entries: [...current.entries, { key: '', value: defaultNodeForType(type) }] }));
  }

  function updateCustomNbtRootEntry(index: number, updater: (entry: { key: string; value: NbtNode }) => { key: string; value: NbtNode }) {
    setCustomItemNbtRoot((current) => ({
      ...current,
      entries: current.entries.map((entry, entryIndex) => entryIndex === index ? updater(entry) : entry)
    }));
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
              const iconUrl = itemSearchIcons[raw];
              const modIconStyle = buildModIconStyle(modIconManifest, modIconByRaw.get(raw));
              const atlasEntry = resolveAtlasEntryFromRaw(itemPanelAtlas, raw, wildcardCycleTick);
              const availability = getRecipeAvailability(raw);
              const customForRaw = customItems.find((item) => item.item_raw === raw);
              const atlasStyle = itemPanelAtlas && atlasEntry
                ? {
                  backgroundImage: `url(${atlasImageUrl})`,
                  backgroundPosition: `-${atlasEntry.x}px -${atlasEntry.y}px`,
                  backgroundSize: `${itemPanelAtlas.columns * itemPanelAtlas.tile_size}px ${itemPanelAtlas.rows * itemPanelAtlas.tile_size}px`
                }
                : undefined;
              return (
                <button
                  key={itemPanelEntryIdentity(entry)}
                  type="button"
                  className={`nei-item recipe-${availability} ${entry.customItemId ? 'is-custom' : ''} ${heldItemRaw === raw ? 'is-held' : ''}`.trim()}
                  title={`${entry.displayRu || entry.displayEn || entry.key} ${raw}${availability === 'available' ? ' - рецепт найден' : availability === 'missing' ? ' - рецепта нет' : ''}`}
                  aria-label={`nei-item-${raw}`}
                  data-item-raw={raw}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', raw);
                    event.dataTransfer.effectAllowed = 'copy';
                    setHeldItemRaw(raw);
                  }}
                  onDragEnd={() => {
                    setHeldItemRaw((current) => (current === raw ? null : current));
                  }}
                  onMouseEnter={() => updateHoveredItemRaw(raw)}
                  onFocus={() => updateHoveredItemRaw(raw)}
                  onMouseLeave={() => updateHoveredItemRaw((current) => (current === raw ? null : current))}
                  onBlur={() => updateHoveredItemRaw((current) => (current === raw ? null : current))}
                  onClick={() => handleNeiItemPick(raw)}
                  onDoubleClick={() => handleRecipeItemDrop({ kind: 'output' }, raw)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setNeiContextMenu({ raw, x: event.clientX, y: event.clientY });
                  }}
                >
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
                  <span className="nei-name" aria-hidden="true">{entry.displayRu || entry.displayEn || entry.key}</span>
                  <span className="nei-raw" aria-hidden="true">{raw}</span>
                  {customForRaw ? <span className="nei-custom-dot" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </Panel>
      </div>
    );
  }

  function renderNeiContextMenu() {
    if (!neiContextMenu) return null;
    const raw = neiContextMenu.raw;
    const custom = customItems.find((item) => item.item_raw === raw);
    return (
      <div
        className="context-menu nei-context-menu"
        style={{ left: neiContextMenu.x, top: neiContextMenu.y }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <strong>{raw}</strong>
        <button type="button" onClick={() => openCustomItemEditor(raw, 'user')}>Редактировать для себя</button>
        {canManageSettings ? <button type="button" onClick={() => openCustomItemEditor(raw, 'global')}>Редактировать глобально</button> : null}
        <button type="button" onClick={() => openCustomItemEditor(raw, 'user')}>NBT редактор</button>
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
        style={{ left: draftTemplateContextMenu.x, top: draftTemplateContextMenu.y }}
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
        style={{ left: cloudContextMenu.x, top: cloudContextMenu.y }}
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
                    title={selectedTitle}
                  >
                    {renderCraftItemIcon(selectedRecipe.output.raw, selectedRecipe.output_resolution?.icon_url, selectedRecipe.output_resolution?.animated, selectedRecipe.output_resolution?.animation_meta?.frametime, selectedTitle)}
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
                    heldItemRaw={null}
                    tooltipsDisabled={false}
                    resolveCellTitle={resolveCellTitle}
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
          <strong>R/U debug</strong>
          <button type="button" className="ghost-button" onClick={() => setHotkeyDebugEvents([])}>clear</button>
        </div>
        <ol className="hotkey-debug-list">
          {hotkeyDebugEvents.map((entry) => (
            <li key={entry.id} className={`hotkey-debug-event hotkey-debug-${entry.level}`}>
              <div className="hotkey-debug-line">
                <span>{entry.timestamp}</span>
                <strong>{entry.message}</strong>
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
    return (
      <div className="modal-backdrop" role="presentation" onClick={() => setCustomItemForm(null)}>
        <div className="modal modal-scalable modal-custom-item" role="dialog" aria-modal="true" aria-label="Редактор предмета" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <h2>Редактор предмета</h2>
            <div className="inline-actions">
              <button type="button" onClick={() => setCustomItemForm(null)}>Закрыть</button>
            </div>
          </div>
          <div className="settings-modal-body">
            <div className="settings-grid">
              <label className="field-block">
                <span>Область</span>
                <select
                  aria-label="custom-item-scope"
                  value={customItemForm.scope}
                  disabled={!canUseGlobalScope}
                  onChange={(event) => setCustomItemForm((current) => current ? { ...current, scope: event.target.value as 'global' | 'user' } : current)}
                >
                  <option value="user">Только для меня</option>
                  <option value="global">Для всех</option>
                </select>
              </label>
              <label className="field-block">
                <span>Название</span>
                <input aria-label="custom-item-name" type="text" value={customItemForm.displayName} onChange={(event) => setCustomItemForm((current) => current ? { ...current, displayName: event.target.value } : current)} />
              </label>
            </div>
            <label className="field-block">
              <span>Raw предмета</span>
              <input aria-label="custom-item-raw" type="text" value={customItemForm.itemRaw} onChange={(event) => setCustomItemForm((current) => current ? { ...current, itemRaw: event.target.value } : current)} />
              <span className="inline-hint">Для переливающихся вариантов укажите meta `*`, например `&lt;minecraft:wool:*&gt;`.</span>
            </label>
            <div className="settings-section">
              <div className="settings-section-title">
                <h3>NBT</h3>
                <span>Эти поля попадут в `.withTag(...)` у созданного предмета.</span>
              </div>
              <div className="inline-actions">
                <button type="button" className="ghost-button" aria-label="custom-add-nbt-field" onClick={() => addCustomNbtRootEntry('int')}>Добавить поле</button>
                <button type="button" className="ghost-button" aria-label="custom-add-nbt-object" onClick={() => addCustomNbtRootEntry('compound')}>Добавить объект</button>
                <button type="button" className="ghost-button" aria-label="custom-add-nbt-list" onClick={() => addCustomNbtRootEntry('list')}>Добавить список</button>
              </div>
              {customItemNbtRoot.entries.length ? (
                <div className="suggestions-list nbt-editor-list" aria-label="custom-nbt-editor-list">
                  {customItemNbtRoot.entries.map((entry, index) => (
                    <div key={`custom-root-entry-${index}`} className="suggestion-item">
                      <div className="nbt-entry-line">
                        <input aria-label={`custom-nbt-key-${index}`} type="text" value={entry.key} placeholder="ключ" onChange={(event) => updateCustomNbtRootEntry(index, (current) => ({ ...current, key: event.target.value }))} />
                        {renderNbtNodeEditor(entry.value, `custom.${index}`, (nextNode) => updateCustomNbtRootEntry(index, (current) => ({ ...current, value: nextNode })))}
                        <button type="button" className="ghost-button" aria-label={`delete-custom-nbt-root-${index}`} onClick={() => setCustomItemNbtRoot((current) => ({ ...current, entries: current.entries.filter((_, entryIndex) => entryIndex !== index) }))}>Удалить</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="inline-hint inline-hint-warning">NBT не задан.</div>
              )}
            </div>
            {customItemsStatus ? <div className="inline-status inline-status-default">{customItemsStatus}</div> : null}
            <div className="inline-actions">
              <button type="button" className="secondary-button" onClick={() => void saveCustomItemForm()}>Сохранить предмет</button>
              <button type="button" className="ghost-button" onClick={() => setCustomItemForm(null)}>Отмена</button>
            </div>
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
            <Panel title="Иконки модов" subtitle="ZIP архивы формата modid_x32.zip или modid_x256.zip с PNG внутри">
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
                <button type="button" disabled={modIconUploading} onClick={() => void refreshModIconStatus()}>Обновить статус</button>
                <button type="button" className="secondary-button" disabled={modIconGenerating || !(modIconStatus?.archives.length)} onClick={() => void handleGenerateModIconAtlases()}>Сгенерировать атласы</button>
              </div>
              {modIconMessage ? <div className="inline-status inline-status-default">{modIconMessage}</div> : null}
              <div className="admin-file-list">
                {(modIconStatus?.archives ?? []).map((archive) => (
                  <div key={archive.name} className="admin-file-row">
                    <div>
                      <strong>{archive.name}</strong>
                      <span>{formatFileSize(archive.size)}</span>
                    </div>
                    <span>{archive.modifiedAt ? new Date(archive.modifiedAt).toLocaleString() : '-'}</span>
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
    return (
      <div className="workspace-layout workspace-layout-admin">
        <div className="workspace-column workspace-left">
          <div className="workspace-panel-shell panel-admin-cloud">
            <Panel title="Облачное хранилище" subtitle="Все найденные .zs файлы">
              <div className="admin-users-toolbar">
                <button type="button" className="secondary-button" onClick={() => void refreshCloudFiles()}>Обновить</button>
                <span>{cloudStatus}</span>
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

  function renderDraftCatalogIcon(raw: string) {
    const modIconStyle = buildModIconStyle(modIconManifest, modIconByRaw.get(raw));
    if (modIconStyle) {
      return <span className="nei-atlas-icon" style={modIconStyle} aria-hidden="true" />;
    }
    const atlasEntry = resolveAtlasEntryFromRaw(itemPanelAtlas, raw, wildcardCycleTick);
    const atlasStyle = itemPanelAtlas && atlasEntry ? buildAtlasIconStyle(itemPanelAtlas, atlasEntry) : undefined;
    const iconUrl = itemSearchIcons[raw];
    if (atlasStyle) {
      return <span className="nei-atlas-icon" style={atlasStyle} aria-hidden="true" />;
    }
    if (iconUrl) {
      return <img src={iconUrl} alt="" onError={() => setItemSearchIcons((current) => ({ ...current, [raw]: null }))} />;
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
              <option value="drafts-desc">Сначала больше черновиков</option>
              <option value="drafts-asc">Сначала меньше черновиков</option>
              <option value="name">По названию</option>
            </select>
          </div>
          <div className="nei-pager" aria-label="draft-item-pagination">
            <button type="button" className="ghost-button icon-button" aria-label="draft-items-prev-page" disabled={draftItemPage <= 0} onClick={() => changeDraftItemPage(-1)}>‹</button>
            <strong>{draftItemPage + 1}/{draftItemPageCount}</strong>
            <button type="button" className="ghost-button icon-button" aria-label="draft-items-next-page" disabled={draftItemPage >= draftItemPageCount - 1} onClick={() => changeDraftItemPage(1)}>›</button>
          </div>
          <div className="draft-item-list" aria-label="draft-item-list">
            {draftItemsPage.map((entry) => {
              const raw = entry.raw;
              const draftCount = entry.draftCount;
              const availability = getRecipeAvailability(raw);
              const selected = raw === selectedDraftItemRaw;
              const icon = renderDraftCatalogIcon(raw);
              return (
                <button
                  key={raw}
                  type="button"
                  className={`draft-item-button recipe-${availability} ${draftCount > 0 ? 'has-drafts' : ''} ${selected ? 'active' : ''}`.trim()}
                  aria-label={`draft-item-${raw}`}
                  data-item-raw={raw}
                  title={`${entry.title} ${raw}`}
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
                </button>
              );
            })}
            {!draftItemsPage.length ? <div className="draft-empty-state">Нет сохранённых шаблонов.</div> : null}
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
                    <RecipeGrid matrix={activeDraftPreview.recipe.matrix} atlas={itemPanelAtlas} atlasImageUrl={draftPreviewAtlasUrl} displayMode={uiPreferences.display_mode} animationsEnabled={areAnimationsEnabled} editorMode="view" heldItemRaw={null} tooltipsDisabled resolveCellTitle={resolveCellTitle} onItemHover={() => undefined} onCellClick={() => undefined} onCellContextMenu={() => undefined} onCellChange={() => undefined} />
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

  function renderAdminUsersPanel() {
    if (!canManageRoles) return null;
    return (
      <div className="workspace-panel-shell panel-admin-users">
        <Panel title="Персонал" subtitle="Роли и доступ по Google почте">
          {renderAdminUsersContent()}
        </Panel>
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
    if (workspaceTab === 'modIcons' && canManageModIcons) {
      return renderModIconsPanel();
    }
    if (workspaceTab === 'cloud' && canManageCloudFiles) {
      return renderCloudStoragePanel();
    }
    if (workspaceTab === 'debug' && canUseDebug) {
      return (
        <div className="workspace-layout workspace-layout-debug">
          {renderColumn([getPanelForTab('statusBar'), getPanelForTab('info')], 'workspace-left')}
          {renderColumn([getPanelForTab('diagnostics'), getPanelForTab('debug')], 'workspace-center')}
          <div className="workspace-column workspace-right">
            {renderAdminUsersPanel()}
            {renderColumn([getPanelForTab('raw')], '')}
          </div>
        </div>
      );
    }
    return (
      <div className="workspace-layout workspace-layout-editor workspace-layout-builder workspace-layout-main">
        <div className="workspace-column workspace-center">
          {renderRecipeBuilderPanel()}
          {renderRecipeFilesPanel()}
        </div>
        <div className="workspace-column workspace-right">
          {renderNeiPanel()}
        </div>
      </div>
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
                  title={t('panel.output')}
                >
                  {renderCraftItemIcon(outputRaw, recipe.output_resolution?.icon_url, recipe.output_resolution?.animated, recipe.output_resolution?.animation_meta?.frametime, outputDisplayName ?? outputRaw)}
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
                <RecipeGrid matrix={matrixWithResolution} atlas={itemPanelAtlas} atlasImageUrl={itemPanelAtlas ? normalizeAtlasImageUrl(itemPanelAtlas.image_url) : ''} displayMode={uiPreferences.display_mode} animationsEnabled={areAnimationsEnabled} editorMode={uiPreferences.editor_mode} heldItemRaw={heldItemRaw} tooltipsDisabled={isLayoutSettingsOpen || isCraftEditorOpen || isNbtEditorOpen || Boolean(customItemForm)} resolveCellTitle={resolveCellTitle} onItemHover={updateHoveredItemRaw} onCellClick={handleCraftCellClick} onCellContextMenu={handleCraftCellContextMenu} onCellDrop={(row, col, value) => handleRecipeItemDrop({ kind: 'cell', row, col }, value)} onCellChange={(row, col, value) => {
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
                  <label className="field-block"><span>Сетка</span><select aria-label="settings-grid-size" value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))}>{[2, 3, 9].map((size) => <option key={size} value={size}>{size}x{size}</option>)}</select></label>
                  <label className="field-block"><span>Тип</span><select aria-label="settings-craft-mode" value={recipeCraftMode} onChange={(event) => setRecipeCraftMode(event.target.value as RecipeCraftMode)}><option value="shaped">Форменный</option><option value="shapeless" disabled={gridSize === 9}>Бесформенный</option></select></label>
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

  return (
    <main className={`app-shell theme-${uiPreferences.theme_mode} density-${uiPreferences.density_mode} mode-${uiPreferences.editor_mode} columns-${uiPreferences.workspace_layout.columns} ${uiPreferences.workspace_layout.compact_header ? 'compact-header' : ''}`} style={getAppShellStyle()} onMouseDownCapture={handleHeldItemOutsideMouseDown}>
      <div className="utility-bar">
        <strong>CubixRecipes</strong>
        <nav className="main-tabs" aria-label="workspace-tabs">
          {workspaceTabs.map((tab) => (
            <button key={tab.id} type="button" className={`main-tab-button ${workspaceTab === tab.id ? 'active' : ''}`} onClick={() => setWorkspaceTab(tab.id)}>
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
          <label className="language-switch compact-switch"><span>{t('app.language')}</span><select aria-label={t('app.language')} disabled={!canManageSettings} value={uiPreferences.language} onChange={(event) => patchUiPreferences({ language: event.target.value as UiLanguage })}><option value="ru">Русский</option><option value="en">English</option></select></label>
          {canManageSettings ? <button type="button" className="secondary-button" onClick={() => setIsLayoutSettingsOpen(true)}>{t('app.settings')}</button> : null}
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
      {renderNeiContextMenu()}
      {renderDraftTemplateContextMenu()}
      {renderCloudContextMenu()}
      {renderCustomItemModal()}
      {renderRecipeUsesModal()}
      {renderCloudUploadConflictModal()}
      {renderCloudSaveModal()}

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
              <label className="field-block settings-scale-control">
                <span>Масштаб интерфейса</span>
                <select aria-label="ui-scale" value={uiPreferences.ui_scale} onChange={(event) => patchUiPreferences({ ui_scale: Number(event.target.value) as UiScale })}>
                  <option value={1}>100%</option>
                  <option value={1.15}>115%</option>
                  <option value={1.3}>130%</option>
                  <option value={1.5}>150%</option>
                </select>
              </label>
              <section className="settings-section">
                <div className="settings-section-title">
                  <h3>R/U debug</h3>
                  <span>Логи наведения, клавиш и поиска рецепта видны только админам.</span>
                </div>
                <label className="field-block">
                  <span>Включить отладку R/U</span>
                  <input
                    aria-label="hotkey-debug-enabled"
                    type="checkbox"
                    checked={isHotkeyDebugEnabled}
                    onChange={(event) => setHotkeyDebugEnabledForAdmin(event.target.checked)}
                  />
                </label>
              </section>
              <section className="settings-section">
                <div className="settings-section-title">
                  <h3>Права персонала</h3>
                  <span>Роли выдаются по Google почте</span>
                </div>
                {canManageRoles ? renderAdminUsersContent() : <div className="inline-hint inline-hint-warning">Управление ролями доступно только администраторам.</div>}
              </section>
              <section className="settings-section">
                <div className="settings-section-title">
                  <h3>Доступ по ролям</h3>
                  <span>Индивидуальные права сверх роли потребуют отдельной схемы хранения в backend.</span>
                </div>
                <div className="permissions-grid">
                  <div><strong>admin</strong><span>файлы, рецепты, настройки, роли, отладка</span></div>
                  <div><strong>moderator</strong><span>создание шаблонов и черновиков</span></div>
                  <div><strong>default</strong><span>только просмотр</span></div>
                </div>
              </section>
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
                          const raw = `<${entry.key}${entry.meta > 0 ? `:${entry.meta}` : ''}>`;
                          const iconUrl = itemSearchIcons[raw];
                          const modIconStyle = buildModIconStyle(modIconManifest, modIconByRaw.get(raw));
                          return (
                            <span className="suggestion-icon-slot" aria-hidden="true">
                              {modIconStyle ? <span className="nei-atlas-icon" style={modIconStyle} /> : iconUrl ? <img src={iconUrl} alt="" loading="lazy" /> : '□'}
                            </span>
                          );
                        })()}
                        <div className="suggestion-content">
                          <strong>{`<${entry.key}${entry.meta > 0 ? `:${entry.meta}` : ''}>`}</strong>
                          <span>{entry.displayRu}</span>
                          {entry.displayEn && entry.displayEn !== entry.displayRu ? <span>{entry.displayEn}</span> : null}
                        </div>
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
              <div className="inline-actions nbt-toolbar">
                <button type="button" className="secondary-button" aria-label="add-nbt-field" onClick={() => addRootEntry('int')}>Добавить поле</button>
                <button type="button" className="secondary-button" aria-label="add-nbt-object" onClick={() => addRootEntry('compound')}>Добавить объект</button>
                <button type="button" className="secondary-button" aria-label="add-nbt-list" onClick={() => addRootEntry('list')}>Добавить список</button>
              </div>
              {nbtRootDraft.entries.length ? (
                <div className="suggestions-list nbt-editor-list" aria-label="nbt-editor-list">
                  {nbtRootDraft.entries.map((entry, index) => (
                    <div key={`root-entry-${index}`} className="suggestion-item">
                      <div className="nbt-entry-line">
                        <input aria-label={`nbt-key-${index}`} type="text" value={entry.key} placeholder="ключ" onChange={(event) => updateRootEntry(index, (current) => ({ ...current, key: event.target.value }))} />
                        {renderNbtNodeEditor(entry.value, `root.${index}`, (nextNode) => updateRootEntry(index, (current) => ({ ...current, value: nextNode })))}
                        <button type="button" className="ghost-button" aria-label={`delete-nbt-root-${index}`} onClick={() => setNbtRootDraft((current) => ({ ...current, entries: current.entries.filter((_, entryIndex) => entryIndex !== index) }))}>Удалить</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="inline-hint inline-hint-warning">Добавьте NBT поле/объект/список.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
