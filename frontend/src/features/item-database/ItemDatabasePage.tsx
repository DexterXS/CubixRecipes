import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import {
  bootstrapItemIntelligenceFromProduction,
  getBasicEnrichmentStatus,
  getItemIntelligenceEvidence,
  getItemIntelligenceMetrics,
  getItemIntelligenceMods,
  getItemIntelligencePassport,
  getItemIntelligenceSchema,
  getItemIntelligenceSummary,
  getItemPanelAtlas,
  getItemPriceHistory,
  runBasicEnrichmentBatch,
  searchItemIntelligence,
  startBasicEnrichment,
  updateItemIntelligence,
  type BasicEnrichmentRun,
  type ItemIntelligenceMod,
  type ItemIntelligenceRecord,
  type ItemIntelligenceSummary,
  type ItemPriceHistoryEntry,
  type PassportField,
  type PassportGroup
} from '../../services/api';
import type { ItemPanelAtlas, ItemPanelAtlasEntry } from '../../types';
import { PriceImportDialog } from './PriceImportDialog';
import './ItemDatabasePage.css';

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
const PAGE_SIZE = 250;

const CORE_GROUP: PassportGroup = {
  key: 'core', label: 'Основные данные', fields: [
    ['display_ru', 'Название RU', 'text'], ['display_en', 'Название EN', 'text'],
    ['description', 'Основное описание', 'textarea'], ['category', 'Категория', 'text'],
    ['tier', 'Tier', 'text'], ['rarity', 'Редкость', 'text'], ['status', 'Статус', 'text'],
    ['completion_percent', 'Готовность паспорта, %', 'number'], ['confidence', 'Общий confidence', 'number']
  ]
};

type Connector = 'passport' | 'prices' | 'evidence' | 'metrics';

export function ItemDatabasePage() {
  const [items, setItems] = useState<ItemIntelligenceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [mods, setMods] = useState<ItemIntelligenceMod[]>([]);
  const [atlas, setAtlas] = useState<ItemPanelAtlas | null>(null);
  const [summary, setSummary] = useState<ItemIntelligenceSummary>(EMPTY_SUMMARY);
  const [schema, setSchema] = useState<PassportGroup[]>([]);
  const [selected, setSelected] = useState<ItemIntelligenceRecord | null>(null);
  const [detail, setDetail] = useState<ItemIntelligenceRecord | null>(null);
  const [priceHistory, setPriceHistory] = useState<ItemPriceHistoryEntry[]>([]);
  const [evidence, setEvidence] = useState<unknown[]>([]);
  const [metrics, setMetrics] = useState<unknown[]>([]);
  const [connector, setConnector] = useState<Connector>('passport');
  const [query, setQuery] = useState('');
  const [modFilter, setModFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editGroup, setEditGroup] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceImportOpen, setPriceImportOpen] = useState(false);
  const [basicRun, setBasicRun] = useState<BasicEnrichmentRun | null>(null);
  const [basicRunning, setBasicRunning] = useState(false);

  const loadIndex = async (offset = 0, append = false) => {
    const response = await searchItemIntelligence({ q: query.trim(), modId: modFilter, limit: PAGE_SIZE, offset });
    setItems((current) => append ? [...current, ...(response.items || [])] : (response.items || []));
    setTotal(response.total || 0);
    setHasMore(Boolean(response.has_more));
    if (!append && !selected && response.items?.length) setSelected(response.items[0]);
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        const [sum, schemaResponse, atlasResponse, stageA] = await Promise.all([
          getItemIntelligenceSummary(),
          getItemIntelligenceSchema(),
          getItemPanelAtlas().catch(() => null),
          getBasicEnrichmentStatus().catch(() => null)
        ]);
        if (cancelled) return;
        let currentSummary = sum;
        if (!sum.items_total) {
          await bootstrapItemIntelligenceFromProduction();
          currentSummary = await getItemIntelligenceSummary();
        }
        const [indexResponse, modResponse] = await Promise.all([
          searchItemIntelligence({ limit: PAGE_SIZE, offset: 0 }),
          getItemIntelligenceMods()
        ]);
        if (cancelled) return;
        setSummary(currentSummary);
        setBasicRun(stageA);
        setSchema(schemaResponse.groups || []);
        setAtlas(atlasResponse);
        setItems(indexResponse.items || []);
        setTotal(indexResponse.total || 0);
        setHasMore(Boolean(indexResponse.has_more));
        setMods(modResponse.mods || []);
        setSelected(indexResponse.items?.[0] || null);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Ошибка загрузки базы предметов');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      setSelected(null);
      setDetail(null);
      setPriceHistory([]);
      setEvidence([]);
      setMetrics([]);
      void loadIndex(0, false).catch((err) => setError(err instanceof Error ? err.message : 'Ошибка поиска'));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, modFilter]);

  const atlasIndex = useMemo(() => {
    const map = new Map<string, ItemPanelAtlasEntry>();
    Object.values(atlas?.entries ?? {}).forEach((entry) => map.set(`${String(entry.item_key || '').toLowerCase()}:${entry.meta ?? 0}`, entry));
    return map;
  }, [atlas]);

  const atlasStyle = (entry: ItemIntelligenceRecord, size: number): CSSProperties | undefined => {
    if (!atlas?.image_url) return undefined;
    const atlasEntry = atlasIndex.get(`${entry.registry_key.toLowerCase()}:${entry.meta ?? 0}`) ?? atlasIndex.get(`${entry.registry_key.toLowerCase()}:0`);
    if (!atlasEntry) return undefined;
    const scale = size / atlas.tile_size;
    return {
      width: size, height: size,
      backgroundImage: `url(${atlas.image_url})`, backgroundRepeat: 'no-repeat',
      backgroundPosition: `-${atlasEntry.x * scale}px -${atlasEntry.y * scale}px`,
      backgroundSize: `${atlas.columns * atlas.tile_size * scale}px ${atlas.rows * atlas.tile_size * scale}px`,
      imageRendering: 'pixelated'
    };
  };

  const itemVisual = (entry: ItemIntelligenceRecord, size: number) => {
    const style = atlasStyle(entry, size);
    if (style) return <span className="item-db-atlas-icon" style={style} aria-hidden="true" />;
    if (entry.icon_url) return <img src={entry.icon_url} alt="" className="item-db-icon" loading="lazy" />;
    return <span className="item-db-icon-missing">?</span>;
  };

  useEffect(() => {
    let cancelled = false;
    setEditGroup(null); setDraft({}); setPriceHistory([]); setEvidence([]); setMetrics([]); setConnector('passport');
    if (!selected?.id) { setDetail(null); return; }
    setDetailLoading(true);
    getItemIntelligencePassport(selected.id)
      .then((value) => { if (!cancelled) setDetail(value); })
      .catch(() => { if (!cancelled) setDetail(selected); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.id]);

  const openConnector = async (next: Connector) => {
    if (!selected?.id) return;
    setConnector(next);
    if (next === 'prices' && !priceHistory.length) {
      const response = await getItemPriceHistory(selected.id, 100).catch(() => ({ item_id: selected.id, history: [] }));
      setPriceHistory(response.history || []);
    } else if (next === 'evidence' && !evidence.length) {
      const response = await getItemIntelligenceEvidence(selected.id, 100, 0).catch(() => ({ items: [], total: 0, limit: 100, offset: 0, has_more: false }));
      setEvidence(response.items || []);
    } else if (next === 'metrics' && !metrics.length) {
      const response = await getItemIntelligenceMetrics(selected.id).catch(() => ({ metrics: [] }));
      setMetrics(response.metrics || []);
    }
  };

  const runStageA = async () => {
    if (basicRunning) return;
    setBasicRunning(true);
    setError(null);
    try {
      let run = await startBasicEnrichment('production', false);
      setBasicRun(run);
      while (run.status === 'running') {
        run = await runBasicEnrichmentBatch('production', 500);
        setBasicRun(run);
        if (run.processed_items % 2500 === 0 || run.status === 'completed') {
          setSummary(await getItemIntelligenceSummary());
        }
      }
      await loadIndex(0, false);
      if (selected?.id) setDetail(await getItemIntelligencePassport(selected.id).catch(() => detail));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка Stage A');
    } finally {
      setBasicRunning(false);
    }
  };

  const groups = useMemo(() => [CORE_GROUP, ...schema], [schema]);
  const fieldValue = (groupKey: string, fieldKey: string): unknown => {
    if (groupKey === 'core') return (detail as Record<string, unknown> | null)?.[fieldKey];
    return detail?.passport?.[fieldKey];
  };
  const startEdit = (group: PassportGroup) => {
    const next: Record<string, string> = {};
    group.fields.forEach(([key]) => { next[key] = inputValue(fieldValue(group.key, key)); });
    setDraft(next); setEditGroup(group.key);
  };
  const saveGroup = async (group: PassportGroup) => {
    if (!detail?.id) return;
    const values: Record<string, unknown> = {};
    group.fields.forEach(([key, , type]) => { values[key] = parseValue(draft[key] ?? '', type); });
    setSaving(true);
    try {
      const updated = await updateItemIntelligence(detail.id, group.key === 'core' ? values : { passport: values });
      const refreshed = await getItemIntelligencePassport(detail.id).catch(() => updated);
      setDetail(refreshed);
      setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setEditGroup(null); setDraft({});
      setSummary(await getItemIntelligenceSummary());
    } finally { setSaving(false); }
  };

  const refreshAfterPriceImport = async () => {
    setSummary(await getItemIntelligenceSummary());
    await loadIndex(0, false);
    if (selected?.id) {
      setDetail(await getItemIntelligencePassport(selected.id).catch(() => detail));
      if (connector === 'prices') {
        const historyResponse = await getItemPriceHistory(selected.id, 100).catch(() => ({ item_id: selected.id, history: priceHistory }));
        setPriceHistory(historyResponse.history || []);
      }
    }
  };

  return <section className="item-db-page" aria-label="База предметов">
    <header className="item-db-header">
      <div><div className="item-db-eyebrow">CubixWorld Item Intelligence</div><h1>База предметов</h1></div>
      <div className="item-db-header-actions">
        <button type="button" className="ghost-button" disabled={basicRunning} onClick={() => void runStageA()}>{basicRunning ? 'Stage A…' : basicRun?.status === 'completed' ? '↻ Stage A' : '▶ Stage A'}</button>
        <button type="button" className="ghost-button" onClick={() => setPriceImportOpen(true)}>↑ Загрузить цены</button>
        <div className="item-db-counter">{items.length} / {total}</div>
      </div>
    </header>

    <div className="item-db-status-row compact">
      <span className="item-db-status-chip">DB: {summary.items_total ? 'online' : 'пустая'}</span>
      <span className="item-db-status-chip">В базе: {summary.items_total}</span>
      <span className="item-db-status-chip">Источники: {summary.sources_total}</span>
      <span className="item-db-status-chip">Evidence: {summary.evidence_total}</span>
      <span className="item-db-status-chip">Средняя готовность: {summary.average_completion}%</span>
      <span className="item-db-status-chip">Stage A: {basicRun?.status ?? 'not_started'} {basicRun?.total_items ? `${basicRun.processed_items}/${basicRun.total_items} · ${basicRun.progress_percent}%` : ''}</span>
      <span className="item-db-status-chip">Lazy API: ON</span>
    </div>

    <div className="item-db-toolbar">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по серверу…" />
      <select value={modFilter} onChange={(e) => setModFilter(e.target.value)}><option value="all">Все моды</option>{mods.map((m) => <option key={m.mod_id} value={m.mod_id}>{m.mod_id} ({m.count})</option>)}</select>
    </div>

    {error ? <div className="item-db-state item-db-error">{error}</div> : null}
    {loading ? <div className="item-db-state">Загрузка лёгкого индекса…</div> : <div className="item-db-layout">
      <div className="item-db-list">
        {items.map((entry) => <button key={entry.id} className={`item-db-row ${selected?.id === entry.id ? 'active' : ''}`} onClick={() => setSelected(entry)}>
          <div className="item-db-icon-shell">{itemVisual(entry, 30)}</div>
          <div className="item-db-row-copy"><strong>{entry.display_ru || entry.display_en || entry.registry_key}</strong><span>{entry.registry_key}:{entry.meta} · {entry.completion_percent ?? 0}%</span></div>
          <span className="item-db-mod">{entry.mod_id || 'unknown'}</span>
        </button>)}
        {hasMore ? <button className="ghost-button" disabled={loadingMore} onClick={async () => { setLoadingMore(true); try { await loadIndex(items.length, true); } finally { setLoadingMore(false); } }}>{loadingMore ? 'Загрузка…' : `Показать ещё (${items.length}/${total})`}</button> : null}
      </div>

      <aside className="item-db-detail passport-compact">
        {selected ? <>
          <div className="passport-head"><div className="item-db-icon-shell item-db-icon-large">{itemVisual(selected, 46)}</div><div className="passport-title"><span>{selected.mod_id || 'unknown'}</span><h2>{selected.display_ru || selected.display_en || selected.registry_key}</h2><small>{selected.registry_key}:{selected.meta} · Intelligence #{selected.id}</small></div></div>
          <div className="passport-techline"><span>Статус: {selected.status}</span><span>Готовность: {selected.completion_percent}%</span><span>Детали загружаются только по клику</span></div>

          <div className="item-db-status-row compact">
            <button className={`item-db-status-chip ${connector === 'passport' ? 'active' : ''}`} onClick={() => void openConnector('passport')}>Паспорт</button>
            <button className={`item-db-status-chip ${connector === 'prices' ? 'active' : ''}`} onClick={() => void openConnector('prices')}>История цен</button>
            <button className={`item-db-status-chip ${connector === 'evidence' ? 'active' : ''}`} onClick={() => void openConnector('evidence')}>Источники / Evidence</button>
            <button className={`item-db-status-chip ${connector === 'metrics' ? 'active' : ''}`} onClick={() => void openConnector('metrics')}>Метрики</button>
          </div>

          {detailLoading ? <div className="item-db-state">Загрузка паспорта…</div> : null}
          {connector === 'passport' && !detailLoading ? <div className="passport-groups">{groups.map((group) => {
            const editing = editGroup === group.key;
            return <section className="passport-group" key={group.key}><header><strong>{group.label}</strong><div className="passport-group-actions">{editing ? <><button className="passport-icon-btn save" disabled={saving} onClick={() => void saveGroup(group)}>✓</button><button className="passport-icon-btn" disabled={saving} onClick={() => { setEditGroup(null); setDraft({}); }}>×</button></> : <button className="passport-icon-btn" onClick={() => startEdit(group)} title="Редактировать">✎</button>}</div></header><div className="passport-fields">{group.fields.map(([key, label, type]) => <div className={`passport-field ${type === 'textarea' ? 'wide' : ''}`} key={key}><span>{label}</span>{editing ? (type === 'textarea' ? <textarea value={draft[key] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} /> : <input type={type === 'number' ? 'number' : 'text'} value={draft[key] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />) : <strong title={displayValue(fieldValue(group.key, key))}>{displayValue(fieldValue(group.key, key))}</strong>}</div>)}</div></section>;
          })}</div> : null}

          {connector === 'prices' ? <section className="passport-group"><header><strong>История изменения цен</strong></header><div className="item-price-history">{priceHistory.length ? priceHistory.map((entry) => <div key={entry.id}><strong>{priceHistoryLabel(entry)}</strong><small>{entry.source_name}</small><time>{entry.observed_at ? new Date(entry.observed_at).toLocaleString() : '—'}</time></div>) : <div className="item-db-state">Истории пока нет</div>}</div></section> : null}
          {connector === 'evidence' ? <section className="passport-group"><header><strong>Источники / Evidence</strong></header><pre className="passport-lazy-json">{JSON.stringify(evidence, null, 2)}</pre></section> : null}
          {connector === 'metrics' ? <section className="passport-group"><header><strong>Метрики</strong></header><pre className="passport-lazy-json">{JSON.stringify(metrics, null, 2)}</pre></section> : null}
        </> : <div className="item-db-state">Выберите предмет</div>}
      </aside>
    </div>}
    {priceImportOpen ? <PriceImportDialog onClose={() => setPriceImportOpen(false)} onImported={refreshAfterPriceImport} /> : null}
  </section>;
}
