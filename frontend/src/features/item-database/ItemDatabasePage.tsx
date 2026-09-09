import { useEffect, useMemo, useState } from 'react';
import {
  getItemCatalog,
  getItemIntelligenceSummary,
  listItemIntelligence,
  type ItemIntelligenceRecord,
  type ItemIntelligenceSummary
} from '../../services/api';
import type { ItemCatalogEntry } from '../../types';

function itemModId(entry: ItemCatalogEntry): string {
  return String(entry.key || '').split(':', 1)[0] || 'unknown';
}

function sourceCount(entry: ItemCatalogEntry): number {
  return new Set(entry.sources || []).size;
}

function initialPassportPercent(entry: ItemCatalogEntry): number {
  let score = 0;
  if (entry.key) score += 15;
  if (entry.display_ru || entry.display_en) score += 15;
  if (entry.legacy_id != null) score += 10;
  if (entry.has_icon) score += 15;
  if (entry.raw) score += 10;
  if (entry.ore_groups?.length) score += 10;
  if (entry.has_nbt) score += 5;
  if (sourceCount(entry) > 0) score += 10;
  return Math.min(score, 60);
}

function identity(key: string, meta: number): string {
  return `${String(key || '').toLowerCase()}:${meta || 0}`;
}

const EMPTY_INTELLIGENCE_SUMMARY: ItemIntelligenceSummary = {
  items_total: 0,
  items_ready: 0,
  items_needs_review: 0,
  sources_total: 0,
  evidence_total: 0,
  mods_total: 0,
  average_completion: 0
};

export function ItemDatabasePage() {
  const [items, setItems] = useState<ItemCatalogEntry[]>([]);
  const [intelligenceItems, setIntelligenceItems] = useState<ItemIntelligenceRecord[]>([]);
  const [intelligenceSummary, setIntelligenceSummary] = useState<ItemIntelligenceSummary>(EMPTY_INTELLIGENCE_SUMMARY);
  const [intelligenceConnected, setIntelligenceConnected] = useState(false);
  const [query, setQuery] = useState('');
  const [modFilter, setModFilter] = useState('all');
  const [selected, setSelected] = useState<ItemCatalogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      getItemCatalog(),
      getItemIntelligenceSummary().catch(() => null),
      listItemIntelligence().catch(() => null)
    ])
      .then(([catalogResponse, summaryResponse, intelligenceResponse]) => {
        if (cancelled) return;
        const entries = catalogResponse.entries || [];
        setItems(entries);
        setSelected((current) => current || entries[0] || null);
        if (summaryResponse) {
          setIntelligenceSummary(summaryResponse);
          setIntelligenceConnected(true);
        }
        if (intelligenceResponse) {
          setIntelligenceItems(intelligenceResponse.items || []);
        }
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Не удалось загрузить предметы');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const intelligenceByIdentity = useMemo(() => {
    const map = new Map<string, ItemIntelligenceRecord>();
    intelligenceItems.forEach((entry) => map.set(identity(entry.registry_key, entry.meta), entry));
    return map;
  }, [intelligenceItems]);

  const mods = useMemo(() => {
    return Array.from(new Set(items.map(itemModId))).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const totalSources = useMemo(() => items.reduce((sum, entry) => sum + sourceCount(entry), 0), [items]);
  const withIcons = useMemo(() => items.filter((entry) => entry.has_icon).length, [items]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((entry) => {
      if (modFilter !== 'all' && itemModId(entry) !== modFilter) return false;
      if (!needle) return true;
      return [
        entry.key,
        entry.display_ru,
        entry.display_en,
        entry.raw,
        entry.legacy_id == null ? '' : String(entry.legacy_id),
        String(entry.meta),
        ...(entry.ore_groups || [])
      ].some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [items, query, modFilter]);

  const selectedIntelligence = selected
    ? intelligenceByIdentity.get(identity(selected.key, selected.meta)) || null
    : null;
  const selectedProgress = selectedIntelligence?.completion_percent ?? (selected ? initialPassportPercent(selected) : 0);
  const selectedStatus = selectedIntelligence?.status ?? 'not_imported';

  return (
    <section className="item-db-page" aria-label="База предметов">
      <header className="item-db-header">
        <div>
          <div className="item-db-eyebrow">CubixWorld Item Intelligence</div>
          <h1>База предметов</h1>
          <p>Публичный монитор отдельной Railway-БД паспортов предметов и процесса индексации.</p>
        </div>
        <div className="item-db-counter">{filtered.length} / {items.length}</div>
      </header>

      <div className="item-db-status-row">
        <span className="item-db-status-chip">Intelligence DB: {intelligenceConnected ? 'подключена' : 'нет соединения'}</span>
        <span className="item-db-status-chip">В БД: {intelligenceSummary.items_total}</span>
        <span className="item-db-status-chip">Готово: {intelligenceSummary.items_ready}</span>
        <span className="item-db-status-chip">На проверку: {intelligenceSummary.items_needs_review}</span>
      </div>

      <div className="item-db-progress-grid" aria-label="Прогресс индексации">
        <div className="item-db-progress-card"><span>Найдено исходных предметов</span><strong>{items.length}</strong></div>
        <div className="item-db-progress-card"><span>Записано в Intelligence DB</span><strong>{intelligenceSummary.items_total}</strong></div>
        <div className="item-db-progress-card"><span>Источников в Intelligence DB</span><strong>{intelligenceSummary.sources_total}</strong></div>
        <div className="item-db-progress-card"><span>Evidence-записей</span><strong>{intelligenceSummary.evidence_total}</strong></div>
        <div className="item-db-progress-card"><span>Модов в исходном каталоге</span><strong>{mods.length}</strong></div>
        <div className="item-db-progress-card"><span>Иконки найдены</span><strong>{withIcons}</strong></div>
        <div className="item-db-progress-card"><span>Модов в Intelligence DB</span><strong>{intelligenceSummary.mods_total}</strong></div>
        <div className="item-db-progress-card"><span>Средняя готовность паспорта</span><strong>{intelligenceSummary.average_completion}%</strong></div>
      </div>

      <div className="item-db-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по названию, ID, raw, OreDict…"
          aria-label="Поиск предметов"
        />
        <select value={modFilter} onChange={(event) => setModFilter(event.target.value)} aria-label="Фильтр по моду">
          <option value="all">Все моды</option>
          {mods.map((mod) => <option key={mod} value={mod}>{mod}</option>)}
        </select>
      </div>

      {loading ? <div className="item-db-state">Загрузка каталога…</div> : null}
      {error ? <div className="item-db-state item-db-error">{error}</div> : null}

      {!loading && !error ? (
        <div className="item-db-layout">
          <div className="item-db-list" role="list">
            {filtered.map((entry) => {
              const active = selected?.raw === entry.raw;
              const intelligence = intelligenceByIdentity.get(identity(entry.key, entry.meta));
              const progress = intelligence?.completion_percent ?? initialPassportPercent(entry);
              const status = intelligence?.status ?? 'not_imported';
              return (
                <button
                  type="button"
                  role="listitem"
                  key={`${entry.raw || entry.key}:${entry.meta}`}
                  className={`item-db-row ${active ? 'active' : ''}`}
                  onClick={() => setSelected(entry)}
                >
                  <div className="item-db-icon-shell">
                    {entry.icon_url ? <img src={entry.icon_url} alt="" className="item-db-icon" loading="lazy" /> : <span>?</span>}
                  </div>
                  <div className="item-db-row-copy">
                    <strong>{entry.display_ru || entry.display_en || entry.key}</strong>
                    <span>{entry.key}{entry.meta ? `:${entry.meta}` : ''} · {status} · паспорт {progress}%</span>
                  </div>
                  <span className="item-db-mod">{itemModId(entry)}</span>
                </button>
              );
            })}
            {filtered.length === 0 ? <div className="item-db-state">Ничего не найдено</div> : null}
          </div>

          <aside className="item-db-detail">
            {selected ? (
              <>
                <div className="item-db-detail-top">
                  <div className="item-db-icon-shell item-db-icon-large">
                    {selected.icon_url ? <img src={selected.icon_url} alt="" className="item-db-icon" /> : <span>?</span>}
                  </div>
                  <div>
                    <div className="item-db-eyebrow">{itemModId(selected)}</div>
                    <h2>{selected.display_ru || selected.display_en || selected.key}</h2>
                    {selected.display_en && selected.display_en !== selected.display_ru ? <p>{selected.display_en}</p> : null}
                  </div>
                </div>

                <div className="item-db-status-row">
                  <span className="item-db-status-chip">Статус: {selectedStatus}</span>
                  <span className="item-db-status-chip">Паспорт: {selectedProgress}%</span>
                  <span className="item-db-status-chip">Локальных источников: {sourceCount(selected)}</span>
                  <span className="item-db-status-chip">Intelligence ID: {selectedIntelligence?.id ?? 'ещё не импортирован'}</span>
                </div>

                <dl className="item-db-facts">
                  <div><dt>Registry key</dt><dd>{selected.key}</dd></div>
                  <div><dt>Legacy ID</dt><dd>{selected.legacy_id ?? '—'}</dd></div>
                  <div><dt>Meta</dt><dd>{selected.meta}</dd></div>
                  <div><dt>Иконка</dt><dd>{selected.has_icon ? 'Есть' : 'Нет'}</dd></div>
                  <div><dt>NBT</dt><dd>{selected.has_nbt ? 'Есть' : 'Нет'}</dd></div>
                  <div><dt>Текущие локальные источники</dt><dd>{(selected.sources || []).join(', ') || '—'}</dd></div>
                  <div className="wide"><dt>OreDict</dt><dd>{(selected.ore_groups || []).join(', ') || '—'}</dd></div>
                  <div className="wide"><dt>Raw</dt><dd><code>{selected.raw || '—'}</code></dd></div>
                  {selectedIntelligence?.category ? <div><dt>Категория</dt><dd>{selectedIntelligence.category}</dd></div> : null}
                  {selectedIntelligence?.tier ? <div><dt>Tier</dt><dd>{selectedIntelligence.tier}</dd></div> : null}
                  {selectedIntelligence?.rarity ? <div><dt>Редкость</dt><dd>{selectedIntelligence.rarity}</dd></div> : null}
                  {selectedIntelligence?.confidence != null ? <div><dt>Confidence</dt><dd>{selectedIntelligence.confidence}</dd></div> : null}
                  {selectedIntelligence?.indexed_at ? <div className="wide"><dt>Последняя индексация</dt><dd>{selectedIntelligence.indexed_at}</dd></div> : null}
                  {selected.nbt_raw ? <div className="wide"><dt>NBT Raw</dt><dd><pre>{selected.nbt_raw}</pre></dd></div> : null}
                </dl>

                <div className="item-db-future">
                  <strong>Полный паспорт</strong>
                  <span>Рецепты получения и использования, частота в крафтах, способы добычи, цены и история цен, ценность, tier/progression, редкость, теги, конфиги, зависимости, внешние источники, confidence, конфликты источников и дата последней проверки будут заполняться в отдельной Intelligence DB.</span>
                </div>
              </>
            ) : <div className="item-db-state">Выберите предмет</div>}
          </aside>
        </div>
      ) : null}

      {!loading && !error ? <div className="item-db-state">Локальных связей с источниками: {totalSources}. Отдельная Intelligence DB содержит {intelligenceSummary.sources_total} источников и {intelligenceSummary.evidence_total} evidence-записей.</div> : null}
    </section>
  );
}
