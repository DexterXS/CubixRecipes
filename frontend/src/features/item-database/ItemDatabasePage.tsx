import { useEffect, useMemo, useState } from 'react';
import { getItemCatalog } from '../../services/api';
import type { ItemCatalogEntry } from '../../types';

function itemModId(entry: ItemCatalogEntry): string {
  return String(entry.key || '').split(':', 1)[0] || 'unknown';
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
        setError(err instanceof Error ? err.message : 'Не удалось загрузить базу предметов');
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

  return (
    <section className="item-db-page" aria-label="База предметов">
      <header className="item-db-header">
        <div>
          <div className="item-db-eyebrow">CubixRecipes</div>
          <h1>База предметов</h1>
          <p>Просмотр предметов ItemPanel и индексированных данных сервера.</p>
        </div>
        <div className="item-db-counter">{filtered.length} / {items.length}</div>
      </header>

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

      {loading ? <div className="item-db-state">Загрузка базы…</div> : null}
      {error ? <div className="item-db-state item-db-error">{error}</div> : null}

      {!loading && !error ? (
        <div className="item-db-layout">
          <div className="item-db-list" role="list">
            {filtered.map((entry) => {
              const active = selected?.raw === entry.raw;
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
                    <span>{entry.key}{entry.meta ? `:${entry.meta}` : ''}</span>
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

                <dl className="item-db-facts">
                  <div><dt>Registry key</dt><dd>{selected.key}</dd></div>
                  <div><dt>Legacy ID</dt><dd>{selected.legacy_id ?? '—'}</dd></div>
                  <div><dt>Meta</dt><dd>{selected.meta}</dd></div>
                  <div><dt>Иконка</dt><dd>{selected.has_icon ? 'Есть' : 'Нет'}</dd></div>
                  <div><dt>NBT</dt><dd>{selected.has_nbt ? 'Есть' : 'Нет'}</dd></div>
                  <div><dt>Источники</dt><dd>{(selected.sources || []).join(', ') || '—'}</dd></div>
                  <div className="wide"><dt>OreDict</dt><dd>{(selected.ore_groups || []).join(', ') || '—'}</dd></div>
                  <div className="wide"><dt>Raw</dt><dd><code>{selected.raw || '—'}</code></dd></div>
                  {selected.nbt_raw ? <div className="wide"><dt>NBT Raw</dt><dd><pre>{selected.nbt_raw}</pre></dd></div> : null}
                </dl>

                <div className="item-db-future">
                  <strong>Индекс CubixWorld</strong>
                  <span>Частота использования, цена, ценность, tier, редкость и дополнительные параметры появятся здесь после заполнения Railway БД.</span>
                </div>
              </>
            ) : <div className="item-db-state">Выберите предмет</div>}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
