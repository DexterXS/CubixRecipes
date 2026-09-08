import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { AnimatedIcon } from '../../components/AnimatedIcon';
import { NbtTreeEditor, type NbtCompoundNode, type NbtNode } from '../../components/NbtTreeEditor';
import { getItemCatalog, getItemPanelAtlas } from '../../services/api';
import type { ItemCatalogEntry, ItemPanelAtlas, ItemPanelAtlasEntry } from '../../types';

type CubixCell = {
  raw: string;
  amount: number;
  nbt: NbtCompoundNode;
};

type EditingCell = { row: number; col: number } | null;

const GRID_SIZE = 9;
const DEFAULT_MAX_AMOUNT = 1_000_000;
const emptyNbt = (): NbtCompoundNode => ({ kind: 'compound', entries: [] });
const emptyGrid = (): Array<Array<CubixCell | null>> => Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => null));

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
  const nbt = cell.nbt.entries.length ? `.withTag(${nodeToSnbt(cell.nbt)})` : '';
  return `${cell.raw}${nbt}${cell.amount === 1 ? '' : `*${cell.amount}`}`;
}

function serializeRecipe(group: string, output: string, grid: Array<Array<CubixCell | null>>): string {
  const rows = grid.map((row) => `        [${row.map((cell) => cell ? cellRaw(cell) : 'null').join(', ')}]`);
  return `mods.cubixcraft.Astral.addRecipe(${JSON.stringify(group || 'common')}, ${output || '<minecraft:stone>'},\n    [\n${rows.join(',\n')}\n    ]);`;
}

export function CubixCraftWorkspace() {
  const [catalog, setCatalog] = useState<ItemCatalogEntry[]>([]);
  const [atlas, setAtlas] = useState<ItemPanelAtlas | null>(null);
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

  useEffect(() => {
    Promise.all([getItemCatalog(), getItemPanelAtlas()])
      .then(([catalogResponse, atlasResponse]) => {
        setCatalog(catalogResponse.entries ?? []);
        setAtlas(atlasResponse);
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : String(error)));
  }, []);

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
    setGrid((current) => current.map((line, r) => line.map((cell, c) => r === editing.row && c === editing.col && cell ? { ...cell, amount: nextAmount, nbt: nbtDraft } : cell)));
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <a className="ghost-button" href={window.location.pathname}>← Крафты</a>
        <h1 style={{ margin: 0 }}>CubixCraft</h1>
        <span className="status-pill">9×9</span>
        <label style={{ marginLeft: 'auto' }}>Макс. в слоте&nbsp;
          <input type="number" min={1} max={1000000000} value={maxAmount} onChange={(event) => setMaxAmount(Math.max(1, Math.trunc(Number(event.target.value) || 1)))} style={{ width: 120 }} />
        </label>
      </div>

      {loadError ? <div className="error-box">Не удалось загрузить NEI: {loadError}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(520px, 1fr) minmax(320px, 420px)', gap: 16, alignItems: 'start' }}>
        <section className="panel">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <label>Группа <input value={group} onChange={(event) => setGroup(event.target.value)} style={{ width: 130 }} /></label>
            <label style={{ flex: 1 }}>Результат <input value={outputRaw} onChange={(event) => setOutputRaw(event.target.value)} style={{ width: '100%' }} /></label>
            <button type="button" className="ghost-button" onClick={() => setHeldRaw(null)}>Отпустить предмет</button>
          </div>

          <div className="grid-wrap" data-grid-size="9" style={{ '--extreme-grid-gap': '8px' } as CSSProperties}>
            {grid.map((row, rowIndex) => (
              <div key={rowIndex} className={`grid-row ${rowIndex > 0 && rowIndex % 3 === 0 ? 'group-row-start' : ''}`}>
                {row.map((cell, colIndex) => {
                  const style = cell ? atlasStyle(cell.raw) : undefined;
                  const catalogItem = cell ? catalog.find((item) => item.raw === cell.raw) : undefined;
                  return (
                    <div
                      key={`${rowIndex}-${colIndex}`}
                      className={`grid-cell size-9 ${colIndex > 0 && colIndex % 3 === 0 ? 'group-col-start' : ''} ${cell ? 'is-filled' : 'is-empty'}`}
                      onClick={() => heldRaw && place(rowIndex, colIndex, heldRaw)}
                      onContextMenu={(event) => { event.preventDefault(); openCellEditor(rowIndex, colIndex); }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => { event.preventDefault(); const raw = event.dataTransfer.getData('text/plain'); if (raw) place(rowIndex, colIndex, raw); }}
                      title={cell ? `${catalogItem?.display_ru || cell.raw} × ${cell.amount}` : 'Пустая ячейка'}
                    >
                      <div className="cell-visual">
                        <div className="cell-icon-slot">
                          {style ? <span className="cell-atlas-icon" style={style} aria-hidden="true" /> : null}
                          {!style && catalogItem?.icon_url ? <AnimatedIcon iconUrl={catalogItem.icon_url} alt={catalogItem.display_ru || cell?.raw || ''} animated={false} animationsEnabled /> : null}
                          {cell && !style && !catalogItem?.icon_url ? <span>?</span> : null}
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
