import { Fragment, type CSSProperties, type DragEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ActionToolbar } from '../components/ActionToolbar';
import { Panel } from '../components/Panel';
import { RecipeGrid } from '../components/RecipeGrid';
import { StatusBar } from '../components/StatusBar';
import { TabNav } from '../components/TabNav';
import { AnimatedIcon } from '../components/AnimatedIcon';
import { apiPath, getBackendTargetHint, getItemPanelFallbackToFirstMetaEnabled } from '../config/runtime';
import { createTranslator, getHelpItems, getPanelLabel, getTabLabel } from '../i18n';
import { createRecipeTemplate, getProjectSettings, parseText, saveRecipeAs, updateProjectUiPreferences, updateRecipe } from '../services/api';
import { logFrontendEvent } from '../services/debugLog';
import { AppTab, CellValue, DensityMode, DisplayMode, EditorMode, PanelId, PanelLayoutItem, PanelZone, ProjectSettings, RecipeView, UiLanguage, UiPreferences, WorkspaceLayout } from '../types';

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
const zoneOrder: PanelZone[] = ['topLeft', 'topRight', 'bottom', 'sidebar'];
const MIN_HEIGHT = 72;
const MAX_HEIGHT = 960;

type DropTarget = {
  zone: PanelZone;
  index: number;
} | null;

type ZoneResizeKind = 'topSplit' | 'mainSidebarSplit' | 'topBottomSplit';

const defaultUiPreferences: UiPreferences = {
  display_mode: 'text',
  animations_enabled: true,
  density_mode: 'normal',
  editor_mode: 'edit',
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

type ItemPanelTranslations = {
  byKey: Map<string, string>;
  byKeyMeta: Map<string, Map<number, ItemPanelEntry>>;
  byDisplayRu: Map<string, ItemPanelEntry[]>;
  byDisplayEn: Map<string, ItemPanelEntry[]>;
  entries: ItemPanelEntry[];
  fallbackToFirstMeta: boolean;
};

type CraftEditorTarget =
  | { kind: 'output' }
  | { kind: 'cell'; row: number; col: number };

type NbtScalarType = 'byte' | 'short' | 'int' | 'long' | 'float' | 'double' | 'string' | 'byte_array' | 'int_array' | 'long_array';
type NbtNodeType = NbtScalarType | 'list' | 'compound';
type NbtScalarNode = { kind: 'scalar'; value: string; scalarType: NbtScalarType };
type NbtListNode = { kind: 'list'; items: NbtNode[] };
type NbtCompoundNode = { kind: 'compound'; entries: { key: string; value: NbtNode }[] };
type NbtNode = NbtScalarNode | NbtListNode | NbtCompoundNode;

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

function widthToSpan(widthUnits: number, columns: 1 | 2 | 3): number {
  if (columns === 1) return 12;
  if (columns === 2) return widthUnits >= 2 ? 12 : 6;
  return widthUnits === 3 ? 12 : widthUnits === 2 ? 8 : 4;
}

function normalizePanelOrdersByZone(layout: PanelLayoutItem[]): PanelLayoutItem[] {
  const byZone = new Map<PanelZone, PanelLayoutItem[]>();

  zoneOrder.forEach((zone) => byZone.set(zone, []));

  layout.forEach((item) => {
    const zoneItems = byZone.get(item.zone) ?? [];
    zoneItems.push({ ...item });
    byZone.set(item.zone, zoneItems);
  });

  const result: PanelLayoutItem[] = [];

  zoneOrder.forEach((zone) => {
    const items = (byZone.get(zone) ?? [])
      .sort((a, b) => a.order - b.order)
      .map((item, index) => ({
        ...item,
        order: index
      }));
    result.push(...items);
  });

  return result;
}

function normalizePanelLayout(raw?: PanelLayoutItem[] | null): PanelLayoutItem[] {
  const existing = raw && raw.length ? raw.map((item) => ({ ...item })) : [];
  const seen = new Set(existing.map((item) => item.id));
  defaultPanelLayout.forEach((panel) => {
    if (!seen.has(panel.id)) {
      existing.push({ ...panel });
    }
  });
  return normalizePanelOrdersByZone(existing
    .map((item, index) => ({
      id: item.id,
      zone: item.zone ?? 'bottom',
      order: Number.isFinite(item.order) ? item.order : index,
      visible: item.visible !== false,
      height: typeof item.height === 'number' ? clamp(Math.round(item.height), MIN_HEIGHT, MAX_HEIGHT) : defaultPanelLayout.find((panel) => panel.id === item.id)?.height,
      width_units: typeof item.width_units === 'number' ? clamp(Math.round(item.width_units), 1, 3) : defaultPanelLayout.find((panel) => panel.id === item.id)?.width_units ?? 1
    })));
}

function movePanelToZone(layout: PanelLayoutItem[], draggedPanelId: PanelId, targetZone: PanelZone, targetIndex: number): PanelLayoutItem[] {
  const dragged = layout.find((item) => item.id === draggedPanelId);
  if (!dragged) return layout.map((item) => ({ ...item }));

  const withoutDragged = layout
    .filter((item) => item.id !== draggedPanelId)
    .map((item) => ({ ...item }));

  const targetZoneItems = withoutDragged
    .filter((item) => item.zone === targetZone)
    .sort((a, b) => a.order - b.order);

  const otherItems = withoutDragged.filter((item) => item.zone !== targetZone);

  const nextDragged: PanelLayoutItem = {
    ...dragged,
    zone: targetZone
  };

  const safeIndex = Math.max(0, Math.min(targetIndex, targetZoneItems.length));
  targetZoneItems.splice(safeIndex, 0, nextDragged);

  return normalizePanelOrdersByZone([...otherItems, ...targetZoneItems]);
}

function getPanelsForZone(layout: PanelLayoutItem[], zone: PanelZone): PanelLayoutItem[] {
  return normalizePanelLayout(layout)
    .filter((panel) => panel.visible && panel.zone === zone)
    .sort((a, b) => a.order - b.order);
}

function normalizeWorkspaceLayout(raw?: WorkspaceLayout | null): WorkspaceLayout {
  return {
    columns: clamp(Number(raw?.columns ?? 3), 1, 3) as 1 | 2 | 3,
    compact_header: Boolean(raw?.compact_header ?? true),
    top_split_ratio: clamp(Number(raw?.top_split_ratio ?? defaultWorkspaceLayout.top_split_ratio ?? 0.68), 0.25, 0.75),
    main_sidebar_ratio: clamp(Number(raw?.main_sidebar_ratio ?? defaultWorkspaceLayout.main_sidebar_ratio ?? 0.76), 0.55, 0.9),
    top_height: clamp(Number(raw?.top_height ?? defaultWorkspaceLayout.top_height ?? 560), 240, 1200),
    bottom_height: clamp(Number(raw?.bottom_height ?? defaultWorkspaceLayout.bottom_height ?? 260), 120, 1000)
  };
}

function normalizeUiPreferences(settings?: ProjectSettings | null): UiPreferences {
  const source = settings?.ui_preferences;
  return {
    display_mode: (source?.display_mode ?? 'text') as DisplayMode,
    animations_enabled: source?.animations_enabled !== false,
    density_mode: (source?.density_mode ?? 'normal') as DensityMode,
    editor_mode: (source?.editor_mode ?? 'edit') as EditorMode,
    language: (source?.language ?? 'ru') as UiLanguage,
    active_view_tab: (source?.active_view_tab ?? 'editor') as AppTab,
    reset_layout_version: source?.reset_layout_version ?? 4,
    panel_layout: normalizePanelLayout(source?.panel_layout),
    workspace_layout: normalizeWorkspaceLayout(source?.workspace_layout)
  };
}

export default function App() {
  const [input, setInput] = useState('');
  const [matrix, setMatrix] = useState<CellValue[][]>(cloneMatrix(defaultMatrix));
  const [status, setStatus] = useState('Готово');
  const [strictBinding, setStrictBinding] = useState(true);
  const [metaMode, setMetaMode] = useState('strict');
  const [recipe, setRecipe] = useState<RecipeView>(defaultRecipe);
  const [outputRaw, setOutputRaw] = useState(defaultRecipe.output.raw);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isLayoutSettingsOpen, setIsLayoutSettingsOpen] = useState(false);
  const [isCraftEditorOpen, setIsCraftEditorOpen] = useState(false);
  const [craftEditorTarget, setCraftEditorTarget] = useState<CraftEditorTarget>({ kind: 'output' });
  const [craftSourceDraft, setCraftSourceDraft] = useState('');
  const [itemModDraft, setItemModDraft] = useState('minecraft');
  const [itemNameDraft, setItemNameDraft] = useState('stone');
  const [itemMetaDraft, setItemMetaDraft] = useState('0');
  const [nbtRootDraft, setNbtRootDraft] = useState<NbtCompoundNode>({ kind: 'compound', entries: [] });
  const [collapsedNbtPaths, setCollapsedNbtPaths] = useState<Record<string, boolean>>({});
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Не сохранено');
  const [lastApiStatus, setLastApiStatus] = useState('idle');
  const [lastParseResult, setLastParseResult] = useState('Ещё не выполнялся');
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [uiPreferences, setUiPreferences] = useState<UiPreferences>(defaultUiPreferences);
  const [draggedPanelId, setDraggedPanelId] = useState<PanelId | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [activeZoneResizer, setActiveZoneResizer] = useState<ZoneResizeKind | null>(null);
  const [itemPanelTranslations, setItemPanelTranslations] = useState<ItemPanelTranslations>({
    byKey: new Map(),
    byKeyMeta: new Map(),
    byDisplayRu: new Map(),
    byDisplayEn: new Map(),
    entries: [],
    fallbackToFirstMeta: getItemPanelFallbackToFirstMetaEnabled()
  });
  const [itemSearchQuery, setItemSearchQuery] = useState('');

  const persistTimerRef = useRef<number | null>(null);
  const autoParseTimerRef = useRef<number | null>(null);
  const settingsRetryTimerRef = useRef<number | null>(null);
  const latestUiPreferencesRef = useRef<UiPreferences>(defaultUiPreferences);
  const hasLocalUiChangesRef = useRef(false);
  const lastRequestedParseRef = useRef('');

  const t = createTranslator(uiPreferences.language);
  const areAnimationsEnabled = uiPreferences.animations_enabled;
  const summary = useMemo(() => `${matrix.length}×${matrix[0]?.length ?? 0}`, [matrix]);
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
      const fallbackResolution = typeof cell === 'string' ? (resolutionByRaw.get(cell) ?? null) : null;
      return {
        raw: cell,
        resolution: directResolution ?? fallbackResolution
      };
    }));
  }, [matrix, recipe.matrix]);

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
        const byKey = new Map<string, string>();
        const byKeyMeta = new Map<string, Map<number, ItemPanelEntry>>();
        const byDisplayRu = new Map<string, ItemPanelEntry[]>();
        const byDisplayEn = new Map<string, ItemPanelEntry[]>();
        const entries: ItemPanelEntry[] = [];
        const pushDisplayIndex = (index: Map<string, ItemPanelEntry[]>, label: string, entry: ItemPanelEntry) => {
          const normalized = label.trim().toLowerCase();
          if (!normalized) return;
          const list = index.get(normalized) ?? [];
          list.push(entry);
          index.set(normalized, list);
        };
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
            displayEn: displayEn || primaryDisplay
          };
          entries.push(entry);
          pushDisplayIndex(byDisplayRu, entry.displayRu, entry);
          pushDisplayIndex(byDisplayEn, entry.displayEn, entry);
          let metaMap = byKeyMeta.get(key);
          if (!metaMap) {
            metaMap = new Map<number, ItemPanelEntry>();
            byKeyMeta.set(key, metaMap);
          }
          if (!metaMap.has(meta)) {
            metaMap.set(meta, entry);
          }
          if (!byKey.has(key) || meta === 0) {
            byKey.set(key, entry.displayRu);
          }
        });
        if (!cancelled) {
          setItemPanelTranslations({
            byKey,
            byKeyMeta,
            byDisplayRu,
            byDisplayEn,
            entries,
            fallbackToFirstMeta: getItemPanelFallbackToFirstMetaEnabled()
          });
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

  function patchWorkspaceLayout(patch: Partial<WorkspaceLayout>) {
    patchUiPreferences({
      workspace_layout: normalizeWorkspaceLayout({
        ...latestUiPreferencesRef.current.workspace_layout,
        ...patch
      })
    });
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
            <button type="button" className="ghost-button" onClick={() => setNbtPathCollapsed(path, !isCollapsed)}>{isCollapsed ? '▶' : '▼'}</button>
            <select aria-label={`nbt-type-${path}`} value={currentType} onChange={(event) => onChange(normalizeNodeTypeChange(event.target.value as NbtNodeType, node))}>
              {nbtNodeTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <button type="button" className="ghost-button" onClick={() => onChange({ ...node, entries: [...node.entries, { key: '', value: defaultNodeForType('int') }] })}>+ поле</button>
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
                  <button type="button" className="ghost-button" onClick={() => onChange({ ...node, entries: node.entries.filter((_, nodeIndex) => nodeIndex !== index) })}>Удалить</button>
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
          <button type="button" className="ghost-button" onClick={() => setNbtPathCollapsed(path, !isCollapsed)}>{isCollapsed ? '▶' : '▼'}</button>
          <select aria-label={`nbt-type-${path}`} value={currentType} onChange={(event) => onChange(normalizeNodeTypeChange(event.target.value as NbtNodeType, node))}>
            {nbtNodeTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <button type="button" className="ghost-button" onClick={() => onChange({ ...node, items: [...node.items, defaultNodeForType('int')] })}>+ элемент</button>
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
                <button type="button" className="ghost-button" onClick={() => onChange({ ...node, items: node.items.filter((_, valueIndex) => valueIndex !== index) })}>Удалить</button>
              </div>
            ))}
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
      setRecipe((current) => ({ ...current, output: { ...current.output, raw } }));
      setSaveStatus(t('values.unsavedChanges'));
      return;
    }
    setMatrix((current) => current.map((row, rowIndex) => row.map((cell, colIndex) => {
      if (rowIndex !== target.row || colIndex !== target.col) return cell;
      return raw === '' || raw === 'null' ? null : raw;
    })));
    setSaveStatus(t('values.unsavedChanges'));
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
      setMatrix((current) => current.map((line, r) => line.map((cell, c) => (r === row && c === col ? (pasted || null) : cell))));
      setSaveStatus(t('values.unsavedChanges'));
      setStatus(`Ячейка ${row + 1},${col + 1}: значение вставлено.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Clipboard unavailable';
      setStatus(message);
    }
  }

  function handleCellClear(row: number, col: number) {
    setMatrix((current) => current.map((line, r) => line.map((cell, c) => (r === row && c === col ? null : cell))));
    setSaveStatus(t('values.unsavedChanges'));
    setStatus(`Ячейка ${row + 1},${col + 1}: значение очищено.`);
  }

  async function handleSave() {
    if (recipe.source.kind === 'generated' || recipe.recipe_uid === 'new-recipe') {
      setStatus('Сохранение недоступно: используйте «Сохранить как».');
      return;
    }
    setStatus('Сохраняем...');
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
    const targetPath = window.prompt('Куда сохранить рецепт? Укажите путь к .zs файлу.', recipe.source.path ?? 'scripts/new_recipe.zs');
    if (!targetPath) {
      setStatus(t('status.saveAsCancelled'));
      return;
    }
    setStatus('Сохраняем как...');
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
      setStatus(`${t('status.saved')} → ${targetPath}`);
      setSaveStatus(t('values.saved'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`${t('status.saveError')}: ${message}`);
      setSaveStatus(t('values.error'));
    }
  }

  async function handleCreateNew() {
    setStatus(t('status.creating'));
    try {
      const created = await createRecipeTemplate({ templateType: recipe.recipe_type, output: outputRaw, grid: recipe.recipe_type === 'avaritia_extreme_shaped' ? 9 : 3 });
      applyRecipe(created, '');
      setStatus(t('status.created'));
      setLastParseResult(t('status.created'));
    } catch (error) {
      setStatus(`${t('status.saveError')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  function handleOpenWiki() {
    const wikiUrl = new URL('/wiki.html', window.location.origin).toString();
    const openedWindow = window.open(wikiUrl, '_blank', 'noopener,noreferrer');
    if (!openedWindow) {
      window.location.assign(wikiUrl);
    }
    setStatus(t('status.docsOpened'));
  }

  function resetLayout() {
    persistUiPreferences({ ...defaultUiPreferences, language: uiPreferences.language, display_mode: uiPreferences.display_mode, animations_enabled: uiPreferences.animations_enabled, density_mode: uiPreferences.density_mode, editor_mode: uiPreferences.editor_mode });
  }

  function setPanelVisible(panelId: PanelId, visible: boolean) {
    patchPanelLayout(latestUiPreferencesRef.current.panel_layout.map((panel) => panel.id === panelId ? { ...panel, visible } : panel));
  }

  function updatePanel(panelId: PanelId, patch: Partial<PanelLayoutItem>) {
    patchPanelLayout(latestUiPreferencesRef.current.panel_layout.map((panel) => panel.id === panelId ? { ...panel, ...patch } : panel));
  }

  function startResize(panelId: PanelId, startX: number, startY: number) {
    const panel = uiPreferences.panel_layout.find((item) => item.id === panelId);
    if (!panel) return;
    const startHeight = panel.height ?? 240;
    const startWidthUnits = panel.width_units ?? 1;
    const onMove = (event: globalThis.PointerEvent | MouseEvent) => {
      const currentX = Number.isFinite(event.clientX) ? event.clientX : startX;
      const currentY = Number.isFinite(event.clientY) ? event.clientY : startY;
      const deltaX = currentX - startX;
      const deltaY = currentY - startY;
      const nextWidthUnits = clamp(startWidthUnits + Math.round(deltaX / 180), 1, uiPreferences.workspace_layout.columns) as 1 | 2 | 3;
      updatePanel(panelId, { width_units: nextWidthUnits, height: clamp(startHeight + deltaY, MIN_HEIGHT, MAX_HEIGHT) });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('mouseup', onUp);
  }

  function startZoneResize(kind: ZoneResizeKind, startX: number, startY: number) {
    const startLayout = latestUiPreferencesRef.current.workspace_layout;
    const startTopHeight = startLayout.top_height ?? defaultWorkspaceLayout.top_height ?? 560;
    const startBottomHeight = startLayout.bottom_height ?? defaultWorkspaceLayout.bottom_height ?? 260;

    setActiveZoneResizer(kind);

    const onMove = (event: globalThis.PointerEvent | MouseEvent) => {
      const currentX = Number.isFinite(event.clientX) ? event.clientX : startX;
      const currentY = Number.isFinite(event.clientY) ? event.clientY : startY;

      if (kind === 'topSplit') {
        const container = document.querySelector('.workspace-top');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        if (!rect.width) return;
        const nextRatio = clamp((currentX - rect.left) / rect.width, 0.25, 0.75);
        patchWorkspaceLayout({ top_split_ratio: nextRatio });
        return;
      }

      if (kind === 'mainSidebarSplit') {
        const container = document.querySelector('.workspace-layout');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        if (!rect.width) return;
        const nextRatio = clamp((currentX - rect.left) / rect.width, 0.55, 0.9);
        patchWorkspaceLayout({ main_sidebar_ratio: nextRatio });
        return;
      }

      const deltaY = currentY - startY;
      patchWorkspaceLayout({
        top_height: clamp(startTopHeight + deltaY, 240, 1200),
        bottom_height: clamp(startBottomHeight - deltaY, 120, 1000)
      });
    };

    const onUp = () => {
      setActiveZoneResizer(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('mouseup', onUp);
  }

  const topLeftPanels = useMemo(() => getPanelsForZone(uiPreferences.panel_layout, 'topLeft'), [uiPreferences.panel_layout]);
  const topRightPanels = useMemo(() => getPanelsForZone(uiPreferences.panel_layout, 'topRight'), [uiPreferences.panel_layout]);
  const bottomPanels = useMemo(() => getPanelsForZone(uiPreferences.panel_layout, 'bottom'), [uiPreferences.panel_layout]);
  const sidebarPanels = useMemo(() => getPanelsForZone(uiPreferences.panel_layout, 'sidebar'), [uiPreferences.panel_layout]);
  const workspaceLayoutStyle = useMemo(() => {
    const mainSidebarRatio = uiPreferences.workspace_layout.main_sidebar_ratio ?? defaultWorkspaceLayout.main_sidebar_ratio ?? 0.76;

    return {
      gridTemplateColumns: `${mainSidebarRatio}fr 10px ${1 - mainSidebarRatio}fr`
    } satisfies CSSProperties;
  }, [uiPreferences.workspace_layout.main_sidebar_ratio]);
  const workspaceMainStyle = useMemo(() => ({
    gridTemplateRows: `minmax(${uiPreferences.workspace_layout.top_height ?? defaultWorkspaceLayout.top_height ?? 560}px, auto) 10px minmax(${uiPreferences.workspace_layout.bottom_height ?? defaultWorkspaceLayout.bottom_height ?? 260}px, auto)`
  } satisfies CSSProperties), [uiPreferences.workspace_layout.bottom_height, uiPreferences.workspace_layout.top_height]);
  const workspaceTopStyle = useMemo(() => ({
    gridTemplateColumns: `${uiPreferences.workspace_layout.top_split_ratio ?? defaultWorkspaceLayout.top_split_ratio ?? 0.68}fr 10px ${1 - (uiPreferences.workspace_layout.top_split_ratio ?? defaultWorkspaceLayout.top_split_ratio ?? 0.68)}fr`,
    minHeight: `${uiPreferences.workspace_layout.top_height ?? defaultWorkspaceLayout.top_height ?? 560}px`
  } satisfies CSSProperties), [uiPreferences.workspace_layout.top_height, uiPreferences.workspace_layout.top_split_ratio]);

  const statusItems = [
    { label: t('status.status'), value: status, tone: status.includes('Ошибка') || status.includes('error') ? 'warning' as const : 'success' as const },
    { label: t('status.type'), value: recipe.recipe_type },
    { label: t('status.size'), value: summary },
    { label: t('status.saveState'), value: saveStatus },
    { label: t('status.icons'), value: `${iconsResolved}/${iconTotal}` },
    { label: t('status.mode'), value: `${uiPreferences.display_mode} • ${uiPreferences.language}` }
  ];

  const tabLabels: Record<AppTab, string> = {
    editor: getTabLabel(uiPreferences.language, 'editor'),
    preview: getTabLabel(uiPreferences.language, 'preview'),
    diagnostics: getTabLabel(uiPreferences.language, 'diagnostics'),
    raw: getTabLabel(uiPreferences.language, 'raw')
  };

  function commitDrop(target: DropTarget) {
    if (!draggedPanelId || !target) {
      setDraggedPanelId(null);
      setDropTarget(null);
      return;
    }

    patchPanelLayout(movePanelToZone(uiPreferences.panel_layout, draggedPanelId, target.zone, target.index));
    setDraggedPanelId(null);
    setDropTarget(null);
  }

  function renderZoneDropSlot(zone: PanelZone, targetIndex: number) {
    const active = dropTarget?.zone === zone && dropTarget.index === targetIndex;

    return (
      <div
        key={`drop-${zone}-${targetIndex}`}
        className={`zone-drop-slot ${draggedPanelId ? 'is-visible' : ''} ${active ? 'is-active' : ''}`.trim()}
        data-zone={zone}
        data-index={targetIndex}
        onDragOver={(event) => {
          event.preventDefault();
          setDropTarget({ zone, index: targetIndex });
        }}
        onDrop={(event) => {
          event.preventDefault();
          commitDrop({ zone, index: targetIndex });
        }}
      />
    );
  }

  function renderZone(zone: PanelZone, panels: PanelLayoutItem[], className?: string) {
    const isZoneActive = dropTarget?.zone === zone;

    return (
      <div
        className={`workspace-zone ${className ?? ''} ${draggedPanelId ? 'is-dragging' : ''} ${isZoneActive ? 'is-drag-over' : ''}`.trim()}
        data-zone={zone}
        onDragOver={(event) => {
          event.preventDefault();
          if (!panels.length) {
            setDropTarget({ zone, index: 0 });
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          const target = dropTarget?.zone === zone ? dropTarget : { zone, index: panels.length };
          commitDrop(target);
        }}
      >
        {renderZoneDropSlot(zone, 0)}
        {panels.map((panel, index) => (
          <Fragment key={`${zone}-${panel.id}`}>
            {renderPanel(panel)}
            {renderZoneDropSlot(zone, index + 1)}
          </Fragment>
        ))}
        {!panels.length ? (
          <div className="workspace-zone-empty">Перетащите панель сюда</div>
        ) : null}
      </div>
    );
  }

  function renderPanel(panel: PanelLayoutItem) {
    const panelId = panel.id;
    const common = {
      actions: <button type="button" className="ghost-button" onClick={() => setPanelVisible(panelId, false)}>{t('app.hidePanel')}</button>,
      dragHandle: (
        <button
          type="button"
          className="panel-drag-handle"
          draggable
          aria-label={`${t('app.dragPanel')}: ${getPanelLabel(uiPreferences.language, panelId)}`}
          onDragStart={(event: DragEvent<HTMLButtonElement>) => {
            if (event.dataTransfer) {
              event.dataTransfer.effectAllowed = 'move';
            }
            setDraggedPanelId(panelId);
          }}
          onDragEnd={() => {
            setDraggedPanelId(null);
            setDropTarget(null);
          }}
        >
          ⋮⋮
        </button>
      ),
      footer: (
        <button
          type="button"
          className="panel-resize-handle"
          aria-label={`${t('app.resizePanel')}: ${getPanelLabel(uiPreferences.language, panelId)}`}
          onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
            event.preventDefault();
            startResize(panelId, event.clientX, event.clientY);
          }}
        >
          <span />
        </button>
      )
    };

    switch (panelId) {
      case 'hero':
        return (
          <div key={panelId} className="workspace-panel-shell" style={{ gridColumn: `span ${widthToSpan(panel.width_units ?? 3, uiPreferences.workspace_layout.columns)}`, minHeight: panel.height }}>
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
          <div key={panelId} className="workspace-panel-shell" style={{ gridColumn: `span ${widthToSpan(panel.width_units ?? 3, uiPreferences.workspace_layout.columns)}`, minHeight: panel.height }}>
            <Panel title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('status.logReady')} {...common}>
              <StatusBar items={statusItems} />
            </Panel>
          </div>
        );
      case 'toolbar':
        return (
          <div key={panelId} className="workspace-panel-shell" style={{ gridColumn: `span ${widthToSpan(panel.width_units ?? 3, uiPreferences.workspace_layout.columns)}`, minHeight: panel.height }}>
            <Panel title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('fields.workspace')} {...common}>
              <ActionToolbar
                labels={{ work: t('toolbar.work'), saveGroup: t('toolbar.saveGroup'), helpGroup: t('toolbar.helpGroup'), parse: t('toolbar.parse'), paste: t('toolbar.paste'), createNew: t('toolbar.new'), clear: t('toolbar.clear'), save: t('toolbar.save'), saveAs: t('toolbar.saveAs'), help: t('toolbar.help'), wiki: t('toolbar.wiki') }}
                onParse={() => void handleParse(input)}
                onPaste={handlePasteFromClipboard}
                onCreateNew={() => void handleCreateNew()}
                onClear={clearEditor}
                onSave={() => void handleSave()}
                onSaveAs={() => void handleSaveAs()}
                onHelp={() => setIsHelpOpen(true)}
                onWiki={handleOpenWiki}
              />
              <TabNav labels={tabLabels} value={uiPreferences.active_view_tab} onChange={(tab) => patchUiPreferences({ active_view_tab: tab })} />
            </Panel>
          </div>
        );
      case 'input':
        return (
          <div key={panelId} className="workspace-panel-shell" style={{ gridColumn: `span ${widthToSpan(panel.width_units ?? 2, uiPreferences.workspace_layout.columns)}`, minHeight: panel.height }}>
            <Panel title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('fields.sourceText')} {...common}>
              <div className="field-header">
                <span>{t('fields.sourceText')}</span>
                <div className="inline-actions">
                  <button type="button" className="secondary-button" onClick={() => void handlePasteFromClipboard()}>{t('toolbar.paste')}</button>
                  <button type="button" className="ghost-button" onClick={() => setInput('')}>{t('toolbar.clear')}</button>
                </div>
              </div>
              <textarea aria-label="paste-input" value={input} onChange={handleInputChange} onPaste={handleInputPaste} />
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
          <div key={panelId} className="workspace-panel-shell" style={{ gridColumn: `span ${widthToSpan(panel.width_units ?? 1, uiPreferences.workspace_layout.columns)}`, minHeight: panel.height }}>
            <Panel title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('panel.output')} {...common}>
              <div className="output-card">
                <button type="button" className="output-icon-slot output-icon-button" onClick={() => openCraftEditorModal({ kind: 'output' })} title={t('panel.output')}>
                  {uiPreferences.display_mode === 'icons' && recipe.output_resolution?.icon_url ? <AnimatedIcon iconUrl={recipe.output_resolution.icon_url} alt={outputDisplayName ?? outputRaw} animated={Boolean(recipe.output_resolution.animated)} frameTime={recipe.output_resolution.animation_meta?.frametime ?? 1} animationsEnabled={areAnimationsEnabled} /> : <span>?</span>}
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
                    <div><span>{t('fields.rawId')}</span><strong>{outputRaw || '—'}</strong></div>
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
          <div key={panelId} className="workspace-panel-shell" style={{ gridColumn: `span ${widthToSpan(panel.width_units ?? 3, uiPreferences.workspace_layout.columns)}`, minHeight: panel.height }}>
            <Panel title={getPanelLabel(uiPreferences.language, panelId)} subtitle={`${t('status.size')}: ${summary}`} {...common} className="grid-panel">
              <div className="grid-meta"><span>{t('status.size')}</span><strong>{summary}</strong><span>{t('fields.parsedCells')}</span><strong>{filledCells}</strong><span>{t('fields.nullCells')}</span><strong>{nullCells}</strong></div>
              <div className="grid-scroll-zone">
                <RecipeGrid matrix={matrixWithResolution} displayMode={uiPreferences.display_mode} animationsEnabled={areAnimationsEnabled} editorMode={uiPreferences.editor_mode} onCellCopy={(row, col) => void handleCellCopy(row, col)} onCellPaste={(row, col) => void handleCellPaste(row, col)} onCellClear={handleCellClear} resolveCellTitle={resolveCellTitle} onIconClick={(row, col) => openCraftEditorModal({ kind: 'cell', row, col })} onCellChange={(row, col, value) => {
                  setMatrix((current) => current.map((line, r) => line.map((cell, c) => (r === row && c === col ? (value === 'null' || value === '' ? null : value) : cell))));
                  setSaveStatus(t('values.unsavedChanges'));
                }} />
              </div>
            </Panel>
          </div>
        );
      case 'settings':
        return (
          <div key={panelId} className="workspace-panel-shell" style={{ gridColumn: `span ${widthToSpan(panel.width_units ?? 1, uiPreferences.workspace_layout.columns)}`, minHeight: panel.height }}>
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
              return <div className="kv-grid"><div><span>{t('status.type')}</span><strong>{recipe.recipe_type}</strong></div><div><span>{t('fields.sourceFile')}</span><strong>{recipe.source.path ?? '—'}</strong></div><div><span>{t('app.uid')}</span><strong>{recipe.recipe_uid}</strong></div><div><span>{t('fields.originPath')}</span><strong>{recipe.source.path ?? settings?.project_config_path ?? '—'}</strong></div></div>;
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
          <div key={panelId} className="workspace-panel-shell" style={{ gridColumn: `span ${widthToSpan(panel.width_units ?? 1, uiPreferences.workspace_layout.columns)}`, minHeight: panel.height }}>
            <Panel title={getPanelLabel(uiPreferences.language, panelId)} subtitle={panelId === 'diagnostics' ? getTabLabel(uiPreferences.language, 'diagnostics') : undefined} {...common}>{renderExtra()}</Panel>
          </div>
        );
      }
      default:
        return null;
    }
  }

  return (
    <main className={`app-shell density-${uiPreferences.density_mode} mode-${uiPreferences.editor_mode} columns-${uiPreferences.workspace_layout.columns} ${uiPreferences.workspace_layout.compact_header ? 'compact-header' : ''}`}>
      <div className="utility-bar">
        <strong>CubixRecipes</strong>
        <div className="utility-actions">
          <label className="language-switch compact-switch"><span>{t('app.language')}</span><select aria-label={t('app.language')} value={uiPreferences.language} onChange={(event) => patchUiPreferences({ language: event.target.value as UiLanguage })}><option value="ru">Русский</option><option value="en">English</option></select></label>
          <button type="button" className="secondary-button" onClick={() => setIsLayoutSettingsOpen(true)}>{t('app.settings')}</button>
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
        </div>
      </div>

      <div className="workspace-layout" style={workspaceLayoutStyle}>
        <div className="workspace-main" style={workspaceMainStyle}>
          <div className="workspace-top" style={workspaceTopStyle}>
            {renderZone('topLeft', topLeftPanels, 'zone-top-left')}
            <button
              type="button"
              className={`layout-resizer layout-resizer-top-split ${activeZoneResizer === 'topSplit' ? 'is-active' : ''}`.trim()}
              aria-label="Изменить ширину верхних зон"
              onPointerDown={(event) => {
                event.preventDefault();
                startZoneResize('topSplit', event.clientX, event.clientY);
              }}
            />
            {renderZone('topRight', topRightPanels, 'zone-top-right')}
          </div>
          <button
            type="button"
            className={`layout-resizer layout-resizer-top-bottom ${activeZoneResizer === 'topBottomSplit' ? 'is-active' : ''}`.trim()}
            aria-label="Изменить высоту верхней и нижней зоны"
            onPointerDown={(event) => {
              event.preventDefault();
              startZoneResize('topBottomSplit', event.clientX, event.clientY);
            }}
          />
          {renderZone('bottom', bottomPanels, 'zone-bottom')}
        </div>
        <button
          type="button"
          className={`layout-resizer layout-resizer-main-sidebar ${activeZoneResizer === 'mainSidebarSplit' ? 'is-active' : ''}`.trim()}
          aria-label="Изменить ширину основной области и sidebar"
          onPointerDown={(event) => {
            event.preventDefault();
            startZoneResize('mainSidebarSplit', event.clientX, event.clientY);
          }}
        />
        {renderZone('sidebar', sidebarPanels, 'zone-sidebar')}
      </div>

      {isHelpOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsHelpOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={t('help.title')} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('help.title')}</h2>
              <button type="button" onClick={() => setIsHelpOpen(false)}>{t('help.close')}</button>
            </div>
            <ul>
              {getHelpItems(uiPreferences.language).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
      ) : null}

      {isLayoutSettingsOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsLayoutSettingsOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={t('layoutSettings.title')} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('layoutSettings.title')}</h2>
              <button type="button" onClick={() => setIsLayoutSettingsOpen(false)}>{t('layoutSettings.close')}</button>
            </div>
            <div className="settings-modal-body">
              <p>{t('layoutSettings.description')}</p>
              <div className="kv-grid">
                <div><span>{t('app.columns')}</span><strong>{uiPreferences.workspace_layout.columns}</strong></div>
                <div><span>{t('app.zone')}</span><strong>{uiPreferences.panel_layout.filter((panel) => panel.visible).length}</strong></div>
                <div><span>{t('app.file')}</span><strong>{settings?.project_config_path ?? '—'}</strong></div>
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
        <div className="modal-backdrop" role="presentation" onClick={() => setIsCraftEditorOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Craft editor" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{craftEditorTarget.kind === 'output' ? 'Редактирование output' : `Редактирование ячейки ${craftEditorTarget.row + 1},${craftEditorTarget.col + 1}`}</h2>
              <button type="button" onClick={() => setIsCraftEditorOpen(false)}>Закрыть</button>
            </div>
            <div className="settings-modal-body">
              <label className="field-block">
                <span>Поиск предмета (ID, ID:meta, mod:item, mod:item:meta, RU/EN)</span>
                <div className="inline-actions">
                  <input aria-label="item-search" type="text" value={itemSearchQuery} onChange={(event) => setItemSearchQuery(event.target.value)} placeholder="например: draconicrevolt:der_awakeneddemonicblock или 482:1" />
                  <button type="button" className="ghost-button" onClick={() => setItemSearchQuery('')}>Очистить поиск</button>
                </div>
                {itemSearchSuggestions.length ? (
                  <div className="suggestions-list" role="listbox" aria-label="item-search-suggestions">
                    {itemSearchSuggestions.map((entry) => (
                      <button key={`${entry.key}:${entry.meta}`} type="button" className="suggestion-item" onClick={() => applyItemSearchSuggestion(entry)}>
                        <strong>{`<${entry.key}${entry.meta > 0 ? `:${entry.meta}` : ''}>`}</strong>
                        <span>{entry.displayRu}</span>
                        <span>{entry.displayEn}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </label>
              <label className="field-block">
                <span>Raw предмета (формат parser: {'<modid:item[:meta]>'})</span>
                <textarea aria-label="craft-source-modal" value={craftSourceDraft} onChange={(event) => setCraftSourceDraft(event.target.value)} rows={8} />
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
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => addRootEntry('int')}
                  >
                    + NBT поле
                  </button>
                  <button type="button" className="ghost-button" onClick={() => addRootEntry('compound')}>+ NBT объект</button>
                  <button type="button" className="ghost-button" onClick={() => addRootEntry('list')}>+ NBT список</button>
                  <button type="button" className="secondary-button" onClick={applyRawFromStructuredEditor}>Собрать raw из полей</button>
                </div>
                {nbtRootDraft.entries.length ? (
                  <div className="suggestions-list" aria-label="nbt-editor-list">
                    {nbtRootDraft.entries.map((entry, index) => (
                      <div key={`root-entry-${index}`} className="suggestion-item">
                        <div className="nbt-entry-line">
                          <input aria-label={`nbt-key-${index}`} type="text" value={entry.key} placeholder="ключ" onChange={(event) => updateRootEntry(index, (current) => ({ ...current, key: event.target.value }))} />
                          {renderNbtNodeEditor(entry.value, `root.${index}`, (nextNode) => updateRootEntry(index, (current) => ({ ...current, value: nextNode })))}
                          <button type="button" className="ghost-button" onClick={() => setNbtRootDraft((current) => ({ ...current, entries: current.entries.filter((_, entryIndex) => entryIndex !== index) }))}>Удалить</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="inline-actions">
                <button type="button" className="ghost-button" onClick={() => setCraftSourceDraft('')}>Очистить</button>
                <button type="button" className="secondary-button" onClick={() => void handleCraftModalCopy()}>Скопировать</button>
                <button type="button" className="secondary-button" onClick={() => void handleCraftModalPaste()}>Вставить</button>
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
                  }}
                >
                  Применить
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
