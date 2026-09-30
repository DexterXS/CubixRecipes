import { useEffect, useState, type DragEvent } from 'react';

import {
  FAST_ITEM_PANEL_LIMIT,
  getFastItemPanelPage,
  type FastItemPanelItem
} from '../../services/api/fastItemPanel';

import './FastItemPanel.css';

const SEARCH_DEBOUNCE_MS = 200;

export interface FastItemPanelProps {
  onPick: (raw: string) => void;
  onHover: (raw: string | null) => void;
  serverId?: string;
  className?: string;
}

function itemLabel(item: FastItemPanelItem): string {
  return item.display_name.trim() || item.raw;
}

function itemImageSource(item: FastItemPanelItem): string | null {
  return item.icon ? `data:${item.icon.mime};base64,${item.icon.data}` : null;
}

export function FastItemPanel({ onPick, onHover, serverId, className }: FastItemPanelProps) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [items, setItems] = useState<FastItemPanelItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPage(1);
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void getFastItemPanelPage({
      page,
      limit: FAST_ITEM_PANEL_LIMIT,
      q: debouncedQuery,
      serverId
    })
      .then((response) => {
        if (cancelled) return;
        setItems(response.items);
        setTotalPages(Math.max(
          1,
          response.total_pages ?? Math.ceil(response.total / FAST_ITEM_PANEL_LIMIT)
        ));
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setItems([]);
        setTotalPages(1);
        setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить предметы.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, page, serverId]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
  };

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, raw: string) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', raw);
  };

  const goToPage = (nextPage: number) => {
    setPage(Math.min(totalPages, Math.max(1, nextPage)));
  };

  return (
    <aside
      className={['fast-item-panel', className].filter(Boolean).join(' ')}
      aria-label="NEI предметы"
    >
      <header className="fast-item-panel__header">
        <h2>NEI предметы</h2>
        <p>Общая база изображений</p>
      </header>

      <label className="fast-item-panel__search">
        <span>Поиск предмета</span>
        <input
          type="search"
          aria-label="Поиск предмета"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="Поиск предмета"
        />
      </label>

      <div className="fast-item-panel__content" aria-live="polite">
        {loading ? <div className="fast-item-panel__status" role="status">Загрузка предметов…</div> : null}
        {!loading && error ? <div className="fast-item-panel__status fast-item-panel__status--error" role="alert">{error}</div> : null}
        {!loading && !error && items.length === 0 ? (
          <div className="fast-item-panel__status">Предметы не найдены.</div>
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <div className="fast-item-panel__grid" aria-label="NEI предметы">
            {items.map((item) => {
              const label = itemLabel(item);
              const imageSource = itemImageSource(item);
              return (
                <button
                  key={item.raw}
                  type="button"
                  className="fast-item-panel__item nei-item"
                  aria-label={`Выбрать ${label}`}
                  title={`${label}\n${item.raw}`}
                  data-item-raw={item.raw}
                  draggable
                  onClick={() => onPick(item.raw)}
                  onMouseEnter={() => onHover(item.raw)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(item.raw)}
                  onBlur={() => onHover(null)}
                  onDragStart={(event) => handleDragStart(event, item.raw)}
                >
                  <span className={`fast-item-panel__icon nei-icon ${imageSource ? '' : 'is-missing'}`.trim()}>
                    {imageSource ? <img src={imageSource} alt={label} draggable={false} /> : <span aria-hidden="true">?</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <nav className="fast-item-panel__pager" aria-label="Пагинация NEI предметов">
        <button
          type="button"
          className="fast-item-panel__pager-button"
          aria-label="Предыдущая страница"
          disabled={loading || query.trim() !== debouncedQuery || page <= 1}
          onClick={() => goToPage(page - 1)}
        >
          ‹
        </button>
        <strong aria-live="polite">{page}/{totalPages}</strong>
        <button
          type="button"
          className="fast-item-panel__pager-button"
          aria-label="Следующая страница"
          disabled={loading || query.trim() !== debouncedQuery || page >= totalPages}
          onClick={() => goToPage(page + 1)}
        >
          ›
        </button>
      </nav>
    </aside>
  );
}
