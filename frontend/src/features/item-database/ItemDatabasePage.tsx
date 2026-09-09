import { useEffect, useMemo, useState } from 'react';
import { getItemCatalog } from '../../services/api';
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

export function ItemDatabasePage() {
  const [items, setItems] = useState<ItemCatalogEntry[]>([]);
  const [query, setQuery] = useState('');
  const [modFilter, setModFilter] = useState('all');
  const [selected, setSelected] = useState<ItemCatalogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getItemCatalog()
      .then((response) => {
        if (cancelled) return;
        const entries = response.entries || [];
        setItems(entries);
        setSelected((current) => current || entries[0] || null);
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

  const mods = useMemo(() => {
    return Array.from(new Set(items.map(itemModId))).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const totalSources = useMemo(() => items.reduce((sum, entry) => sum + sourceCount(entry), 0), [items]);
  const withIcons = useMemo(() => items.filter((entry) => entry.has_icon).length, [items]);
  const initialProgress = useMemo(() => {
    if (!items.length) return 0;
    return Math.round(items.reduce((sum, entry) => sum + initialPassportPercent(entry), 0) / items.length);
  }, [items]);

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

  const selectedProgress = selected ? initialPassportPercent(selected) : 0;

  return (
    <section className="item-db-page" aria-label="База предметов">
      <header className="item-db-header">
        <div>
          <div className="item-db-eyebrow">CubixWorld Item Intelligence</div>
          <h1>База предметов</h1>
          <p>Отдельный каталог паспортов предметов. Сейчас идёт первичное наполнение перед подключением полной Railway-БД.</p>
        </div>
        <div className="item-db-counter">{filtered.length} / {items.length}</div>
      </header>

      <div className="item-db-progress-grid" aria-label="Прогресс индексации">
        <div className="item-db-progress-card"><span>Найдено предметов</span><strong>{items.length}</strong></div>
        <div className="item-db-progress-card"><span>Модов в каталоге</span><strong>{mods.length}</strong></div>
        <div className="item-db-progress-card"><span>Иконки найдены</span><strong>{withIcons}</strong></div>
        <div className="item-db-progress-card"><span>Первичная заполненность</span><strong>{initialProgress}%</strong></div>
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
              const progress = initialPassportPercent(entry);
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
                    <span>{entry.key}{entry.meta ? `:${entry.meta}` : ''} · паспорт {progress}%</span>
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
                  <span className="item-db-status-chip">Статус: первичный импорт</span>
                  <span className="item-db-status-chip">Паспорт: {selectedProgress}%</span>
                  <span className="item-db-status-chip">Источников сейчас: {sourceCount(selected)}</span>
                </div>

                <dl className="item-db-facts">
                  <div><dt>Registry key</dt><dd>{selected.key}</dd></div>
                  <div><dt>Legacy ID</dt><dd>{selected.legacy_id ?? '—'}</dd></div>
                  <div><dt>Meta</dt><dd>{selected.meta}</dd></div>
                  <div><dt>Иконка</dt><dd>{selected.has_icon ? 'Есть' : 'Нет'}</dd></div>
                  <div><dt>NBT</dt><dd>{selected.has_nbt ? 'Есть' : 'Нет'}</dd></div>
                  <div><dt>Текущие источники</dt><dd>{(selected.sources || []).join(', ') || '—'}</dd></div>
                  <div className="wide"><dt>OreDict</dt><dd>{(selected.ore_groups || []).join(', ') || '—'}</dd></div>
                  <div className="wide"><dt>Raw</dt><dd><code>{selected.raw || '—'}</code></dd></div>
                  {selected.nbt_raw ? <div className="wide"><dt>NBT Raw</dt><dd><pre>{selected.nbt_raw}</pre></dd></div> : null}
                </dl>

                <div className="item-db-future">
                  <strong>Что будет добавляться в паспорт</strong>
                  <span>Рецепты получения и использования, частота в крафтах, способы добычи, цены и история цен, ценность, tier/progression, редкость, теги, конфиги, зависимости, внешние источники, confidence, конфликты источников и дата последней проверки.</span>
                </div>
                <div className="item-db-future">
                  <strong>Прогресс источников</strong>
                  <span>Сейчас видны только уже доступные локальные источники. Следующий этап — отдельная Railway-БД и добавление результатов анализа рецептов, конфигов, модов и открытого интернета.</span>
                </div>
              </>
            ) : <div className="item-db-state">Выберите предмет</div>}
          </aside>
        </div>
      ) : null}

      {!loading && !error ? <div className="item-db-state">Всего зафиксировано локальных связей с источниками: {totalSources}. Эта цифра будет расти по мере индексации.</div> : null}
    </section>
  );
}
