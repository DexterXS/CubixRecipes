import { type CSSProperties, type MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ActionToolbar } from '../components/ActionToolbar';
import { Panel } from '../components/Panel';
import { RecipeGrid } from '../components/RecipeGrid';
import { StatusBar } from '../components/StatusBar';
import { AnimatedIcon } from '../components/AnimatedIcon';
import { apiPath, getBackendTargetHint, getItemPanelFallbackToFirstMetaEnabled } from '../config/runtime';
import { createTranslator, getPanelLabel, getTabLabel } from '../i18n';
import { createRecipeTemplate, getItemPanelAtlas, getProjectSettings, listUsers, parseText, resolveItemRaw, saveRecipeAs, searchRecipesByOutput, updateProjectUiPreferences, updateRecipe, updateUserRole } from '../services/api';
import { logFrontendEvent } from '../services/debugLog';
import { can } from '../auth/permissions';
import { AppTab, AuthUser, CellValue, DensityMode, DisplayMode, EditorMode, ItemPanelAtlas, ItemPanelAtlasEntry, PanelId, PanelLayoutItem, ProjectSettings, RecipeView, ThemeMode, UiLanguage, UiPreferences, UiScale, UserRole, WorkspaceLayout } from '../types';

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

const allPanelIds: PanelId[] = defaultPanelLayout.map((panel) => panel.id);
type ModalScaleKey = 'help' | 'layout' | 'craft' | 'nbtTree';
type WorkspaceTab = 'editor' | 'recipe' | 'items' | 'debug';

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
};

type ItemPanelModSummary = {
  modid: string;
  itemCount: number;
  loadedCount: number;
  completionText: string;
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

type CraftEditorTarget =
  | { kind: 'output' }
  | { kind: 'cell'; row: number; col: number };

type NbtScalarType = 'byte' | 'short' | 'int' | 'long' | 'float' | 'double' | 'string' | 'byte_array' | 'int_array' | 'long_array';
type NbtNodeType = NbtScalarType | 'list' | 'compound';
type NbtScalarNode = { kind: 'scalar'; value: string; scalarType: NbtScalarType };
type NbtListNode = { kind: 'list'; items: NbtNode[] };
type NbtCompoundNode = { kind: 'compound'; entries: { key: string; value: NbtNode }[] };
type NbtNode = NbtScalarNode | NbtListNode | NbtCompoundNode;

interface AppProps {
  authUser: AuthUser;
  onLogout: () => Promise<void>;
}

function itemPanelEntryIdentity(entry: ItemPanelEntry): string {
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

function normalizeAtlasImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith('/api/')) {
    return apiPath(imageUrl.slice(4));
  }
  return imageUrl;
}

function resolveAtlasEntryFromRaw(atlas: ItemPanelAtlas | null | undefined, raw: string): ItemPanelAtlasEntry | undefined {
  const exact = atlas?.entries[raw];
  if (exact) return exact;
  const parsed = parseItemRaw(raw);
  if (!atlas || !parsed) return undefined;
  const entries = Object.values(atlas.entries);
  const byKeyMeta = entries.find((entry) => entry.item_key === parsed.key && (entry.meta ?? 0) === (parsed.meta ?? 0));
  const byKeyZero = entries.find((entry) => entry.item_key === parsed.key && (entry.meta ?? 0) === 0);
  const firstByKey = entries.find((entry) => entry.item_key === parsed.key);
  if (parsed.wildcardMeta) {
    return firstByKey ?? byKeyZero;
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

export default function App({ authUser, onLogout }: AppProps) {
  const [input, setInput] = useState('');
  const [matrix, setMatrix] = useState<CellValue[][]>(cloneMatrix(defaultMatrix));
  const [status, setStatus] = useState('Р“РѕС‚РѕРІРѕ');
  const [strictBinding, setStrictBinding] = useState(true);
  const [metaMode, setMetaMode] = useState('strict');
  const [recipe, setRecipe] = useState<RecipeView>(defaultRecipe);
  const [outputRaw, setOutputRaw] = useState(defaultRecipe.output.raw);
  const [isLayoutSettingsOpen, setIsLayoutSettingsOpen] = useState(false);
  const [isCraftEditorOpen, setIsCraftEditorOpen] = useState(false);
  const [isNbtEditorOpen, setIsNbtEditorOpen] = useState(false);
  const [craftEditorTarget, setCraftEditorTarget] = useState<CraftEditorTarget>({ kind: 'output' });
  const [craftSourceDraft, setCraftSourceDraft] = useState('');
  const [itemModDraft, setItemModDraft] = useState('minecraft');
  const [itemNameDraft, setItemNameDraft] = useState('stone');
  const [itemMetaDraft, setItemMetaDraft] = useState('0');
  const [nbtRootDraft, setNbtRootDraft] = useState<NbtCompoundNode>({ kind: 'compound', entries: [] });
  const [collapsedNbtPaths, setCollapsedNbtPaths] = useState<Record<string, boolean>>({});
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState('РќРµ СЃРѕС…СЂР°РЅРµРЅРѕ');
  const [lastApiStatus, setLastApiStatus] = useState('idle');
  const [lastParseResult, setLastParseResult] = useState('Р•С‰С‘ РЅРµ РІС‹РїРѕР»РЅСЏР»СЃСЏ');
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [uiPreferences, setUiPreferences] = useState<UiPreferences>(defaultUiPreferences);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('editor');
  const [itemPanelTranslations, setItemPanelTranslations] = useState<ItemPanelTranslations>({
    byKey: new Map(),
    byKeyMeta: new Map(),
    byDisplayRu: new Map(),
    byDisplayEn: new Map(),
    entries: [],
    fallbackToFirstMeta: getItemPanelFallbackToFirstMetaEnabled()
  });
  const [isTextureModsOpen, setIsTextureModsOpen] = useState(false);
  const [selectedTextureMods, setSelectedTextureMods] = useState<Record<string, boolean>>({});
  const [textureLoadState, setTextureLoadState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [textureLoadStatus, setTextureLoadStatus] = useState('');
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [neiSearchQuery, setNeiSearchQuery] = useState('');
  const [neiPage, setNeiPage] = useState(0);
  const [itemPanelAtlas, setItemPanelAtlas] = useState<ItemPanelAtlas | null | undefined>(undefined);
  const [heldItemRaw, setHeldItemRaw] = useState<string | null>(null);
  const [hoveredNeiRaw, setHoveredNeiRaw] = useState<string | null>(null);
  const [adminUsers, setAdminUsers] = useState<AuthUser[]>([]);
  const [adminUsersStatus, setAdminUsersStatus] = useState('');
  const [cursorPoint, setCursorPoint] = useState({ x: 0, y: 0 });
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
  const [modalScales, setModalScales] = useState<Record<ModalScaleKey, number>>({ help: 1, layout: 1, craft: 1, nbtTree: 1.1 });
  const [activeScaleControl, setActiveScaleControl] = useState<ModalScaleKey | null>(null);

  const persistTimerRef = useRef<number | null>(null);
  const autoParseTimerRef = useRef<number | null>(null);
  const settingsRetryTimerRef = useRef<number | null>(null);
  const latestUiPreferencesRef = useRef<UiPreferences>(defaultUiPreferences);
  const hasLocalUiChangesRef = useRef(false);
  const lastRequestedParseRef = useRef('');
  const texturePauseRef = useRef(false);
  const textureCancelRef = useRef(false);
  const iconRequestRef = useRef<Set<string>>(new Set());
  const neiListRef = useRef<HTMLDivElement | null>(null);

  const t = createTranslator(uiPreferences.language);
  const areAnimationsEnabled = uiPreferences.animations_enabled;
  const workspaceTabLabels: Record<WorkspaceTab, string> = uiPreferences.language === 'ru'
    ? { editor: 'Создать рецепт', recipe: 'Рецепты', items: 'Предметы', debug: 'Отладка' }
    : { editor: 'Create Recipe', recipe: 'Recipes', items: 'Items', debug: 'Debug' };
  const canEditRecipes = can(authUser, 'recipes:edit');
  const canCreateTemplates = can(authUser, 'templates:create');
  const canManageSettings = can(authUser, 'settings:manage');
  const canManageRoles = can(authUser, 'roles:manage');

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

  useEffect(() => {
    document.documentElement.dataset.theme = uiPreferences.theme_mode;
  }, [uiPreferences.theme_mode]);

  useEffect(() => {
    if (canManageRoles) {
      void refreshAdminUsers();
    } else {
      setAdminUsers([]);
      setAdminUsersStatus('');
    }
  }, [canManageRoles]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      setCursorPoint({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

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
      if (event.key.toLowerCase() !== 'r' || event.repeat || !hoveredNeiRaw) {
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
        return;
      }
      event.preventDefault();
      void openRecipeForNeiItem(hoveredNeiRaw);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hoveredNeiRaw]);

  const summary = useMemo(() => `${matrix.length}x${matrix[0]?.length ?? 0}`, [matrix]);
  const outputDisplayNameFromResolver = recipe.output_resolution?.display_name;
  const filledCells = useMemo(() => matrix.flat().filter((cell) => cell && cell !== 'null').length, [matrix]);
  const nullCells = useMemo(() => matrix.flat().filter((cell) => !cell || cell === 'null').length, [matrix]);
  const unresolvedCells = useMemo(() => matrix.flat().filter((cell) => cell && !String(cell).startsWith('<')).length, [matrix]);
  const iconsResolved = recipe.output_resolution?.icon_url ? 1 : 0;
  const iconTotal = filledCells + (outputRaw ? 1 : 0);
  const inputStatusTone = !backendAvailable || lastApiStatus === t('values.error') || status.includes('РћС€РёР±РєР°') || status.includes('Backend unavailable') ? 'warning' : status === t('status.loaded') ? 'success' : 'default';
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
  }, [matrix, recipe.matrix, itemSearchIcons, itemPanelTranslations]);

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
        setStatus((current) => current === 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ UI-РЅР°СЃС‚СЂРѕР№РєРё, РёСЃРїРѕР»СЊР·СѓСЋС‚СЃСЏ Р·РЅР°С‡РµРЅРёСЏ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ.' ? 'РџРѕРґРєР»СЋС‡РµРЅРёРµ Рє backend РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРѕ, UI-РЅР°СЃС‚СЂРѕР№РєРё Р·Р°РіСЂСѓР¶РµРЅС‹.' : current);
        if (settingsRetryTimerRef.current !== null) {
          window.clearTimeout(settingsRetryTimerRef.current);
          settingsRetryTimerRef.current = null;
        }
      } catch {
        if (cancelled) {
          return;
        }
        setBackendAvailable(false);
        setStatus('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ UI-РЅР°СЃС‚СЂРѕР№РєРё, РёСЃРїРѕР»СЊР·СѓСЋС‚СЃСЏ Р·РЅР°С‡РµРЅРёСЏ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ.');
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
    if (autoParseTimerRef.current !== null) {
      window.clearTimeout(autoParseTimerRef.current);
    }
    if (settingsRetryTimerRef.current !== null) {
      window.clearTimeout(settingsRetryTimerRef.current);
    }
  }, []);

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

  function applyRecipe(nextRecipe: RecipeView, nextInput?: string) {
    setRecipe(nextRecipe);
    setOutputRaw(nextRecipe.output.raw);
    setMatrix(toCellMatrix(nextRecipe));
    setSaveStatus(nextRecipe.source.kind === 'generated' ? t('values.draft') : t('values.synchronized'));
    if (nextInput !== undefined) {
      setInput(nextInput);
    }
  }

  function clearEditor() {
    applyRecipe(defaultRecipe, '');
    setStatus(t('status.cleared'));
    setSaveStatus(t('values.reset'));
    setLastApiStatus(t('values.idle'));
    setLastParseResult(t('values.reset'));
  }

  function resolveCellTitle(raw: string): string {
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

  const itemSearchSuggestions = useMemo(() => {
    const query = itemSearchQuery.trim().toLowerCase();
    if (!query) {
      return [] as ItemPanelEntry[];
    }

    const unique = new Map<string, ItemPanelEntry>();
    const push = (entry: ItemPanelEntry) => {
      const uniqueKey = `${entry.key}:${entry.meta}`;
      if (!unique.has(uniqueKey)) unique.set(uniqueKey, entry);
    };

    if (/^\d+(:\d+)?$/.test(query)) {
      const [idPart, metaPart] = query.split(':');
      const legacyId = Number.parseInt(idPart, 10);
      const meta = metaPart !== undefined ? Number.parseInt(metaPart, 10) : null;
      itemPanelTranslations.entries.forEach((entry) => {
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

    itemPanelTranslations.entries.forEach((entry) => {
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
  }, [itemSearchQuery, itemPanelTranslations]);

  const filteredNeiItems = useMemo(() => {
    const query = neiSearchQuery.trim().toLowerCase();
    return query
      ? itemPanelTranslations.entries.filter((entry) => (
        entry.key.includes(query)
        || entry.displayRu.toLowerCase().includes(query)
        || entry.displayEn.toLowerCase().includes(query)
        || String(entry.legacyId ?? '').includes(query)
      ))
      : itemPanelTranslations.entries;
  }, [neiSearchQuery, itemPanelTranslations.entries]);

  const neiPageCount = Math.max(1, Math.ceil(filteredNeiItems.length / NEI_PAGE_SIZE));
  const neiItems = useMemo(() => {
    const safePage = clamp(neiPage, 0, neiPageCount - 1);
    const start = safePage * NEI_PAGE_SIZE;
    return filteredNeiItems.slice(start, start + NEI_PAGE_SIZE);
  }, [filteredNeiItems, neiPage, neiPageCount]);

  const visibleNeiRawItems = useMemo(() => neiItems.map((entry) => buildItemRawValue(entry.key, entry.meta)), [neiItems]);

  useEffect(() => {
    setNeiPage(0);
  }, [neiSearchQuery]);

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
      if (itemSearchIcons[raw] || iconRequestRef.current.has(raw)) {
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
  }, [itemSearchSuggestions, itemSearchIcons]);

  useEffect(() => {
    let cancelled = false;
    const missing = visibleNeiRawItems.filter((raw) => !itemPanelAtlas?.entries[raw] && !itemSearchIcons[raw] && !iconRequestRef.current.has(raw));
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
  }, [visibleNeiRawItems, itemSearchIcons, itemPanelAtlas]);

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
    setItemSearchQuery(`${entry.key}:${entry.meta}`);
  }

  function applyRawFromStructuredEditor() {
    const modid = itemModDraft.trim().toLowerCase();
    const item = itemNameDraft.trim().toLowerCase();
    if (!modid || !item) {
      return;
    }
    const parsedMeta = Number.parseInt(itemMetaDraft.trim() || '0', 10);
    const safeMeta = Number.isNaN(parsedMeta) ? 0 : Math.max(0, parsedMeta);
    const nbtRaw = buildNbtRawFromRoot(nbtRootDraft);
    setCraftSourceDraft(buildItemRawValue(`${modid}:${item}`, safeMeta, nbtRaw));
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
          <input aria-label={`nbt-value-${path}`} type="text" value={node.value} placeholder="Р·РЅР°С‡РµРЅРёРµ" onChange={(event) => onChange({ ...node, value: event.target.value })} />
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
            <button type="button" className="ghost-button icon-button" aria-label={`toggle-nbt-${path}`} onClick={() => setNbtPathCollapsed(path, !isCollapsed)}>{isCollapsed ? 'в–¶' : 'в–ј'}</button>
            <select aria-label={`nbt-type-${path}`} value={currentType} onChange={(event) => onChange(normalizeNodeTypeChange(event.target.value as NbtNodeType, node))}>
              {nbtNodeTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <button type="button" className="ghost-button icon-button" aria-label={`add-nbt-child-${path}`} title="Р”РѕР±Р°РІРёС‚СЊ РїРѕР»Рµ" onClick={() => onChange({ ...node, entries: [...node.entries, { key: '', value: defaultNodeForType('int') }] })}>+</button>
          </div>
          {!isCollapsed ? (
            <div className="nbt-children">
              {node.entries.map((entry, index) => (
                <div key={path + index} className="nbt-entry-line">
                  <input aria-label={`nbt-key-${path}-${index}`} type="text" value={entry.key} placeholder="РєР»СЋС‡" onChange={(event) => onChange({ ...node, entries: node.entries.map((nodeEntry, nodeIndex) => nodeIndex === index ? { ...nodeEntry, key: event.target.value } : nodeEntry) })} />
                  {renderNbtNodeEditor(entry.value, `${path}.${index}`, (nextValue) => onChange({
                    ...node,
                    entries: node.entries.map((nodeEntry, nodeIndex) => nodeIndex === index ? { ...nodeEntry, value: nextValue } : nodeEntry)
                  }))}
                  <button type="button" className="ghost-button icon-button" aria-label={`delete-nbt-child-${path}-${index}`} title="РЈРґР°Р»РёС‚СЊ" onClick={() => onChange({ ...node, entries: node.entries.filter((_, nodeIndex) => nodeIndex !== index) })}>рџ—‘пёЏ</button>
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
          <button type="button" className="ghost-button icon-button" aria-label={`toggle-nbt-${path}`} onClick={() => setNbtPathCollapsed(path, !isCollapsed)}>{isCollapsed ? 'в–¶' : 'в–ј'}</button>
          <select aria-label={`nbt-type-${path}`} value={currentType} onChange={(event) => onChange(normalizeNodeTypeChange(event.target.value as NbtNodeType, node))}>
            {nbtNodeTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <button type="button" className="ghost-button icon-button" aria-label={`add-nbt-item-${path}`} title="Р”РѕР±Р°РІРёС‚СЊ СЌР»РµРјРµРЅС‚" onClick={() => onChange({ ...node, items: [...node.items, defaultNodeForType('int')] })}>+</button>
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
                <button type="button" className="ghost-button icon-button" aria-label={`delete-nbt-item-${path}-${index}`} title="РЈРґР°Р»РёС‚СЊ" onClick={() => onChange({ ...node, items: node.items.filter((_, valueIndex) => valueIndex !== index) })}>рџ—‘пёЏ</button>
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
        <button type="button" className="ghost-button icon-button" aria-label={`modal-scale-${key}`} title="РњР°СЃС€С‚Р°Р± РѕРєРЅР°" onClick={() => setActiveScaleControl((current) => current === key ? null : key)}>вљ™пёЏ</button>
        {isOpen ? (
          <div className="modal-scale-popover">
            <button type="button" className="ghost-button icon-button" aria-label={`modal-scale-${key}-down`} onClick={() => patchModalScale(key, modalScales[key] - 0.1)}>в€’</button>
            <input aria-label={`modal-scale-${key}-range`} type="range" min="0.8" max="1.5" step="0.1" value={modalScales[key]} onChange={(event) => patchModalScale(key, Number(event.target.value))} />
            <button type="button" className="ghost-button icon-button" aria-label={`modal-scale-${key}-up`} onClick={() => patchModalScale(key, modalScales[key] + 0.1)}>+</button>
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
    const nextSize = Number(size) >= 9 ? 9 : 3;
    const nextMatrix = Array.from({ length: nextSize }, (_, rowIndex) => (
      Array.from({ length: nextSize }, (_, colIndex) => matrix[rowIndex]?.[colIndex] ?? null)
    ));
    setMatrix(nextMatrix);
    setRecipe((current) => ({
      ...current,
      recipe_type: nextSize >= 9 ? 'avaritia_extreme_shaped' : 'ct_shaped',
      grid_w: nextSize,
      grid_h: nextSize,
      matrix: nextMatrix.map((row) => row.map((raw) => ({ raw })))
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

  async function openRecipeForNeiItem(raw: string) {
    setStatus(`Ищу рецепт для ${raw}...`);
    setLastApiStatus(t('values.pending'));
    try {
      const result = await searchRecipesByOutput(raw);
      const match = result.matches[0];
      if (!match) {
        setStatus(`Рецепт для ${raw} не найден в Recipes.`);
        setLastApiStatus(t('values.ok'));
        return;
      }
      applyRecipe(match);
      setHeldItemRaw(null);
      setWorkspaceTab('editor');
      setStatus(`Открыт рецепт ${match.output.raw} из ${match.source.path ?? 'Recipes'}.`);
      setLastParseResult(match.recipe_type);
      setLastApiStatus(t('values.ok'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Не удалось открыть рецепт для ${raw}: ${message}`);
      setLastApiStatus(t('values.error'));
    }
  }

  function handleHeldItemOutsideMouseDown(event: MouseEvent<HTMLElement>) {
    if (!heldItemRaw || event.button !== 0) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }
    if (target.closest('.grid-cell, .nei-item, .craft-output-slot, .held-item-cursor')) {
      return;
    }
    setHeldItemRaw(null);
  }

  function changeNeiPage(direction: -1 | 1) {
    setNeiPage((current) => clamp(current + direction, 0, neiPageCount - 1));
  }

  function isParseableInput(value: string) {
    const trimmed = value.trim();
    return trimmed.includes('.addShaped') || (trimmed.startsWith('<') && trimmed.endsWith('>'));
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
      const message = error instanceof Error ? error.message : 'РќРµРёР·РІРµСЃС‚РЅР°СЏ РѕС€РёР±РєР°';
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
    setItemSearchQuery('');
    setIsCraftEditorOpen(true);
  }

  async function handleCraftModalPaste() {
    try {
      const pasted = await navigator.clipboard.readText();
      setCraftSourceDraft(pasted);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Clipboard unavailable';
      setStatus(message);
    }
  }

  async function handleCraftModalCopy() {
    const payload = craftSourceDraft || getCellRaw(craftEditorTarget);
    await navigator.clipboard.writeText(payload);
    setStatus('РЎРєРѕРїРёСЂРѕРІР°РЅРѕ Р·РЅР°С‡РµРЅРёРµ РїСЂРµРґРјРµС‚Р°.');
  }

  async function handleCellCopy(row: number, col: number) {
    const value = matrix[row]?.[col];
    const payload = value ?? '';
    await navigator.clipboard.writeText(payload);
    setStatus(`РЇС‡РµР№РєР° ${row + 1},${col + 1}: Р·РЅР°С‡РµРЅРёРµ СЃРєРѕРїРёСЂРѕРІР°РЅРѕ.`);
  }

  async function handleCellPaste(row: number, col: number) {
    try {
      const pasted = (await navigator.clipboard.readText()).trim();
      setMatrixCell(row, col, pasted || null);
      setStatus(`РЇС‡РµР№РєР° ${row + 1},${col + 1}: Р·РЅР°С‡РµРЅРёРµ РІСЃС‚Р°РІР»РµРЅРѕ.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Clipboard unavailable';
      setStatus(message);
    }
  }

  function handleCellClear(row: number, col: number) {
    setMatrixCell(row, col, null);
    setStatus(`РЇС‡РµР№РєР° ${row + 1},${col + 1}: Р·РЅР°С‡РµРЅРёРµ РѕС‡РёС‰РµРЅРѕ.`);
  }

  async function handleSave() {
    if (recipe.source.kind === 'generated' || recipe.recipe_uid === 'new-recipe') {
      setStatus('РЎРѕС…СЂР°РЅРµРЅРёРµ РЅРµРґРѕСЃС‚СѓРїРЅРѕ: РёСЃРїРѕР»СЊР·СѓР№С‚Рµ В«РЎРѕС…СЂР°РЅРёС‚СЊ РєР°РєВ».');
      return;
    }
    setStatus('РЎРѕС…СЂР°РЅСЏРµРј...');
    setSaveStatus(t('values.pending'));
    try {
      const updated = await updateRecipe({ recipeUid: recipe.recipe_uid, recipeType: recipe.recipe_type, outputRaw, matrix, name: recipe.name });
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
    const targetPath = window.prompt('РљСѓРґР° СЃРѕС…СЂР°РЅРёС‚СЊ СЂРµС†РµРїС‚? РЈРєР°Р¶РёС‚Рµ РїСѓС‚СЊ Рє .zs С„Р°Р№Р»Сѓ.', recipe.source.path ?? 'scripts/new_recipe.zs');
    if (!targetPath) {
      setStatus(t('status.saveAsCancelled'));
      return;
    }
    setStatus('РЎРѕС…СЂР°РЅСЏРµРј РєР°Рє...');
    setSaveStatus(t('values.pending'));
    try {
      if (recipe.recipe_uid === 'new-recipe') {
        const created = await createRecipeTemplate({ templateType: recipe.recipe_type, output: outputRaw, grid: matrix.length });
        const response = await saveRecipeAs({ recipeUid: created.recipe_uid, recipeType: created.recipe_type, outputRaw, matrix, name: created.name, targetPath });
        applyRecipe(response.recipe, input);
      } else {
        const response = await saveRecipeAs({ recipeUid: recipe.recipe_uid, recipeType: recipe.recipe_type, outputRaw, matrix, name: recipe.name, targetPath });
        applyRecipe(response.recipe, input);
      }
      setStatus(`${t('status.saved')} в†’ ${targetPath}`);
      setSaveStatus(t('values.saved'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`${t('status.saveError')}: ${message}`);
      setSaveStatus(t('values.error'));
    }
  }

  function resetLayout() {
    persistUiPreferences({ ...defaultUiPreferences, language: uiPreferences.language, display_mode: uiPreferences.display_mode, animations_enabled: uiPreferences.animations_enabled, density_mode: uiPreferences.density_mode, editor_mode: uiPreferences.editor_mode, theme_mode: uiPreferences.theme_mode, ui_scale: uiPreferences.ui_scale });
  }

  function setPanelVisible(panelId: PanelId, visible: boolean) {
    patchPanelLayout(latestUiPreferencesRef.current.panel_layout.map((panel) => panel.id === panelId ? { ...panel, visible } : panel));
  }

  const statusItems = [
    { label: t('status.status'), value: status, tone: status.includes('РћС€РёР±РєР°') || status.includes('error') ? 'warning' as const : 'success' as const },
    { label: t('status.type'), value: recipe.recipe_type },
    { label: t('status.size'), value: summary },
    { label: t('status.saveState'), value: saveStatus },
    { label: t('status.icons'), value: `${iconsResolved}/${iconTotal}` },
    { label: t('status.mode'), value: `${uiPreferences.display_mode} вЂў ${uiPreferences.language}` }
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
    const atlasEntry = resolveAtlasEntryFromRaw(itemPanelAtlas, raw);
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
    const atlasEntry = resolveAtlasEntryFromRaw(itemPanelAtlas, raw);
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
    return (
      <div className="workspace-panel-shell panel-recipe-builder">
        <Panel title="Создатель рецепта" subtitle="Сетка, входные предметы и результат" className="recipe-builder-panel">
          <div className="recipe-builder-controls">
            <label className="field-block">
              <span>Размер сетки</span>
              <select aria-label="recipe-grid-size" value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))}>
                {[3, 9].map((size) => <option key={size} value={size}>{size}x{size}</option>)}
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
                resolveCellTitle={resolveCellTitle}
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
                disabled={!canCreateTemplates && !canEditRecipes}
                onClick={handleCraftOutputClick}
                onContextMenu={(event) => {
                  event.preventDefault();
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
            </div>
          </div>
        </Panel>
      </div>
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
              const raw = buildItemRawValue(entry.key, entry.meta);
              const iconUrl = itemSearchIcons[raw];
              const atlasEntry = itemPanelAtlas?.entries[raw];
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
                  className={`nei-item ${heldItemRaw === raw ? 'is-held' : ''}`.trim()}
                  title={`${entry.displayRu || entry.displayEn || entry.key} ${raw}`}
                  aria-label={`nei-item-${raw}`}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', raw);
                    event.dataTransfer.effectAllowed = 'copy';
                    setHeldItemRaw(raw);
                  }}
                  onDragEnd={() => {
                    setHeldItemRaw((current) => (current === raw ? null : current));
                  }}
                  onMouseEnter={() => setHoveredNeiRaw(raw)}
                  onFocus={() => setHoveredNeiRaw(raw)}
                  onMouseLeave={() => setHoveredNeiRaw((current) => (current === raw ? null : current))}
                  onBlur={() => setHoveredNeiRaw((current) => (current === raw ? null : current))}
                  onClick={() => handleNeiItemPick(raw)}
                  onDoubleClick={() => handleRecipeItemDrop({ kind: 'output' }, raw)}
                >
                  <span className={`nei-icon ${atlasEntry || iconUrl ? 'has-icon' : 'is-loading'}`}>
                    {atlasStyle ? <span className="nei-atlas-icon" style={atlasStyle} /> : null}
                    {!atlasStyle && iconUrl ? (
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
                </button>
              );
            })}
          </div>
        </Panel>
      </div>
    );
  }

  function renderTextureToolsPanel() {
    return (
      <div className="workspace-panel-shell panel-textures">
        <Panel title={t('textures.modsDropdown')} subtitle={uiPreferences.language === 'ru' ? 'РљСЌС€ РёРєРѕРЅРѕРє РёР· itempanel.csv' : 'Icon cache from itempanel.csv'} className="texture-panel">
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
            <strong>{uiPreferences.language === 'ru' ? 'РњРѕРґС‹' : 'Mods'}</strong>
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
              <div><span>{uiPreferences.language === 'ru' ? 'РњРѕРґРѕРІ' : 'Mods'}</span><strong>{itemPanelModSummaries.length}</strong></div>
              <div><span>{t('status.icons')}</span><strong>{iconsResolved}/{iconTotal}</strong></div>
              <div><span>{t('textures.progress')}</span><strong>{itemPanelModSummaries.find((summary) => selectedTextureMods[summary.modid] ?? true)?.completionText ?? '0%'}</strong></div>
            </div>
          ) : null}
        </Panel>
      </div>
    );
  }

  function renderAdminUsersPanel() {
    if (!canManageRoles) return null;
    return (
      <div className="workspace-panel-shell panel-admin-users">
        <Panel title="Users" subtitle="Roles and access">
          <div className="admin-users-toolbar">
            <button type="button" className="secondary-button" onClick={() => void refreshAdminUsers()}>Refresh</button>
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
        </Panel>
      </div>
    );
  }

  function renderWorkspace() {
    if (workspaceTab === 'items') {
      return (
        <div className="workspace-layout workspace-layout-items">
          {renderColumn([getPanelForTab('input')], 'workspace-left')}
          <div className="workspace-column workspace-center">{renderTextureToolsPanel()}</div>
          {renderColumn([getPanelForTab('settings'), getPanelForTab('debug')], 'workspace-right')}
        </div>
      );
    }
    if (workspaceTab === 'recipe') {
      return (
        <div className="workspace-layout workspace-layout-recipe">
          {renderColumn([getPanelForTab('input'), getPanelForTab('output')], 'workspace-left')}
          {renderColumn([getPanelForTab('preview'), getPanelForTab('raw')], 'workspace-center')}
          <div className="workspace-column workspace-right">
            {renderNeiPanel()}
            {renderPanel(getPanelForTab('info'))}
            {renderPanel(getPanelForTab('statusBar'))}
          </div>
        </div>
      );
    }
    if (workspaceTab === 'debug') {
      return (
        <div className="workspace-layout workspace-layout-debug">
          {renderColumn([getPanelForTab('settings'), getPanelForTab('statusBar')], 'workspace-left')}
          {renderColumn([getPanelForTab('diagnostics'), getPanelForTab('debug')], 'workspace-center')}
          <div className="workspace-column workspace-right">
            {renderAdminUsersPanel()}
            {renderColumn([getPanelForTab('raw'), getPanelForTab('info')], '')}
          </div>
        </div>
      );
    }
    return (
      <div className="workspace-layout workspace-layout-editor workspace-layout-builder">
        <div className="workspace-column workspace-center">
          {renderRecipeBuilderPanel()}
          {renderPanel(getPanelForTab('toolbar'))}
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
        return (
          <div key={panelId} className={`workspace-panel-shell panel-${panelId}`}>
            <Panel title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('fields.workspace')} {...common}>
              <ActionToolbar
                labels={{ save: t('toolbar.save'), saveAs: t('toolbar.saveAs') }}
                canSave={canEditRecipes}
                onSave={() => void handleSave()}
                onSaveAs={() => void handleSaveAs()}
              />
            </Panel>
          </div>
        );
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
                <button type="button" className="output-icon-slot output-icon-button" onClick={() => openCraftEditorModal({ kind: 'output' })} title={t('panel.output')}>
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
                    <div><span>{t('fields.rawId')}</span><strong>{outputRaw || 'вЂ”'}</strong></div>
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
                <RecipeGrid matrix={matrixWithResolution} atlas={itemPanelAtlas} atlasImageUrl={itemPanelAtlas ? normalizeAtlasImageUrl(itemPanelAtlas.image_url) : ''} displayMode={uiPreferences.display_mode} animationsEnabled={areAnimationsEnabled} editorMode={uiPreferences.editor_mode} heldItemRaw={heldItemRaw} resolveCellTitle={resolveCellTitle} onCellClick={handleCraftCellClick} onCellContextMenu={handleCraftCellContextMenu} onCellDrop={(row, col, value) => handleRecipeItemDrop({ kind: 'cell', row, col }, value)} onCellChange={(row, col, value) => {
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
              <div className="settings-grid">
                <label className="field-block"><span>{t('fields.strictBinding')}</span><input type="checkbox" checked={strictBinding} onChange={() => setStrictBinding((value) => !value)} /></label>
                <label className="field-block"><span>{t('fields.metaMode')}</span><select aria-label="meta-mode" value={metaMode} onChange={(event) => setMetaMode(event.target.value)}><option value="strict">{t('parseModes.strict')}</option><option value="wildcard">{t('parseModes.wildcard')}</option><option value="ignore">{t('parseModes.ignore')}</option></select></label>
                <label className="field-block"><span>{t('fields.displayMode')}</span><select value={uiPreferences.display_mode} onChange={(event) => patchUiPreferences({ display_mode: event.target.value as DisplayMode })}><option value="text">text</option><option value="icons">icons</option></select></label>
                <label className="field-block"><span>{t('fields.animations')}</span><input type="checkbox" checked={uiPreferences.animations_enabled} onChange={(event) => patchUiPreferences({ animations_enabled: event.target.checked })} /></label>
                <label className="field-block"><span>{t('fields.density')}</span><select value={uiPreferences.density_mode} onChange={(event) => patchUiPreferences({ density_mode: event.target.value as DensityMode })}><option value="compact">compact</option><option value="normal">normal</option><option value="wide">wide</option></select></label>
                <label className="field-block"><span>{t('fields.editorMode')}</span><select value={uiPreferences.editor_mode} onChange={(event) => patchUiPreferences({ editor_mode: event.target.value as EditorMode })}><option value="view">view</option><option value="edit">edit</option></select></label>
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
              return <div className="kv-grid"><div><span>{t('status.type')}</span><strong>{recipe.recipe_type}</strong></div><div><span>{t('fields.sourceFile')}</span><strong>{recipe.source.path ?? 'вЂ”'}</strong></div><div><span>{t('app.uid')}</span><strong>{recipe.recipe_uid}</strong></div><div><span>{t('fields.originPath')}</span><strong>{recipe.source.path ?? settings?.project_config_path ?? 'вЂ”'}</strong></div></div>;
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
          {(Object.keys(workspaceTabLabels) as WorkspaceTab[]).map((tab) => (
            <button key={tab} type="button" className={`main-tab-button ${workspaceTab === tab ? 'active' : ''}`} onClick={() => setWorkspaceTab(tab)}>
              {workspaceTabLabels[tab]}
            </button>
          ))}
        </nav>
        <div className="utility-actions">
          <div className="user-chip" title={authUser.email}>
            {authUser.avatar_url ? <img src={authUser.avatar_url} alt="" /> : null}
            <span>{authUser.email}</span>
            <strong>{authUser.role}</strong>
          </div>
          <label className="ui-scale-switch compact-switch"><span>Масштаб</span><select aria-label="ui-scale" disabled={!canManageSettings} value={uiPreferences.ui_scale} onChange={(event) => patchUiPreferences({ ui_scale: Number(event.target.value) as UiScale })}><option value={1}>100%</option><option value={1.15}>115%</option><option value={1.3}>130%</option><option value={1.5}>150%</option></select></label>
          <label className="language-switch compact-switch"><span>{t('app.language')}</span><select aria-label={t('app.language')} disabled={!canManageSettings} value={uiPreferences.language} onChange={(event) => patchUiPreferences({ language: event.target.value as UiLanguage })}><option value="ru">Русский</option><option value="en">English</option></select></label>
          <button type="button" className="theme-toggle" disabled={!canManageSettings} aria-label={uiPreferences.theme_mode === 'dark' ? 'Светлая тема' : 'Темная тема'} onClick={() => patchUiPreferences({ theme_mode: uiPreferences.theme_mode === 'dark' ? 'light' : 'dark' })}>
            <span aria-hidden="true">{uiPreferences.theme_mode === 'dark' ? '☀' : '☾'}</span>
          </button>
          <button type="button" className="secondary-button" disabled={!canManageSettings} onClick={() => setIsLayoutSettingsOpen(true)}>{t('app.settings')}</button>
          <div className="view-menu-wrap">
            <button type="button" className="secondary-button" onClick={() => setIsViewMenuOpen((value) => !value)}>{t('app.view')}</button>
            {isViewMenuOpen ? (
              <div className="view-menu">
                <strong>{t('fields.visiblePanels')}</strong>
                {allPanelIds.map((panelId) => {
                  const panel = uiPreferences.panel_layout.find((item) => item.id === panelId);
                  return (
                    <label key={panelId} className="view-toggle" aria-label={getPanelLabel(uiPreferences.language, panelId)}>
                      <input type="checkbox" checked={panel?.visible ?? false} onChange={(event) => setPanelVisible(panelId, event.target.checked)} />
                      <span>{getPanelLabel(uiPreferences.language, panelId)}</span>
                    </label>
                  );
                })}
                <div className="view-menu-controls">
                  <label className="view-toggle"><input type="checkbox" checked={uiPreferences.workspace_layout.compact_header} onChange={(event) => patchUiPreferences({ workspace_layout: { ...uiPreferences.workspace_layout, compact_header: event.target.checked } })} /><span>{t('app.compactHeader')}</span></label>
                  <label className="field-block"><span>{t('app.columns')}</span><select aria-label={t('app.columns')} value={uiPreferences.workspace_layout.columns} onChange={(event) => patchUiPreferences({ workspace_layout: { ...uiPreferences.workspace_layout, columns: Number(event.target.value) as 1 | 2 | 3 } })}><option value="1">{t('app.oneColumn')}</option><option value="2">{t('app.twoColumns')}</option><option value="3">{t('app.threeColumns')}</option></select></label>
                </div>
                <div className="view-menu-actions">
                  <button type="button" onClick={() => patchPanelLayout(latestUiPreferencesRef.current.panel_layout.map((panel) => ({ ...panel, visible: true })))}> {t('app.showAllPanels')}</button>
                  <button type="button" className="ghost-button" onClick={resetLayout}>{t('app.resetLayout')}</button>
                </div>
              </div>
            ) : null}
          </div>
          <button type="button" className="ghost-button" onClick={() => void onLogout()}>Logout</button>
        </div>
      </div>

      {renderWorkspace()}

      {heldItemRaw ? (
        <div
          className="held-item-cursor"
          style={{ left: cursorPoint.x + 14, top: cursorPoint.y + 14 }}
          aria-hidden="true"
        >
          {renderHeldItemIcon(heldItemRaw)}
        </div>
      ) : null}

      {isLayoutSettingsOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsLayoutSettingsOpen(false)}>
          <div className="modal modal-scalable" style={getModalScaleStyle('layout')} role="dialog" aria-modal="true" aria-label={t('layoutSettings.title')} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('layoutSettings.title')}</h2>
              <div className="inline-actions">
                {renderModalScaleControl('layout')}
                <button type="button" onClick={() => setIsLayoutSettingsOpen(false)}>{t('layoutSettings.close')}</button>
              </div>
            </div>
            <div className="settings-modal-body">
              <p>{t('layoutSettings.description')}</p>
              <div className="kv-grid">
                <div><span>{t('app.columns')}</span><strong>{uiPreferences.workspace_layout.columns}</strong></div>
                <div><span>{t('app.zone')}</span><strong>{uiPreferences.panel_layout.filter((panel) => panel.visible).length}</strong></div>
                <div><span>{t('app.file')}</span><strong>{settings?.project_config_path ?? 'вЂ”'}</strong></div>
              </div>
              <div className="view-menu-actions">
                <button type="button" onClick={() => void saveCurrentWindowLayout()}>{t('layoutSettings.saveCurrent')}</button>
                <button type="button" className="ghost-button" onClick={() => setIsLayoutSettingsOpen(false)}>{t('layoutSettings.close')}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isCraftEditorOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => { setIsCraftEditorOpen(false); setIsNbtEditorOpen(false); }}>
          <div className="modal modal-scalable" style={getModalScaleStyle('craft')} role="dialog" aria-modal="true" aria-label="Craft editor" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{craftEditorTarget.kind === 'output' ? 'Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ output' : `Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ СЏС‡РµР№РєРё ${craftEditorTarget.row + 1},${craftEditorTarget.col + 1}`}</h2>
              <div className="inline-actions">
                {renderModalScaleControl('craft')}
                <button type="button" onClick={() => { setIsCraftEditorOpen(false); setIsNbtEditorOpen(false); }}>Р—Р°РєСЂС‹С‚СЊ</button>
              </div>
            </div>
            <div className="settings-modal-body">
              <label className="field-block">
                <span>РџРѕРёСЃРє РїСЂРµРґРјРµС‚Р° (ID, ID:meta, mod:item, mod:item:meta, RU/EN)</span>
                <div className="inline-actions">
                  <input aria-label="item-search" type="text" value={itemSearchQuery} onChange={(event) => setItemSearchQuery(event.target.value)} placeholder="РЅР°РїСЂРёРјРµСЂ: draconicrevolt:der_awakeneddemonicblock РёР»Рё 482:1" />
                  <button type="button" className="ghost-button icon-button" aria-label="clear-item-search" title="РћС‡РёСЃС‚РёС‚СЊ РїРѕРёСЃРє" onClick={() => setItemSearchQuery('')}>рџ§№</button>
                </div>
                {itemSearchSuggestions.length ? (
                  <div className="suggestions-list" role="listbox" aria-label="item-search-suggestions">
                    {itemSearchSuggestions.map((entry) => (
                      <button key={itemPanelEntryIdentity(entry)} type="button" className="suggestion-item suggestion-item-with-icon" onClick={() => applyItemSearchSuggestion(entry)}>
                        {(() => {
                          const raw = `<${entry.key}${entry.meta > 0 ? `:${entry.meta}` : ''}>`;
                          const iconUrl = itemSearchIcons[raw];
                          return (
                            <span className="suggestion-icon-slot" aria-hidden="true">
                              {iconUrl ? <img src={iconUrl} alt="" loading="lazy" /> : 'в–Ў'}
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
                <span>Raw РїСЂРµРґРјРµС‚Р° (С„РѕСЂРјР°С‚ parser: {'<modid:item[:meta]>'})</span>
                <textarea aria-label="craft-source-modal" value={craftSourceDraft} onChange={(event) => setCraftSourceDraft(event.target.value)} rows={8} />
              </label>
              <div className="field-block">
                <span>РЎС‚СЂСѓРєС‚СѓСЂРЅС‹Р№ СЂРµРґР°РєС‚РѕСЂ item</span>
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
                  <button type="button" className="ghost-button icon-button" aria-label="open-nbt-editor" title="РћС‚РєСЂС‹С‚СЊ РѕС‚РґРµР»СЊРЅРѕРµ РѕРєРЅРѕ NBT" onClick={() => setIsNbtEditorOpen(true)}>рџ§¬</button>
                  <span>{nbtRootDraft.entries.length ? `NBT РїРѕР»РµР№: ${nbtRootDraft.entries.length}` : 'NBT РЅРµ Р·Р°РґР°РЅ'}</span>
                  <button type="button" className="secondary-button" aria-label="build-raw-main" onClick={applyRawFromStructuredEditor}>РЎРѕР±СЂР°С‚СЊ raw РёР· РїРѕР»РµР№</button>
                </div>
              </div>
              <div className="inline-actions">
                <button type="button" className="ghost-button icon-button" aria-label="clear-craft-source" title="РћС‡РёСЃС‚РёС‚СЊ" onClick={() => setCraftSourceDraft('')}>рџ§№</button>
                <button type="button" className="secondary-button icon-button" aria-label="copy-craft-source" title="РЎРєРѕРїРёСЂРѕРІР°С‚СЊ" onClick={() => void handleCraftModalCopy()}>рџ“‹</button>
                <button type="button" className="secondary-button icon-button" aria-label="paste-craft-source" title="Р’СЃС‚Р°РІРёС‚СЊ" onClick={() => void handleCraftModalPaste()}>рџ“Ґ</button>
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = craftSourceDraft.trim();
                    if (trimmed.includes('.addShaped')) {
                      void handleParse(craftSourceDraft);
                      return;
                    }
                    setCellRaw(craftEditorTarget, trimmed);
                    setIsCraftEditorOpen(false);
                    setIsNbtEditorOpen(false);
                  }}
                >
                  РџСЂРёРјРµРЅРёС‚СЊ
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
              <h2>NBT Tree</h2>
              <div className="inline-actions">
                {renderModalScaleControl('nbtTree')}
                <button type="button" onClick={() => setIsNbtEditorOpen(false)}>Р—Р°РєСЂС‹С‚СЊ</button>
              </div>
            </div>
            <div className="settings-modal-body">
              <div className="inline-actions">
                <button type="button" className="ghost-button icon-button" aria-label="add-nbt-field" title="Р”РѕР±Р°РІРёС‚СЊ NBT РїРѕР»Рµ" onClick={() => addRootEntry('int')}>+</button>
                <button type="button" className="ghost-button icon-button" aria-label="add-nbt-object" title="Р”РѕР±Р°РІРёС‚СЊ NBT РѕР±СЉРµРєС‚" onClick={() => addRootEntry('compound')}>в—«</button>
                <button type="button" className="ghost-button icon-button" aria-label="add-nbt-list" title="Р”РѕР±Р°РІРёС‚СЊ NBT СЃРїРёСЃРѕРє" onClick={() => addRootEntry('list')}>в°</button>
                <button type="button" className="secondary-button" aria-label="build-raw-nbt" onClick={applyRawFromStructuredEditor}>РЎРѕР±СЂР°С‚СЊ raw РёР· РїРѕР»РµР№</button>
              </div>
              {nbtRootDraft.entries.length ? (
                <div className="suggestions-list nbt-editor-list" aria-label="nbt-editor-list">
                  {nbtRootDraft.entries.map((entry, index) => (
                    <div key={`root-entry-${index}`} className="suggestion-item">
                      <div className="nbt-entry-line">
                        <input aria-label={`nbt-key-${index}`} type="text" value={entry.key} placeholder="РєР»СЋС‡" onChange={(event) => updateRootEntry(index, (current) => ({ ...current, key: event.target.value }))} />
                        {renderNbtNodeEditor(entry.value, `root.${index}`, (nextNode) => updateRootEntry(index, (current) => ({ ...current, value: nextNode })))}
                        <button type="button" className="ghost-button icon-button" aria-label={`delete-nbt-root-${index}`} title="РЈРґР°Р»РёС‚СЊ" onClick={() => setNbtRootDraft((current) => ({ ...current, entries: current.entries.filter((_, entryIndex) => entryIndex !== index) }))}>рџ—‘пёЏ</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="inline-hint inline-hint-warning">Р”РѕР±Р°РІСЊС‚Рµ NBT РїРѕР»Рµ/РѕР±СЉРµРєС‚/СЃРїРёСЃРѕРє.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
