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
  end: number;
  group: string;
  output: string;
  grid: Array<Array<CubixCell | null>>;
};

const GRID_SIZE = 9;
const DEFAULT_MAX_AMOUNT = 1_000_000;
const CALL_PREFIX = 'mods.cubixcraft.Astral.addRecipe';
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
  return Array.from({ length: GRID_SIZE }, (_, row) =>
    Array.from({ length: GRID_SIZE }, (_, col) => rows[row]?.[col] ?? null)
  );
}

function parseCell(text: string): CubixCell | null {
  const value = text.trim();
  if (!value || value === 'null') return null;
  const amountMatch = value.match(/^(.*?)(?:\s*\*\s*(\d+))?\s*$/s);
  const expression = (amountMatch?.[1] ?? value).trim();
  const amount = Math.max(1, Number.parseInt(amountMatch?.[2] ?? '1', 10) || 1);
  const itemMatch = expression.match(/^(<[^>]+>)(.*)$/s);
  if (!itemMatch) return { raw: expression, amount, nbt: emptyNbt() };
  return {
    raw: itemMatch[1],
    amount,
    nbt: emptyNbt(),
    opaqueNbt: itemMatch[2].trim() || undefined
  };
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
    return value.replace(/^['"]|['"]$/g, '') || 'common';
  }
}

function parseCubixRecipes(text: string): ParsedCubixRecipe[] {
  const recipes: ParsedCubixRecipe[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf(CALL_PREFIX, cursor);
    if (start < 0) break;
    const open = text.indexOf('(', start + CALL_PREFIX.length);
    if (open < 0) break;
    const close = findMatchingParen(text, open);
    if (close < 0) break;
    const args = splitTopLevel(text.slice(open + 1, close));
    if (args.length >= 3) {
      let end = close + 1;
      while (end < text.length && /\s/.test(text[end])) end += 1;
      if (text[end] === ';') end += 1;
      recipes.push({
        start,
        end,
        group: parseGroup(args[0]),
        output: args[1].trim(),
        grid: parseGrid(args[2])
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
  return `mods.cubixcraft.Astral.addRecipe(${JSON.stringify(group || 'common')}, ${output || '<minecraft:stone>'},\n    [\n${rows.join(',\n')}\n    ]);`;
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
  const [catalog, setCatalog] = useState<ItemCatalogEntry[]>([]);
  const [atlas, setAtlas] = useState<ItemPanelAtlas | null>(null);
  const [cloudFiles, setCloudFiles] = useState<ZsCloudFile[]>([]);
  const [cloudSelection, setCloudSelection] = useState('');
  const [desktopIconSettings, setDesktopIconSettings] = useState<Partial<Record<string, Partial<IconSurfaceSettings>>> | null>(null);
  const [mobileIconSettings, setMobileIconSettings] = useState<Partial<Record<string, Partial<IconSurfaceSettings>>> | null>(null);
  const [search, setSearch] = useState('');
  const [heldRaw, setHeldRaw] = useState<string | null>(null);
  const [grid, setGrid] = useState<Array<Array<CubixCell | null>>>(() => emptyGrid());
  const [outputRaw, setOutputRaw] = useState('<minecraft:stone>');
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

  const iconSurface = useMemo(() => {
    const mobile = isMobileIconViewport(viewport);
    const defaults: IconSurfaceSettingsMap = mobile ? defaultMobileIconSurfaceSettings : defaultIconSurfaceSettings;
    const source = mobile ? mobileIconSettings : desktopIconSettings;
    return normalizeIconSurfaceSettings(source, defaults).cubixCraftGrid;
  }, [desktopIconSettings, mobileIconSettings, viewport]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const source = query
      ? catalog.filter((item) => `${item.raw} ${item.display_ru} ${item.display_en}`.toLowerCase().includes(query))
      : catalog;
    return source.slice(0, 240);
  }, [catalog, search]);

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

  function loadDocument(text: string, name: string, cloudPath: string | null) {
    const recipes = parseCubixRecipes(text);
    setFileText(text);
    setFileName(name);
    setActiveCloudPath(cloudPath);
    setFileRecipes(recipes);
    setSelectedRecipeIndex(null);
    setStatus(`Загружено рецептов CubixCraft: ${recipes.length}`);
    if (recipes.length > 0) selectRecipe(recipes, 0);
  }

  function selectRecipe(recipes: ParsedCubixRecipe[], index: number) {
    const recipe = recipes[index];
    if (!recipe) return;
    setSelectedRecipeIndex(index);
    setGroup(recipe.group);
    setOutputRaw(recipe.output);
    setGrid(recipe.grid);
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

  function applyRecipeToDocument(): string | null {
    if (selectedRecipeIndex === null || !fileText) return null;
    const parsed = parseCubixRecipes(fileText);
    const target = parsed[selectedRecipeIndex];
    if (!target) return null;
    const nextRecipe = serializeRecipe(group, outputRaw, grid);
    const nextText = `${fileText.slice(0, target.start)}${nextRecipe}${fileText.slice(target.end)}`;
    const reparsed = parseCubixRecipes(nextText);
    setFileText(nextText);
    setFileRecipes(reparsed);
    if (reparsed[selectedRecipeIndex]) selectRecipe(reparsed, selectedRecipeIndex);
    setStatus('Рецепт применён к файлу.');
    return nextText;
  }

  async function saveCloud() {
    if (!activeCloudPath) return;
    const nextText = applyRecipeToDocument() ?? fileText;
    if (!nextText) return;
    setStatus('Сохранение в облако…');
    try {
      const result = await uploadZsCloudFile(activeCloudPath, nextText, 'overwrite');
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

  const source = useMemo(() => serializeRecipe(group, outputRaw, grid), [group, outputRaw, grid]);

  return (
    <main className="app-shell" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <a className="ghost-button" href={window.location.pathname}>← Крафты</a>
        <h1 style={{ margin: 0 }}>CubixCraft</h1>
        <span className="status-pill">9×9</span>
        <label style={{ marginLeft: 'auto' }}>Макс. в слоте&nbsp;
          <input type="number" min={1} max={1000000000} value={maxAmount} onChange={(event) => setMaxAmount(Math.max(1, Math.trunc(Number(event.target.value) || 1)))} style={{ width: 120 }} />
        </label>
      </div>

      {loadError ? <div className="error-box">Не удалось загрузить данные: {loadError}</div> : null}

      <section className="panel" style={{ marginBottom: 12 }}>
        <strong>Файл рецептов</strong>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <label className="ghost-button" style={{ cursor: 'pointer' }}>
            Загрузить .zs
            <input type="file" accept=".zs,text/plain" onChange={(event) => void handleLocalFile(event)} style={{ display: 'none' }} />
          </label>
          <select value={cloudSelection} onChange={(event) => setCloudSelection(event.target.value)} style={{ minWidth: 220 }}>
            <option value="">Файл из облака…</option>
            {cloudFiles.filter((file) => file.name.toLowerCase().endsWith('.zs')).map((file) => <option key={file.path} value={file.path}>{file.name}</option>)}
          </select>
          <button type="button" className="ghost-button" disabled={!cloudSelection} onClick={() => void openCloudFile()}>Открыть</button>
          <button type="button" className="primary-button" disabled={selectedRecipeIndex === null || !fileText} onClick={applyRecipeToDocument}>Применить к файлу</button>
          {activeCloudPath ? <button type="button" className="primary-button" onClick={() => void saveCloud()}>Сохранить в облако</button> : null}
          {fileText ? <button type="button" className="ghost-button" onClick={() => downloadText(fileName, applyRecipeToDocument() ?? fileText)}>Скачать .zs</button> : null}
        </div>
        <div style={{ marginTop: 8, opacity: 0.8 }}>{fileName ? `${fileName} · ${fileRecipes.length} рецептов` : 'Файл не выбран'}{status ? ` · ${status}` : ''}</div>
        {fileRecipes.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 8, paddingBottom: 4 }}>
            {fileRecipes.map((recipe, index) => (
              <button key={`${recipe.start}-${index}`} type="button" className={selectedRecipeIndex === index ? 'primary-button' : 'ghost-button'} onClick={() => selectRecipe(fileRecipes, index)} title={recipe.output}>
                {index + 1}. {recipe.group} · {recipe.output.length > 34 ? `${recipe.output.slice(0, 31)}…` : recipe.output}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(520px, 1fr) minmax(320px, 420px)', gap: 16, alignItems: 'start' }}>
        <section className="panel">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <label>Группа <input value={group} onChange={(event) => setGroup(event.target.value)} style={{ width: 130 }} /></label>
            <label style={{ flex: 1 }}>Результат <input value={outputRaw} onChange={(event) => setOutputRaw(event.target.value)} style={{ width: '100%' }} /></label>
            <button type="button" className="ghost-button" onClick={() => setHeldRaw(null)}>Отпустить предмет</button>
          </div>

          <div className="grid-wrap cubixcraft-grid" data-grid-size="9" style={{ '--extreme-grid-gap': '8px', gap: `${iconSurface.gap}px` } as CSSProperties}>
            {grid.map((row, rowIndex) => (
              <div key={rowIndex} className={`grid-row ${rowIndex > 0 && rowIndex % 3 === 0 ? 'group-row-start' : ''}`} style={{ gap: iconSurface.gap }}>
                {row.map((cell, colIndex) => {
                  const rawAtlasStyle = cell ? atlasStyle(cell.raw) : undefined;
                  const iconStyle = positionedIconStyle(rawAtlasStyle, iconSurface);
                  const catalogItem = cell ? catalog.find((item) => item.raw === cell.raw) : undefined;
                  return (
                    <div
                      key={`${rowIndex}-${colIndex}`}
                      className={`grid-cell size-9 ${colIndex > 0 && colIndex % 3 === 0 ? 'group-col-start' : ''} ${cell ? 'is-filled' : 'is-empty'}`}
                      style={{ width: iconSurface.cell, height: iconSurface.cell, minWidth: iconSurface.cell, minHeight: iconSurface.cell, position: 'relative' }}
                      onClick={() => heldRaw && place(rowIndex, colIndex, heldRaw)}
                      onContextMenu={(event) => { event.preventDefault(); openCellEditor(rowIndex, colIndex); }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => { event.preventDefault(); const raw = event.dataTransfer.getData('text/plain'); if (raw) place(rowIndex, colIndex, raw); }}
                      title={cell ? `${catalogItem?.display_ru || cell.raw} × ${cell.amount}` : 'Пустая ячейка'}
                    >
                      <div className="cell-visual" style={{ width: '100%', height: '100%' }}>
                        <div className="cell-icon-slot" style={{ position: 'relative', width: '100%', height: '100%', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                          {iconStyle ? <span className="cell-atlas-icon" style={iconStyle} aria-hidden="true" /> : null}
                          {!iconStyle && catalogItem?.icon_url ? <img src={catalogItem.icon_url} alt="" style={{ width: iconSurface.icon, height: iconSurface.icon, objectFit: 'contain' }} /> : null}
                          {cell && !iconStyle && !catalogItem?.icon_url ? <span>?</span> : null}
                        </div>
                      </div>
                      {cell ? <span style={{ position: 'absolute', right: 2, bottom: 1, fontSize: 10, fontWeight: 700, textShadow: '0 1px 2px #000' }}>{cell.amount.toLocaleString('ru-RU')}</span> : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <p style={{ opacity: 0.75, marginBottom: 8 }}>ЛКМ по NEI — взять предмет. ЛКМ по ячейке — поставить 1. ПКМ по ячейке — количество/NBT. Двойной клик по NEI — результат.</p>
          <textarea readOnly value={source} style={{ width: '100%', minHeight: 180, fontFamily: 'monospace' }} aria-label="cubixcraft-source" />
          <button type="button" className="primary-button" onClick={() => void navigator.clipboard.writeText(source)}>Копировать рецепт</button>
        </section>

        <aside className="panel">
          <input aria-label="cubixcraft-nei-search" placeholder="Поиск NEI" value={search} onChange={(event) => setSearch(event.target.value)} style={{ width: '100%', marginBottom: 10 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(32px, 1fr))', gap: 4, maxHeight: '72vh', overflow: 'auto' }}>
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
                  onDoubleClick={() => setOutputRaw(item.raw)}
                  style={{ minWidth: 36, minHeight: 36, padding: 2, position: 'relative' }}
                >
                  {style ? <span className="nei-atlas-icon" style={style} aria-hidden="true" /> : null}
                  {!style && item.icon_url ? <img src={item.icon_url} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} /> : null}
                  {!style && !item.icon_url ? '?' : null}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 8, opacity: 0.8 }}>Выбрано: {heldRaw ?? '—'} · найдено: {visibleItems.length}</div>
        </aside>
      </div>

      {editing ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" style={{ width: nbtOpen ? 'min(900px, 92vw)' : 420, maxHeight: '90vh', overflow: 'auto' }}>
            <h2>Настройка ячейки</h2>
            {!nbtOpen ? (
              <>
                <label>Количество
                  <input autoFocus type="number" min={1} max={maxAmount} value={amountDraft} onChange={(event) => setAmountDraft(event.target.value)} style={{ width: '100%' }} />
                </label>
                <small>Допустимо 1…{maxAmount.toLocaleString('ru-RU')}</small>
                {editing && grid[editing.row]?.[editing.col]?.opaqueNbt ? <small style={{ display: 'block', marginTop: 6 }}>NBT из файла сохранён как есть. Если добавить NBT через редактор, он заменит исходный withTag.</small> : null}
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
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
