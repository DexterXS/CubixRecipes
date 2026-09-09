import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import {
  bootstrapItemIntelligence,
  getItemCatalog,
  getItemIntelligenceItem,
  getItemIntelligenceSchema,
  getItemIntelligenceSummary,
  getItemPanelAtlas,
  getItemPriceHistory,
  listItemIntelligence,
  updateItemIntelligence,
  type ItemIntelligenceRecord,
  type ItemIntelligenceSummary,
  type ItemPriceHistoryEntry,
  type PassportField,
  type PassportGroup
} from '../../services/api';
import type { ItemCatalogEntry, ItemPanelAtlas, ItemPanelAtlasEntry } from '../../types';
import { PriceImportDialog } from './PriceImportDialog';
import './ItemDatabasePage.css';

function itemModId(entry: ItemCatalogEntry): string {
  return String(entry.key || '').split(':', 1)[0] || 'unknown';
}
function sourceCount(entry: ItemCatalogEntry): number {
  return new Set(entry.sources || []).size;
}
function identity(key: string, meta: number): string {
  return `${String(key || '').toLowerCase()}:${meta || 0}`;
}
function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return String(value);
}
function inputValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  return value === null || value === undefined ? '' : String(value);
}
function parseValue(raw: string, type: PassportField[2]): unknown {
  if (type === 'list') return raw.split(',').map((v) => v.trim()).filter(Boolean);
  if (type === 'number') return raw.trim() === '' ? null : Number(raw);
  return raw;
}
function parseAtlasRaw(raw: string): { key: string; meta: number } | null {
  const match = raw.trim().match(/^<([a-zA-Z0-9_.-]+:[a-zA-Z0-9_./-]+)(?::([0-9*]+))?>/);
  if (!match) return null;
  return { key: match[1].toLowerCase(), meta: match[2] === '*' ? 0 : (Number.parseInt(match[2] ?? '0', 10) || 0) };
}
function priceHistoryLabel(entry: ItemPriceHistoryEntry): string {
  if (entry.sale_restricted) return 'Продажа запрещена';
  if (entry.change_type === 'sale_allowed') return `Продажа снова разрешена · ${entry.price ?? entry.raw_price}`;
  if (entry.change_type === 'initial') return `Начальная цена · ${entry.price ?? entry.raw_price}`;
  return `${entry.previous_raw_price ?? '—'} → ${entry.price ?? entry.raw_price}`;
}

const EMPTY_SUMMARY: ItemIntelligenceSummary = {
  items_total: 0, items_ready: 0, items_needs_review: 0,
  sources_total: 0, evidence_total: 0, mods_total: 0, average_completion: 0
};

const CORE_GROUP: PassportGroup = {
  key: 'core', label: 'Основные данные', fields: [
    ['display_ru', 'Название RU', 'text'], ['display_en', 'Название EN', 'text'],
    ['description', 'Основное описание', 'textarea'], ['category', 'Категория', 'text'],
    ['tier', 'Tier', 'text'], ['rarity', 'Редкость', 'text'], ['status', 'Статус', 'text'],
    ['completion_percent', 'Готовность паспорта, %', 'number'], ['confidence', 'Общий confidence', 'number']
  ]
};

export function ItemDatabasePage() {
  const [items, setItems] = useState<ItemCatalogEntry[]>([]);
  const [atlas, setAtlas] = useState<ItemPanelAtlas | null>(null);
  const [intelItems, setIntelItems] = useState<ItemIntelligenceRecord[]>([]);
  const [summary, setSummary] = useState<ItemIntelligenceSummary>(EMPTY_SUMMARY);
  const [schema, setSchema] = useState<PassportGroup[]>([]);
  const [selected, setSelected] = useState<ItemCatalogEntry | null>(null);
  const [detail, setDetail] = useState<ItemIntelligenceRecord | null>(null);
  const [priceHistory, setPriceHistory] = useState<ItemPriceHistoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [modFilter, setModFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [bootstrapState, setBootstrapState] = useState<'idle'|'running'|'done'|'error'>('idle');
  const [bootstrapProcessed, setBootstrapProcessed] = useState(0);
  const [editGroup, setEditGroup] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceImportOpen, setPriceImportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        const [catalog, schemaResponse, atlasResponse] = await Promise.all([
          getItemCatalog(),
          getItemIntelligenceSchema(),
          getItemPanelAtlas().catch(() => null)
        ]);
        if (cancelled) return;
        const entries = catalog.entries || [];
        setItems(entries);
        setAtlas(atlasResponse);
        setSchema(schemaResponse.groups || []);
        setSelected(entries[0] || null);

        const [sum, list] = await Promise.all([getItemIntelligenceSummary(), listItemIntelligence()]);
        if (cancelled) return;
        setSummary(sum);
        setIntelItems(list.items || []);
        setLoading(false);
        setError(null);

        if (sum.items_total < entries.length && entries.length) {
          setBootstrapState('running');
          const serverId = window.localStorage.getItem('active_server_id') || 'default';
          const batchSize = 300;
          for (let start = 0; start < entries.length; start += batchSize) {
            if (cancelled) return;
            const batch = entries.slice(start, start + batchSize).map((entry) => ({
              key: entry.key, meta: entry.meta, legacy_id: entry.legacy_id, raw: entry.raw,
              display_ru: entry.display_ru, display_en: entry.display_en, icon_url: entry.icon_url,
              ore_groups: entry.ore_groups || [], sources: entry.sources || [], nbt_raw: entry.nbt_raw
            }));
            await bootstrapItemIntelligence(batch, serverId);
            if (cancelled) return;
            setBootstrapProcessed(Math.min(start + batch.length, entries.length));
            setSummary(await getItemIntelligenceSummary());
          }
          const finalList = await listItemIntelligence();
          if (!cancelled) {
            setIntelItems(finalList.items || []);
            setBootstrapState('done');
          }
        } else {
          setBootstrapState('done');
        }
      } catch (err) {
        if (!cancelled) {
          setBootstrapState('error');
          setLoading(false);
          setError(err instanceof Error ? err.message : 'Ошибка загрузки базы предметов');
        }
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const atlasIndex = useMemo(() => {
    const map = new Map<string, ItemPanelAtlasEntry>();
    Object.values(atlas?.entries ?? {}).forEach((entry) => map.set(`${entry.item_key}:${entry.meta ?? 0}`, entry));
    return map;
  }, [atlas]);

  const atlasStyle = (entry: ItemCatalogEntry, size: number): CSSProperties | undefined => {
    if (!atlas?.image_url) return undefined;
    const parsed = parseAtlasRaw(entry.raw || '') ?? { key: String(entry.key || '').toLowerCase(), meta: entry.meta || 0 };
    const atlasEntry = atlas.entries?.[entry.raw || ''] ?? atlasIndex.get(`${parsed.key}:${parsed.meta}`) ?? atlasIndex.get(`${parsed.key}:0`);
    if (!atlasEntry) return undefined;
    const scale = size / atlas.tile_size;
    return {
      width: size,
      height: size,
      backgroundImage: `url(${atlas.image_url})`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: `-${atlasEntry.x * scale}px -${atlasEntry.y * scale}px`,
      backgroundSize: `${atlas.columns * atlas.tile_size * scale}px ${atlas.rows * atlas.tile_size * scale}px`,
      imageRendering: 'pixelated'
    };
  };

  const itemVisual = (entry: ItemCatalogEntry, size: number) => {
    const style = atlasStyle(entry, size);
    if (style) return <span className="item-db-atlas-icon" style={style} aria-hidden="true" />;
    if (entry.icon_url) return <img src={entry.icon_url} alt="" className="item-db-icon" loading="lazy" />;
    return <span className="item-db-icon-missing">?</span>;
  };

  const intelByIdentity = useMemo(() => {
    const map = new Map<string, ItemIntelligenceRecord>();
    intelItems.forEach((entry) => map.set(identity(entry.registry_key, entry.meta), entry));
    return map;
  }, [intelItems]);

  const selectedIntel = selected ? intelByIdentity.get(identity(selected.key, selected.meta)) || null : null;

  useEffect(() => {
    let cancelled = false;
    setEditGroup(null);
    setDraft({});
    setPriceHistory([]);
    if (!selectedIntel?.id) {
      setDetail(null);
      return;
    }
    Promise.all([
      getItemIntelligenceItem(selectedIntel.id).catch(() => selectedIntel),
      getItemPriceHistory(selectedIntel.id, 100).catch(() => ({ item_id: selectedIntel.id, history: [] }))
    ]).then(([value, historyResponse]) => {
      if (cancelled) return;
      setDetail(value);
      setPriceHistory(historyResponse.history || []);
    });
    return () => { cancelled = true; };
  }, [selectedIntel?.id]);

  const mods = useMemo(() => Array.from(new Set(items.map(itemModId))).sort(), [items]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((entry) => {
      if (modFilter !== 'all' && itemModId(entry) !== modFilter) return false;
      return !needle || [entry.key, entry.display_ru, entry.display_en, entry.raw, entry.legacy_id, entry.meta, ...(entry.ore_groups || [])]
        .some((value) => String(value ?? '').toLowerCase().includes(needle));
    });
  }, [items, query, modFilter]);

  const groups = useMemo(() => [CORE_GROUP, ...schema], [schema]);

  const fieldValue = (groupKey: string, fieldKey: string): unknown => {
    if (groupKey === 'core') return (detail as Record<string, unknown> | null)?.[fieldKey];
    return detail?.passport?.[fieldKey];
  };

  const startEdit = (group: PassportGroup) => {
    const next: Record<string, string> = {};
    group.fields.forEach(([key]) => { next[key] = inputValue(fieldValue(group.key, key)); });
    setDraft(next);
    setEditGroup(group.key);
  };

  const saveGroup = async (group: PassportGroup) => {
    if (!detail?.id) return;
    const values: Record<string, unknown> = {};
    group.fields.forEach(([key, , type]) => { values[key] = parseValue(draft[key] ?? '', type); });
    setSaving(true);
    try {
      const payload = group.key === 'core' ? values : { passport: values };
      const updated = await updateItemIntelligence(detail.id, payload);
      const refreshed = await getItemIntelligenceItem(detail.id).catch(() => updated);
      setDetail(refreshed);
      setIntelItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setEditGroup(null);
      setDraft({});
      setSummary(await getItemIntelligenceSummary());
    } finally {
      setSaving(false);
    }
  };

  const refreshAfterPriceImport = async () => {
    const [sum, list] = await Promise.all([getItemIntelligenceSummary(), listItemIntelligence()]);
    setSummary(sum);
    setIntelItems(list.items || []);
    if (detail?.id) {
      const [refreshed, historyResponse] = await Promise.all([
        getItemIntelligenceItem(detail.id).catch(() => detail),
        getItemPriceHistory(detail.id, 100).catch(() => ({ item_id: detail.id, history: priceHistory }))
      ]);
      setDetail(refreshed);
      setPriceHistory(historyResponse.history || []);
    }
  };

  return (
    <section className="item-db-page" aria-label="База предметов">
      <header className="item-db-header">
        <div><div className="item-db-eyebrow">CubixWorld Item Intelligence</div><h1>База предметов</h1></div>
        <div className="item-db-header-actions">
          <button type="button" className="ghost-button" onClick={() => setPriceImportOpen(true)}>↑ Загрузить цены</button>
          <div className="item-db-counter">{filtered.length} / {items.length}</div>
        </div>
      </header>

      <div className="item-db-status-row compact">
        <span className="item-db-status-chip">DB: {summary.items_total ? 'online' : 'пустая/импорт'}</span>
        <span className="item-db-status-chip">Импорт: {bootstrapState}{bootstrapState === 'running' ? ` ${bootstrapProcessed}/${items.length}` : ''}</span>
        <span className="item-db-status-chip">Источники: {summary.sources_total}</span>
        <span className="item-db-status-chip">Evidence: {summary.evidence_total}</span>
        <span className="item-db-status-chip">Средняя готовность: {summary.average_completion}%</span>
      </div>

      <div className="item-db-toolbar">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск…" />
        <select value={modFilter} onChange={(e) => setModFilter(e.target.value)}><option value="all">Все моды</option>{mods.map((m) => <option key={m}>{m}</option>)}</select>
      </div>

      {error ? <div className="item-db-state item-db-error">{error}</div> : null}
      {loading ? <div className="item-db-state">Загрузка…</div> : (
        <div className="item-db-layout">
          <div className="item-db-list">
            {filtered.map((entry) => {
              const intel = intelByIdentity.get(identity(entry.key, entry.meta));
              const active = selected?.raw === entry.raw;
              return <button key={`${entry.raw}:${entry.meta}`} className={`item-db-row ${active ? 'active' : ''}`} onClick={() => setSelected(entry)}>
                <div className="item-db-icon-shell">{itemVisual(entry, 30)}</div>
                <div className="item-db-row-copy"><strong>{entry.display_ru || entry.display_en || entry.key}</strong><span>{entry.key}:{entry.meta} · {intel?.completion_percent ?? 0}%</span></div>
                <span className="item-db-mod">{itemModId(entry)}</span>
              </button>;
            })}
          </div>

          <aside className="item-db-detail passport-compact">
            {selected ? <>
              <div className="passport-head">
                <div className="item-db-icon-shell item-db-icon-large">{itemVisual(selected, 46)}</div>
                <div className="passport-title"><span>{itemModId(selected)}</span><h2>{selected.display_ru || selected.display_en || selected.key}</h2><small>{selected.key}:{selected.meta} · ID {selected.legacy_id ?? '—'} · Intelligence #{detail?.id ?? '—'}</small></div>
              </div>

              <div className="passport-techline">
                <span>Raw: <code>{selected.raw || '—'}</code></span><span>OreDict: {(selected.ore_groups || []).join(', ') || '—'}</span><span>NBT: {selected.has_nbt ? 'есть' : 'нет'}</span><span>Лок. источников: {sourceCount(selected)}</span>
              </div>

              <div className="passport-groups">
                {groups.map((group) => {
                  const editing = editGroup === group.key;
                  return <section className="passport-group" key={group.key}>
                    <header><strong>{group.label}</strong><div className="passport-group-actions">
                      {editing ? <><button className="passport-icon-btn save" disabled={saving} onClick={() => void saveGroup(group)}>✓</button><button className="passport-icon-btn" disabled={saving} onClick={() => { setEditGroup(null); setDraft({}); }}>×</button></> : <button className="passport-icon-btn" onClick={() => startEdit(group)} title="Редактировать">✎</button>}
                    </div></header>
                    <div className="passport-fields">
                      {group.fields.map(([key, label, type]) => <div className={`passport-field ${type === 'textarea' ? 'wide' : ''}`} key={key}>
                        <span>{label}</span>
                        {editing ? (type === 'textarea' ? <textarea value={draft[key] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} /> : <input type={type === 'number' ? 'number' : 'text'} value={draft[key] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />) : <strong title={displayValue(fieldValue(group.key, key))}>{displayValue(fieldValue(group.key, key))}</strong>}
                      </div>)}
                    </div>
                  </section>;
                })}
              </div>

              <details className="passport-price-history">
                <summary>История изменения цен <span>{priceHistory.length}</span></summary>
                {priceHistory.length ? <div className="passport-price-history-list">
                  {priceHistory.map((entry) => <div className={`passport-price-history-row ${entry.sale_restricted ? 'restricted' : ''}`} key={entry.id}>
                    <time>{entry.observed_at ? new Date(entry.observed_at).toLocaleString() : '—'}</time>
                    <strong>{priceHistoryLabel(entry)}</strong>
                    <small>{entry.source_name}</small>
                  </div>)}
                </div> : <div className="passport-price-history-empty">Изменений цены пока нет.</div>}
              </details>
            </> : <div className="item-db-state">Выберите предмет</div>}
          </aside>
        </div>
      )}
      {priceImportOpen ? <PriceImportDialog onClose={() => setPriceImportOpen(false)} onImported={refreshAfterPriceImport} /> : null}
    </section>
  );
}
