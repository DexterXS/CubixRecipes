import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { formatDurationCompact } from './auctionDayFolders';
import { writeAuctionLotDrag } from './auctionDragDrop';
import { buildAuctionLotLibraryEntries, filterAuctionLotLibraryEntries } from './auctionLotLibrary';
import type { AuctionCurrency, AuctionDayFolder, AuctionDraft, AuctionLotLibraryRecord, AuctionRenderItemIcon } from './auctionTypes';
import './AuctionLotLibraryPanel.css';

const pageSize = 64;

const currencyColors: Record<AuctionCurrency, string> = {
  DONATE: '#55d483',
  VAULT: '#ffb454',
  BONUS: '#a879ff'
};

type AuctionLotLibraryPanelProps = {
  folders: AuctionDayFolder[];
  records: AuctionLotLibraryRecord[];
  renderItemIcon: AuctionRenderItemIcon;
  onCreateLot: () => void;
  onOpenAuction: (recordId: string, refs: { folderId: string; auctionId: string }[]) => void;
};

function serverIdsLabel(auction: AuctionDraft) {
  const ids = Object.values(auction.serverIds).map((value) => value.trim()).filter(Boolean);
  return ids.length ? ids.join(', ') : 'нет';
}

function priceLabel(auction: AuctionDraft) {
  return `${auction.baseStartPrice} / ${auction.baseStepPrice} ${auction.currency}`;
}

function attachmentLabel(refs: { folderTitle: string; dateLocal: string }[]) {
  if (!refs.length) return 'Не привязан к дате';
  if (refs.length === 1) return `${refs[0].folderTitle} · ${refs[0].dateLocal}`;
  return `${refs.length} папок`;
}

export function AuctionLotLibraryPanel({ folders, records, renderItemIcon, onCreateLot, onOpenAuction }: AuctionLotLibraryPanelProps) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const entries = useMemo(() => buildAuctionLotLibraryEntries(records, folders), [records, folders]);
  const filteredEntries = useMemo(() => filterAuctionLotLibraryEntries(entries, query), [entries, query]);
  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const pageEntries = filteredEntries.slice(page * pageSize, page * pageSize + pageSize);
  const slots = Array.from({ length: pageSize }, (_, index) => pageEntries[index]);

  useEffect(() => {
    setPage(0);
  }, [query, entries.length]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  return (
    <aside className={`auction-lot-library-panel ${open ? 'open' : 'collapsed'}`} aria-label="auction-lot-library">
      <div className="auction-lot-library-head">
        <div>
          <strong>База лотов</strong>
          <span>{filteredEntries.length} уник.</span>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)}>
          {open ? 'Свернуть' : 'Открыть базу'}
        </button>
      </div>
      {open ? (
        <>
          <div className="auction-lot-library-actions">
            <input
              className="auction-lot-library-search"
              value={query}
              placeholder="Поиск"
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="button" onClick={onCreateLot}>+ Лот</button>
          </div>
          <div className="auction-lot-library-grid">
            {slots.map((entry, index) => {
              if (!entry) {
                return <span key={`empty-${index}`} className="auction-lot-library-slot empty" />;
              }
              const { record, refs } = entry;
              const auction = record.auction;
              const mainItem = auction.items[0];
              const style = { '--lot-currency': currencyColors[auction.currency] } as CSSProperties;
              return (
                <button
                  key={record.id}
                  type="button"
                  className={`auction-lot-library-slot filled ${refs.length ? '' : 'detached'}`.trim()}
                  style={style}
                  draggable
                  onClick={() => onOpenAuction(record.id, refs)}
                  onDragStart={(event) => writeAuctionLotDrag(event.dataTransfer, { lotId: record.id })}
                >
                  <span className="auction-lot-library-icon">
                    {mainItem ? renderItemIcon(mainItem) : <b>{auction.name.slice(0, 1) || '#'}</b>}
                  </span>
                  <small>{auction.currency.slice(0, 1)}</small>
                  <span className="auction-lot-library-tooltip">
                    <strong>{auction.name || auction.id}</strong>
                    <em>{attachmentLabel(refs)}</em>
                    <dl>
                      <div><dt>Описание</dt><dd>{auction.description.trim() || 'нет'}</dd></div>
                      <div><dt>Длительность</dt><dd>{formatDurationCompact(auction.durationMinutes)}</dd></div>
                      <div><dt>Цена</dt><dd>{priceLabel(auction)}</dd></div>
                      <div><dt>Статус</dt><dd>{auction.state}</dd></div>
                      <div><dt>ID сервера</dt><dd>{serverIdsLabel(auction)}</dd></div>
                      <div><dt>Предметов</dt><dd>{auction.items.length}</dd></div>
                      <div><dt>addItem</dt><dd>{auction.addItemsToAuction ? 'да' : 'нет'}</dd></div>
                    </dl>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="auction-lot-library-pages">
            <button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>‹</button>
            <span>{page + 1}/{pageCount}</span>
            <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>›</button>
          </div>
        </>
      ) : null}
    </aside>
  );
}
