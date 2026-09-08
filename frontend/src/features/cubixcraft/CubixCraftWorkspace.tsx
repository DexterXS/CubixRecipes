import { type CSSProperties, type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { NbtTreeEditor, type NbtCompoundNode, type NbtNode } from '../../components/NbtTreeEditor';
import {
  downloadZsCloudFile,
  getItemCatalog,
  getItemPanelAtlas,
  getProjectSettings,
  listZsCloudFiles,
  uploadZsCloudFile
} from '../../services/api';
import type { ItemCatalogEntry, ItemPanelAtlas, ItemPanelAtlasEntry, ZsCloudFile } from '../../types';
import {
  defaultIconSurfaceSettings,
  defaultMobileIconSurfaceSettings,
  isMobileIconViewport,
  normalizeIconSurfaceSettings,
  type IconSurfaceSettings,
  type IconSurfaceSettingsMap
} from '../icon-settings/iconSurfaces';
import { useIconViewport } from '../icon-settings/useIconViewport';

type CubixCell = {
  raw: string;
  amount: number;
  nbt: NbtCompoundNode;
  opaqueNbt?: string;
};

type EditingCell = { row: number; col: number } | null;

type ParsedCubixRecipe = {
  start: number;
  callStart: number;
  end: number;
  group: string;
  output: string;
  grid: Array<Array<CubixCell | null>>;
  preferred: boolean;
};

type RecipeGroup = {
  output: string;
  indexes: number[];
};

const GRID_SIZE = 9;
const DEFAULT_MAX_AMOUNT = 1_000_000;
const CALL_PREFIX = 'mods.cubixcraft.Astral.addRecipe';
const PREFERRED_MARKER = '// CubixRecipes:preferred';
const GROUP_OPTIONS = ['', 'common', 'resonant', 'chaos'];
const emptyNbt = (): NbtCompoundNode => ({ kind: 'compound', entries: [] });
const emptyGrid = (): Array<Array<CubixCell | null>> => Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => null));

function splitTopLevel(text: string): string[] {
  const result: string[] = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let curly = 0;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(') round += 1;
    else if (char === ')') round -= 1;
    else if (char === '[') square += 1;
    else if (char === ']') square -= 1;
    else if (char === '{') curly += 1;
    else if (char === '}') curly -= 1;
    else if (char === ',' && round === 0 && square === 0 && curly === 0) {
      result.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(text.slice(start).trim());
  return result;
}

function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function normalizeGrid(rows: Array<Array<CubixCell | null>>): Array<Array<CubixCell | null>> {
  return Array.from({ length: GRID_SIZE }, (_, row) => Array.from({ length: GRID_SIZE }, (_, col) => rows[row]?.[col] ?? null));
}

function parseCell(text: string): CubixCell | null {
  const value = text.trim();
  if (!value || value === 'null') return null;
  const amountMatch = value.match(/^(.*?)(?:\s*\*\s*(\d+))?\s*$/s);
  const expression = (amountMatch?.[1] ?? value).trim();
  const amount = Math.max(1, Number.parseInt(amountMatch?.[2] ?? '1', 10) || 1);
  const itemMatch = expression.match(/^(<[^>]+>)(.*)$/s);
  if (!itemMatch) return { raw: expression, amount, nbt: emptyNbt() };
  return { raw: itemMatch[1], amount, nbt: emptyNbt(), opaqueNbt: itemMatch[2].trim() || undefined };
}

function parseGrid(text: string): Array<Array<CubixCell | null>> {
  const trimmed = text.trim();
  const inner = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
  const rows = splitTopLevel(inner).map((rowText) => {
    const rowTrimmed = rowText.trim();
    const rowInner = rowTrimmed.startsWith('[') && rowTrimmed.endsWith(']') ? rowTrimmed.slice(1, -1) : rowTrimmed;
    return splitTopLevel(rowInner).map(parseCell);
  });
  return normalizeGrid(rows);
}

function parseGroup(text: string): string {
  const value = text.trim();
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'string' ? parsed : value;
  } catch {
    return value.replace(/^['"]|['"]$/g, '');
  }
}

function preferredStart(text: string, callStart: number): { start: number; preferred: boolean } {
  const currentLineStart = text.lastIndexOf('\n', Math.max(0, callStart - 1)) + 1;
  const previousLineEnd = currentLineStart > 0 ? currentLineStart - 1 : 0;
  const previousLineStart = previousLineEnd > 0 ? text.lastIndexOf('\n', previousLineEnd - 1) + 1 : 0;
  const previousLine = text.slice(previousLineStart, previousLineEnd).trim();
  return previousLine === PREFERRED_MARKER
    ? { start: previousLineStart, preferred: true }
    : { start: callStart, preferred: false };
}

function parseCubixRecipes(text: string): ParsedCubixRecipe[] {
  const recipes: ParsedCubixRecipe[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const callStart = text.indexOf(CALL_PREFIX, cursor);
    if (callStart < 0) break;
    const open = text.indexOf('(', callStart + CALL_PREFIX.length);
    if (open < 0) break;
    const close = findMatchingParen(text, open);
    if (close < 0) break;
    const args = splitTopLevel(text.slice(open + 1, close));
    if (args.length >= 3) {
      let end = close + 1;
      while (end < text.length && /\s/.test(text[end])) end += 1;
      if (text[end] === ';') end += 1;
      const marker = preferredStart(text, callStart);
      recipes.push({
        start: marker.start,
        callStart,
        end,
        group: parseGroup(args[0]),
        output: args[1].trim(),
        grid: parseGrid(args[2]),
        preferred: marker.preferred
      });
    }
    cursor = close + 1;
  }
  return recipes;
}

function parseAtlasRaw(raw: string): { key: string; meta: number } | null {
  const match = raw.trim().match(/^<([a-zA-Z0-9_.-]+:[a-zA-Z0-9_./-]+)(?::([0-9*]+))?>/);
  if (!match) return null;
  return { key: match[1].toLowerCase(), meta: match[2] === '*' ? 0 : (Number.parseInt(match[2] ?? '0', 10) || 0) };
}

function scalarToSnbt(node: Extract<NbtNode, { kind: 'scalar' }>): string {
  const value = node.value || '0';
  if (node.scalarType === 'string') return JSON.stringify(node.value ?? '');
  if (node.scalarType === 'byte') return `${value}b`;
  if (node.scalarType === 'short') return `${value}s`;
  if (node.scalarType === 'long') return `${value}L`;
  if (node.scalarType === 'float') return `${value}f`;
  if (node.scalarType === 'double') return `${value}d`;
  if (node.scalarType === 'byte_array') return `[B;${value}]`;
  if (node.scalarType === 'int_array') return `[I;${value}]`;
  if (node.scalarType === 'long_array') return `[L;${value}]`;
  return value;
}

function nodeToSnbt(node: NbtNode): string {
  if (node.kind === 'scalar') return scalarToSnbt(node);
  if (node.kind === 'list') return `[${node.items.map(nodeToSnbt).join(',')}]`;
  return `{${node.entries.filter((entry) => entry.key.trim()).map((entry) => `${JSON.stringify(entry.key)}:${nodeToSnbt(entry.value)}`).join(',')}}`;
}

function cellRaw(cell: CubixCell): string {
  const nbt = cell.nbt.entries.length ? `.withTag(${nodeToSnbt(cell.nbt)})` : (cell.opaqueNbt ?? '');
  return `${cell.raw}${nbt}${cell.amount === 1 ? '' : `*${cell.amount}`}`;
}

function serializeRecipe(group: string, output: string, grid: Array<Array<CubixCell | null>>): string {
  const rows = grid.map((row) => `        [${row.map((cell) => cell ? cellRaw(cell) : 'null').join(', ')}]`);
  return `mods.cubixcraft.Astral.addRecipe(${JSON.stringify(group)}, ${output || 'null'},\n    [\n${rows.join(',\n')}\n    ]);`;
}

function serializeParsedRecipe(recipe: ParsedCubixRecipe, preferred = recipe.preferred): string {
  return `${preferred ? `${PREFERRED_MARKER}\n` : ''}${serializeRecipe(recipe.group, recipe.output, recipe.grid)}`;
}

function positionedIconStyle(base: CSSProperties | undefined, settings: IconSurfaceSettings): CSSProperties | undefined {
  if (!base) return undefined;
  const scale = settings.icon / 32;
  const centered = settings.mode === 'absolute' || settings.mode === 'scale';
  return {
    ...base,
    display: 'block',
    width: 32,
    height: 32,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
    position: centered ? 'absolute' : 'relative',
    left: centered ? '50%' : undefined,
    top: centered ? '50%' : undefined,
    margin: centered ? undefined : 'auto',
    transform: centered ? `translate(-50%, -50%) scale(${scale})` : `scale(${scale})`,
    transformOrigin: 'center'
  };
}

function compactAmount(value: number): string {
  const units = [
    { value: 1e15, suffix: 'P' },
    { value: 1e12, suffix: 'T' },
    { value: 1e9, suffix: 'G' },
    { value: 1e6, suffix: 'M' },
    { value: 1e3, suffix: 'k' }
  ];
  const unit = units.find((entry) => value >= entry.value);
  if (!unit) return String(value);
  const scaled = value / unit.value;
  const rounded = scaled >= 100 ? Math.round(scaled) : scaled >= 10 ? Math.round(scaled * 10) / 10 : Math.round(scaled * 100) / 100;
  return `${String(rounded).replace(/\.0+$/, '')}${unit.suffix}`;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'CubixCraft_Recipes.zs';
  link.click();
  URL.revokeObjectURL(url);
}

export function CubixCraftWorkspace() {
  const viewport = useIconViewport();
  const mobile = isMobileIconViewport(viewport);
  const [catalog, setCatalog] = useState<ItemCatalogEntry[]>([]);
  const [atlas, setAtlas] = useState<ItemPanelAtlas | null>(null);
  const [cloudFiles, setCloudFiles] = useState<ZsCloudFile[]>([]);
  const [cloudSelection, setCloudSelection] = useState('');
  const [desktopIconSettings, setDesktopIconSettings] = useState<Partial<Record<string, Partial<IconSurfaceSettings>>> | null>(null);
  const [mobileIconSettings, setMobileIconSettings] = useState<Partial<Record<string, Partial<IconSurfaceSettings>>> | null>(null);
  const [search, setSearch] = useState('');
  const [recipeSearch, setRecipeSearch] = useState('');
  const [heldRaw, setHeldRaw] = useState<string | null>(null);
  const [grid, setGrid] = useState<Array<Array<CubixCell | null>>>(() => emptyGrid());
  const [outputRaw, setOutputRaw] = useState('');
  const [group, setGroup] = useState('common');
  const [maxAmount, setMaxAmount] = useState(DEFAULT_MAX_AMOUNT);
  const [editing, setEditing] = useState<EditingCell>(null);
  const [amountDraft, setAmountDraft] = useState('1');
  const [nbtOpen, setNbtOpen] = useState(false);
  const [nbtDraft, setNbtDraft] = useState<NbtCompoundNode>(() => emptyNbt());
  const [nbtCollapsed, setNbtCollapsed] = useState<Record<string, boolean>>({});
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('');
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [activeCloudPath, setActiveCloudPath] = useState<string | null>(null);
  const [fileRecipes, setFileRecipes] = useState<ParsedCubixRecipe[]>([]);
  const [selectedRecipeIndex, setSelectedRecipeIndex] = useState<number | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [expandedOutputs, setExpandedOutputs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([getItemCatalog(), getItemPanelAtlas(), getProjectSettings(), listZsCloudFiles().catch(() => ({ files: [] }))])
      .then(([catalogResponse, atlasResponse, projectSettings, cloudResponse]) => {
        setCatalog(catalogResponse.entries ?? []);
        setAtlas(atlasResponse);
        setDesktopIconSettings(projectSettings.ui_preferences?.icon_surfaces ?? null);
        setMobileIconSettings(projectSettings.ui_preferences?.mobile_icon_surfaces ?? null);
        setCloudFiles(cloudResponse.files ?? []);
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : String(error)));
  }, []);

  const surfaces = useMemo(() => {
    const defaults: IconSurfaceSettingsMap = mobile ? defaultMobileIconSurfaceSettings : defaultIconSurfaceSettings;
    const source = mobile ? mobileIconSettings : desktopIconSettings;
    return normalizeIconSurfaceSettings(source, defaults);
  }, [desktopIconSettings, mobileIconSettings, mobile]);

  const iconSurface = surfaces.cubixCraftGrid;
  const outputSurface = surfaces.craftOutput;

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const source = query ? catalog.filter((item) => `${item.raw} ${item.display_ru} ${item.display_en}`.toLowerCase().includes(query)) : catalog;
    return source.slice(0, 240);
  }, [catalog, search]);

  const catalogByRaw = useMemo(() => new Map(catalog.map((item) => [item.raw, item])), [catalog]);

  const recipeGroups = useMemo<RecipeGroup[]>(() => {
    const map = new Map<string, number[]>();
    fileRecipes.forEach((recipe, index) => {
      const list = map.get(recipe.output) ?? [];
      list.push(index);
      map.set(recipe.output, list);
    });
    const query = recipeSearch.trim().toLowerCase();
    return Array.from(map.entries())
      .map(([output, indexes]) => ({ output, indexes }))
      .filter(({ output, indexes }) => {
        if (!query) return true;
        const item = catalogByRaw.get(output);
        const groups = indexes.map((index) => fileRecipes[index]?.group ?? '').join(' ');
        return `${output} ${item?.display_ru ?? ''} ${item?.display_en ?? ''} ${groups}`.toLowerCase().includes(query);
      });
  }, [catalogByRaw, fileRecipes, recipeSearch]);

  const atlasIndex = useMemo(() => {
    const byKeyMeta = new Map<string, ItemPanelAtlasEntry>();
    Object.values(atlas?.entries ?? {}).forEach((entry) => byKeyMeta.set(`${entry.item_key}:${entry.meta ?? 0}`, entry));
    return byKeyMeta;
  }, [atlas]);

  function atlasStyle(raw: string): CSSProperties | undefined {
    if (!atlas) return undefined;
    const parsed = parseAtlasRaw(raw);
    const entry = atlas.entries[raw] ?? (parsed ? atlasIndex.get(`${parsed.key}:${parsed.meta}`) ?? atlasIndex.get(`${parsed.key}:0`) : undefined);
    if (!entry || !atlas.image_url) return undefined;
    return {
      backgroundImage: `url(${atlas.image_url})`,
      backgroundPosition: `-${entry.x}px -${entry.y}px`,
      backgroundSize: `${atlas.columns * atlas.tile_size}px ${atlas.rows * atlas.tile_size}px`
    };
  }

  function itemVisual(raw: string, surface: IconSurfaceSettings) {
    const item = catalogByRaw.get(raw);
    const atlasIcon = positionedIconStyle(atlasStyle(raw), surface);
    if (atlasIcon) return <span className="cell-atlas-icon" style={atlasIcon} aria-hidden="true" />;
    if (item?.icon_url) return <img src={item.icon_url} alt="" style={{ width: surface.icon, height: surface.icon, objectFit: 'contain' }} />;
    return raw ? <span style={{ opacity: 0.6 }}>?</span> : null;
  }

  function loadDocument(text: string, name: string, cloudPath: string | null) {
    const recipes = parseCubixRecipes(text);
    setFileText(text);
    setFileName(name);
    setActiveCloudPath(cloudPath);
    setFileRecipes(recipes);
    setSelectedRecipeIndex(null);
    setRecipeSearch('');
    const expanded: Record<string, boolean> = {};
    recipes.forEach((recipe) => { if (recipes.filter((entry) => entry.output === recipe.output).length > 1) expanded[recipe.output] = true; });
    setExpandedOutputs(expanded);
    setStatus(`Загружено рецептов CubixCraft: ${recipes.length}`);
    if (recipes.length > 0) selectRecipe(recipes, 0);
  }

  function refreshDocument(nextText: string, selectIndex: number | null = selectedRecipeIndex) {
    const reparsed = parseCubixRecipes(nextText);
    setFileText(nextText);
    setFileRecipes(reparsed);
    if (selectIndex !== null && reparsed[selectIndex]) selectRecipe(reparsed, selectIndex);
    return reparsed;
  }

  function selectRecipe(recipes: ParsedCubixRecipe[], index: number) {
    const recipe = recipes[index];
    if (!recipe) return;
    setSelectedRecipeIndex(index);
    setGroup(recipe.group);
    setOutputRaw(recipe.output);
    setGrid(recipe.grid);
    setExpandedOutputs((current) => ({ ...current, [recipe.output]: true }));
  }

  async function handleLocalFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    loadDocument(await file.text(), file.name, null);
    event.target.value = '';
  }

  async function openCloudFile() {
    if (!cloudSelection) return;
    setStatus('Загрузка файла из облака…');
    try {
      const result = await downloadZsCloudFile(cloudSelection);
      loadDocument(await result.blob.text(), result.filename, cloudSelection);
    } catch (error) {
      setStatus(`Ошибка: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function replaceSelectedRecipe(): string | null {
    if (selectedRecipeIndex === null || !fileText || !outputRaw.trim()) return null;
    const parsed = parseCubixRecipes(fileText);
    const target = parsed[selectedRecipeIndex];
    if (!target) return null;
    const keepPreferred = target.preferred && target.output === outputRaw;
    const nextRecipe = `${keepPreferred ? `${PREFERRED_MARKER}\n` : ''}${serializeRecipe(group, outputRaw, grid)}`;
    const nextText = `${fileText.slice(0, target.start)}${nextRecipe}${fileText.slice(target.end)}`;
    refreshDocument(nextText, selectedRecipeIndex);
    setStatus('Существующий вариант заменён.');
    return nextText;
  }

  function appendVariant(preferred = false): string | null {
    if (!outputRaw.trim()) {
      setStatus('Сначала выберите результат рецепта.');
      return null;
    }
    const base = fileText.trimEnd();
    const recipeText = `${preferred ? `${PREFERRED_MARKER}\n` : ''}${serializeRecipe(group, outputRaw, grid)}`;
    const nextText = `${base}${base ? '\n\n' : ''}${recipeText}\n`;
    const reparsed = refreshDocument(nextText, parseCubixRecipes(nextText).length - 1);
    setFileName((current) => current || 'CubixCraft_Recipes.zs');
    setExpandedOutputs((current) => ({ ...current, [outputRaw]: true }));
    setStatus(reparsed.filter((entry) => entry.output === outputRaw).length > 1 ? 'Запасной вариант сохранён.' : 'Рецепт сохранён.');
    return nextText;
  }

  function markPreferred(index: number) {
    const parsed = parseCubixRecipes(fileText);
    const target = parsed[index];
    if (!target) return;
    let nextText = fileText;
    const siblings = parsed
      .map((recipe, recipeIndex) => ({ recipe, recipeIndex }))
      .filter(({ recipe }) => recipe.output === target.output)
      .sort((a, b) => b.recipe.start - a.recipe.start);

    siblings.forEach(({ recipe, recipeIndex }) => {
      const replacement = serializeParsedRecipe(recipe, recipeIndex === index);
      nextText = `${nextText.slice(0, recipe.start)}${replacement}${nextText.slice(recipe.end)}`;
    });

    const reparsed = parseCubixRecipes(nextText);
    const nextIndex = reparsed.findIndex((recipe, recipeIndex) => recipeIndex === index && recipe.output === target.output);
    refreshDocument(nextText, nextIndex >= 0 ? nextIndex : index);
    setStatus('Основной вариант отмечен звёздочкой.');
  }

  async function saveCloud() {
    if (!activeCloudPath || !fileText) return;
    setStatus('Сохранение в облако…');
    try {
      const result = await uploadZsCloudFile(activeCloudPath, fileText, 'overwrite');
      setCloudFiles(result.files ?? cloudFiles);
      setStatus('Файл сохранён в облако.');
    } catch (error) {
      setStatus(`Ошибка сохранения: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function place(row: number, col: number, raw: string) {
    setGrid((current) => current.map((line, r) => line.map((cell, c) => r === row && c === col ? { raw, amount: 1, nbt: emptyNbt() } : cell)));
  }

  function openCellEditor(row: number, col: number) {
    const cell = grid[row]?.[col];
    if (!cell) return;
    setEditing({ row, col });
    setAmountDraft(String(cell.amount));
    setNbtDraft(cell.nbt);
    setNbtOpen(false);
  }

  function saveCell() {
    if (!editing) return;
    const nextAmount = Math.max(1, Math.min(maxAmount, Math.trunc(Number(amountDraft) || 1)));
    setGrid((current) => current.map((line, r) => line.map((cell, c) => r === editing.row && c === editing.col && cell ? { ...cell, amount: nextAmount, nbt: nbtDraft, opaqueNbt: nbtDraft.entries.length ? undefined : cell.opaqueNbt } : cell)));
    setEditing(null);
    setNbtOpen(false);
  }

  function clearCell() {
    if (!editing) return;
    setGrid((current) => current.map((line, r) => line.map((cell, c) => r === editing.row && c === editing.col ? null : cell)));
    setEditing(null);
    setNbtOpen(false);
  }

  const sameOutputIndexes = fileRecipes.map((recipe, index) => recipe.output === outputRaw ? index : -1).filter((index) => index >= 0);
  const selectedMatchesOutput = selectedRecipeIndex !== null && fileRecipes[selectedRecipeIndex]?.output === outputRaw;
  const source = useMemo(() => serializeRecipe(group, outputRaw, grid), [group, outputRaw, grid]);
  const editorColumns = fileRecipes.length > 0
    ? (mobile ? '280px minmax(500px, 1fr) 360px' : '300px minmax(660px, 1fr) 360px')
    : (mobile ? 'minmax(500px, 1fr) 360px' : 'minmax(660px, 1fr) 360px');

  return (
    <main className="app-shell" style={{ padding: mobile ? 12 : 18, maxWidth: mobile ? undefined : 1700, margin: '0 auto', minWidth: mobile ? 1040 : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <a className="ghost-button" href={window.location.pathname}>← Крафты</a>
        <h1 style={{ margin: 0, fontSize: mobile ? 24 : 26 }}>CubixCraft</h1>
        <span className="status-pill">9×9</span>
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>Макс. в слоте
          <input type="number" min={1} max={1000000000} value={maxAmount} onChange={(event) => setMaxAmount(Math.max(1, Math.trunc(Number(event.target.value) || 1)))} style={{ width: 110 }} />
        </label>
      </div>

      {loadError ? <div className="error-box">Не удалось загрузить данные: {loadError}</div> : null}

      <section className="panel" style={{ marginBottom: 10, padding: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ marginRight: 4 }}>Файл рецептов</strong>
          <label className="ghost-button" style={{ cursor: 'pointer' }}>Загрузить .zs
            <input type="file" accept=".zs,text/plain" onChange={(event) => void handleLocalFile(event)} style={{ display: 'none' }} />
          </label>
          <select value={cloudSelection} onChange={(event) => setCloudSelection(event.target.value)} style={{ minWidth: 230, flex: '1 1 280px', maxWidth: 520 }}>
            <option value="">Файл из облака…</option>
            {cloudFiles.filter((file) => file.name.toLowerCase().endsWith('.zs')).map((file) => <option key={file.path} value={file.path}>{file.name}</option>)}
          </select>
          <button type="button" className="ghost-button" disabled={!cloudSelection} onClick={() => void openCloudFile()}>Открыть</button>
          {activeCloudPath ? <button type="button" className="primary-button" onClick={() => void saveCloud()}>Сохранить в облако</button> : null}
          {fileText ? <button type="button" className="ghost-button" onClick={() => downloadText(fileName || 'CubixCraft_Recipes.zs', fileText)}>Скачать .zs</button> : null}
        </div>
        <div style={{ marginTop: 6, opacity: 0.72, fontSize: 12 }}>{fileName ? `${fileName} · ${fileRecipes.length} рецептов` : 'Новый файл'}{status ? ` · ${status}` : ''}</div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: editorColumns, gap: 12, alignItems: 'start' }}>
        {fileRecipes.length > 0 ? (
          <aside className="panel" style={{ padding: 10, position: 'sticky', top: 8, maxHeight: 'calc(100vh - 110px)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <strong>Рецепты</strong><span style={{ opacity: 0.65, fontSize: 12 }}>{recipeGroups.length} предметов</span>
            </div>
            <input value={recipeSearch} onChange={(event) => setRecipeSearch(event.target.value)} placeholder="Поиск рецепта" style={{ width: '100%', marginBottom: 8 }} />
            <div style={{ display: 'grid', gap: 6, maxHeight: 'calc(100vh - 190px)', overflowY: 'auto', paddingRight: 3 }}>
              {recipeGroups.map(({ output, indexes }, groupIndex) => {
                const item = catalogByRaw.get(output);
                const label = item?.display_ru || item?.display_en || output;
                const expanded = indexes.length > 1 && (expandedOutputs[output] ?? false);
                const preferred = indexes.find((index) => fileRecipes[index]?.preferred);
                return (
                  <div key={output} style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,.025)' }}>
                    <button
                      type="button"
                      onClick={() => indexes.length === 1 ? selectRecipe(fileRecipes, indexes[0]) : setExpandedOutputs((current) => ({ ...current, [output]: !expanded }))}
                      style={{ width: '100%', display: 'grid', gridTemplateColumns: '38px minmax(0,1fr) auto', gap: 8, alignItems: 'center', textAlign: 'left', padding: 7, border: 0, borderRadius: 0, background: indexes.some((index) => index === selectedRecipeIndex) ? 'rgba(45,126,247,.18)' : 'transparent', color: 'inherit', cursor: 'pointer' }}
                    >
                      <span style={{ width: 36, height: 36, position: 'relative', display: 'grid', placeItems: 'center', overflow: 'hidden', borderRadius: 6, background: 'rgba(255,255,255,.06)' }}>{itemVisual(output, { ...outputSurface, cell: 36, icon: 28 })}</span>
                      <span style={{ minWidth: 0 }}>
                        <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13 }}>{groupIndex + 1}. {label}</strong>
                        <span style={{ display: 'block', fontSize: 11, opacity: 0.68 }}>{indexes.length === 1 ? '1 рецепт' : `${indexes.length} вариантов`}{preferred !== undefined ? ' · ★ выбран' : ''}</span>
                      </span>
                      <span style={{ opacity: 0.65 }}>{indexes.length > 1 ? (expanded ? '▾' : '▸') : ''}</span>
                    </button>

                    {expanded ? (
                      <div style={{ display: 'grid', gap: 4, padding: '0 6px 6px 46px' }}>
                        {indexes.map((index, variantIndex) => {
                          const recipe = fileRecipes[index];
                          const selected = selectedRecipeIndex === index;
                          return (
                            <div key={`${recipe.start}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 30px', gap: 4 }}>
                              <button type="button" className="ghost-button" onClick={() => selectRecipe(fileRecipes, index)} style={{ textAlign: 'left', padding: '6px 8px', borderColor: selected ? '#4da3ff' : undefined, background: selected ? 'rgba(45,126,247,.18)' : undefined }}>
                                <strong style={{ fontSize: 12 }}>Вариант {variantIndex + 1}</strong>
                                <span style={{ display: 'block', fontSize: 10, opacity: 0.68 }}>{recipe.group || 'без группы'}</span>
                              </button>
                              <button type="button" className="ghost-button" title={recipe.preferred ? 'Основной вариант' : 'Сделать основным'} onClick={() => markPreferred(index)} style={{ padding: 0, fontSize: 18, color: recipe.preferred ? '#ffd34d' : 'inherit' }}>{recipe.preferred ? '★' : '☆'}</button>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {recipeGroups.length === 0 ? <div style={{ opacity: 0.65, padding: 10 }}>Ничего не найдено</div> : null}
            </div>
          </aside>
        ) : null}

        <section className="panel" style={{ padding: 12, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {sameOutputIndexes.length === 0 ? (
                <button type="button" className="primary-button" disabled={!outputRaw} onClick={() => appendVariant(true)}>Сохранить рецепт</button>
              ) : (
                <>
                  <button type="button" className="primary-button" disabled={!selectedMatchesOutput} onClick={replaceSelectedRecipe}>Заменить существующий</button>
                  <button type="button" className="ghost-button" disabled={!outputRaw} onClick={() => appendVariant(false)}>Сохранить как запасной вариант</button>
                </>
              )}
            </div>
            <button type="button" className="ghost-button" onClick={() => setHeldRaw(null)} style={{ whiteSpace: 'nowrap' }}>Отпустить предмет</button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: mobile ? 16 : 24, overflow: 'auto', padding: '4px 0 2px' }}>
            <div className="grid-wrap cubixcraft-grid" data-grid-size="9" style={{ '--extreme-grid-gap': '8px', gap: `${iconSurface.gap}px`, flex: '0 0 auto' } as CSSProperties}>
              {grid.map((row, rowIndex) => (
                <div key={rowIndex} className={`grid-row ${rowIndex > 0 && rowIndex % 3 === 0 ? 'group-row-start' : ''}`} style={{ gap: iconSurface.gap }}>
                  {row.map((cell, colIndex) => {
                    const catalogItem = cell ? catalogByRaw.get(cell.raw) : undefined;
                    return (
                      <div
                        key={`${rowIndex}-${colIndex}`}
                        className={`grid-cell size-9 ${colIndex > 0 && colIndex % 3 === 0 ? 'group-col-start' : ''} ${cell ? 'is-filled' : 'is-empty'}`}
                        style={{ width: iconSurface.cell, height: iconSurface.cell, minWidth: iconSurface.cell, minHeight: iconSurface.cell, position: 'relative' }}
                        onClick={() => heldRaw && place(rowIndex, colIndex, heldRaw)}
                        onContextMenu={(event) => { event.preventDefault(); openCellEditor(rowIndex, colIndex); }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => { event.preventDefault(); const raw = event.dataTransfer.getData('text/plain'); if (raw) place(rowIndex, colIndex, raw); }}
                        title={cell ? `${catalogItem?.display_ru || cell.raw} × ${cell.amount.toLocaleString('ru-RU')}` : 'Пустая ячейка'}
                      >
                        <div className="cell-visual" style={{ width: '100%', height: '100%' }}>
                          <div className="cell-icon-slot" style={{ position: 'relative', width: '100%', height: '100%', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                            {cell ? itemVisual(cell.raw, iconSurface) : null}
                          </div>
                        </div>
                        {cell ? <span className="cubixcraft-amount" title={cell.amount.toLocaleString('ru-RU')} style={{ position: 'absolute', right: 2, bottom: 1, zIndex: 20, pointerEvents: 'none', fontSize: 10, fontWeight: 800, color: '#fff', textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 1px 2px #000' }}>{compactAmount(cell.amount)}</span> : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', justifyItems: 'center', alignContent: 'center', gap: 12, minWidth: 150 }}>
              <label style={{ display: 'grid', gap: 5, width: 140 }}>
                <span style={{ textAlign: 'center', fontSize: 12, opacity: 0.72 }}>Группа</span>
                <select value={group} onChange={(event) => setGroup(event.target.value)}>
                  {GROUP_OPTIONS.includes(group) ? null : <option value={group}>{group}</option>}
                  <option value="">без группы</option>
                  <option value="common">common</option>
                  <option value="resonant">resonant</option>
                  <option value="chaos">chaos</option>
                </select>
              </label>

              <div style={{ display: 'grid', justifyItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 12, opacity: 0.72 }}>Результат</span>
                <div
                  className={`grid-cell ${outputRaw ? 'is-filled' : 'is-empty'}`}
                  style={{ width: outputSurface.cell, height: outputSurface.cell, minWidth: outputSurface.cell, minHeight: outputSurface.cell, position: 'relative', cursor: heldRaw ? 'copy' : 'default' }}
                  onClick={() => { if (heldRaw) setOutputRaw(heldRaw); }}
                  onContextMenu={(event) => { event.preventDefault(); setOutputRaw(''); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.preventDefault(); const raw = event.dataTransfer.getData('text/plain'); if (raw) setOutputRaw(raw); }}
                  title={outputRaw ? `${catalogByRaw.get(outputRaw)?.display_ru || catalogByRaw.get(outputRaw)?.display_en || outputRaw}\nПКМ — очистить` : 'Выберите предмет в NEI и нажмите сюда'}
                >
                  <div className="cell-visual" style={{ width: '100%', height: '100%' }}>
                    <div className="cell-icon-slot" style={{ position: 'relative', width: '100%', height: '100%', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                      {outputRaw ? itemVisual(outputRaw, outputSurface) : null}
                    </div>
                  </div>
                </div>
                <span style={{ maxWidth: 150, fontSize: 10, opacity: 0.55, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{outputRaw || 'пусто'}</span>
              </div>
            </div>
          </div>

          <p style={{ opacity: 0.65, margin: '8px 0 6px', fontSize: 12 }}>ЛКМ по NEI — взять предмет · ЛКМ по ячейке/результату — поставить · ПКМ по ячейке — количество/NBT · ПКМ по результату — очистить</p>

          <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 8, marginTop: 4 }}>
            <button type="button" className="ghost-button" onClick={() => setSourceOpen((value) => !value)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Исходный код рецепта</span><span>{sourceOpen ? '▾' : '▸'}</span>
            </button>
            {sourceOpen ? (
              <div style={{ marginTop: 8 }}>
                <textarea readOnly value={source} style={{ width: '100%', minHeight: 180, maxHeight: 320, fontFamily: 'monospace', resize: 'vertical' }} aria-label="cubixcraft-source" />
                <button type="button" className="primary-button" onClick={() => void navigator.clipboard.writeText(source)} style={{ marginTop: 6 }}>Копировать рецепт</button>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="panel" style={{ padding: 10, position: 'sticky', top: 8, maxHeight: 'calc(100vh - 110px)', minWidth: 0 }}>
          <input aria-label="cubixcraft-nei-search" placeholder="Поиск NEI" value={search} onChange={(event) => setSearch(event.target.value)} style={{ width: '100%', marginBottom: 8 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(34px, 1fr))', gap: 4, maxHeight: 'calc(100vh - 190px)', overflow: 'auto', paddingRight: 2 }}>
            {visibleItems.map((item) => {
              const style = atlasStyle(item.raw);
              return (
                <button
                  key={`${item.raw}-${item.meta}`}
                  type="button"
                  className="nei-item-button"
                  draggable
                  title={`${item.display_ru || item.display_en || item.raw}\n${item.raw}`}
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', item.raw)}
                  onClick={() => setHeldRaw(item.raw)}
                  style={{ minWidth: 34, minHeight: 34, padding: 2, position: 'relative' }}
                >
                  {style ? <span className="nei-atlas-icon" style={style} aria-hidden="true" /> : null}
                  {!style && item.icon_url ? <img src={item.icon_url} alt="" style={{ width: 30, height: 30, objectFit: 'contain' }} /> : null}
                  {!style && !item.icon_url ? '?' : null}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 6, opacity: 0.7, fontSize: 11 }}>Выбрано: {heldRaw ?? '—'} · найдено: {visibleItems.length}</div>
        </aside>
      </div>

      {editing ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" style={{ width: nbtOpen ? 'min(900px, 92vw)' : 420, maxHeight: '90vh', overflow: 'auto' }}>
            <h2>Настройка ячейки</h2>
            {!nbtOpen ? (
              <>
                <label>Количество<input autoFocus type="number" min={1} max={maxAmount} value={amountDraft} onChange={(event) => setAmountDraft(event.target.value)} style={{ width: '100%' }} /></label>
                <small>Допустимо 1…{maxAmount.toLocaleString('ru-RU')}</small>
                {editing && grid[editing.row]?.[editing.col]?.opaqueNbt ? <small style={{ display: 'block', marginTop: 6 }}>NBT из файла сохранён как есть. Если добавить NBT через редактор, он заменит исходный withTag.</small> : null}
                <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                  <button type="button" className="ghost-button" onClick={() => setNbtOpen(true)}>Настроить NBT</button>
                  <button type="button" className="ghost-button danger-lite-button" onClick={clearCell}>Удалить</button>
                  <button type="button" className="ghost-button" onClick={() => setEditing(null)}>Отмена</button>
                  <button type="button" className="primary-button" onClick={saveCell}>Сохранить</button>
                </div>
              </>
            ) : (
              <>
                <NbtTreeEditor root={nbtDraft} collapsedPaths={nbtCollapsed} labelPrefix="cubixcraft-nbt" onChange={setNbtDraft} onCollapsedPathsChange={setNbtCollapsed} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <button type="button" className="ghost-button" onClick={() => setNbtOpen(false)}>Назад</button>
                  <button type="button" className="primary-button" onClick={() => setNbtOpen(false)}>Применить NBT</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
