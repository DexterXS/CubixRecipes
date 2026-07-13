import { getAuctionBaseItemPrice } from './auctionCommands';
import type { AuctionDayFolder } from './auctionTypes';

type AuctionPriceModePanelProps = {
  folder: AuctionDayFolder;
  onPriceModeChange: (mode: AuctionDayFolder['priceMode']) => void;
};

export function AuctionPriceModePanel({ folder, onPriceModeChange }: AuctionPriceModePanelProps) {
  const isPlanned = folder.category === 'planned';

  return (
    <section className="auction-day-details-section">
      <h3>Цены</h3>
      <div className="auction-day-segmented">
        <button type="button" className={folder.priceMode === 'graph' ? 'active' : ''} disabled={isPlanned} onClick={() => onPriceModeChange('graph')}>По графику</button>
        <button type="button" className={folder.priceMode === 'manual' ? 'active' : ''} onClick={() => onPriceModeChange('manual')}>Вручную</button>
      </div>
      {isPlanned ? (
        <div className="inline-hint">Планируемые фиолетовые папки используют фиксированные цены и не зависят от глобального графика.</div>
      ) : folder.priceMode === 'graph' ? (
        <div className="inline-hint">График управляется в отдельной вкладке «Графики». Здесь показано только правило применения к папке.</div>
      ) : (
        <div className="auction-day-items-table">
          <div><span>Лот</span><span>Предметов</span><span>Цена лота</span></div>
          {folder.auctions.slice(0, 5).map((auction) => (
            <div key={auction.id}>
              <span>{auction.name}</span>
              <span>{auction.items.length}</span>
              <span>{getAuctionBaseItemPrice(auction)}</span>
            </div>
          ))}
          {!folder.auctions.length ? <p>Лоты ещё не добавлены.</p> : null}
        </div>
      )}
    </section>
  );
}
