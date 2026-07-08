import type { AuctionDayFolder } from './auctionTypes';

type AuctionPriceModePanelProps = {
  folder: AuctionDayFolder;
  items: Array<{ uid: string; title: string; quantity: number; basePrice: number }>;
  onPriceModeChange: (mode: AuctionDayFolder['priceMode']) => void;
};

export function AuctionPriceModePanel({ folder, items, onPriceModeChange }: AuctionPriceModePanelProps) {
  return (
    <section className="auction-day-details-section">
      <h3>Цены</h3>
      <div className="auction-day-segmented">
        <button type="button" className={folder.priceMode === 'graph' ? 'active' : ''} onClick={() => onPriceModeChange('graph')}>По графику</button>
        <button type="button" className={folder.priceMode === 'manual' ? 'active' : ''} onClick={() => onPriceModeChange('manual')}>Вручную</button>
      </div>
      {folder.priceMode === 'graph' ? (
        <div className="inline-hint">График не грузится в панели деталей. Открой его кнопкой «График» или в экспертном режиме.</div>
      ) : (
        <div className="auction-day-items-table">
          <div><span>Предмет</span><span>Кол-во</span><span>Цена</span></div>
          {items.map((item) => (
            <div key={item.uid}>
              <span>{item.title}</span>
              <span>{item.quantity}</span>
              <span>{item.basePrice}</span>
            </div>
          ))}
          {!items.length ? <p>Предметы ещё не добавлены.</p> : null}
        </div>
      )}
    </section>
  );
}
