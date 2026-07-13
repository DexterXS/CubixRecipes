import { auctionCurrencyLabels, type AuctionRunPricePreview } from './auctionCommands';

type AuctionRunPricePreviewListProps = {
  previews: AuctionRunPricePreview[];
};

function formatMultiplier(value: number) {
  const percent = Math.round((value - 1) * 100);
  return percent > 0 ? `+${percent}%` : `${percent}%`;
}

function formatLocalDateTime(value: string) {
  return value.replace('T', ' ');
}

function priceSourceLabel(preview: AuctionRunPricePreview) {
  if (preview.dayIndex === preview.priceDayIndex) return `D${preview.dayIndex + 1}`;
  return `D${preview.dayIndex + 1} · цена от D${preview.priceDayIndex + 1}`;
}

export function AuctionRunPricePreviewList({ previews }: AuctionRunPricePreviewListProps) {
  if (!previews.length) {
    return <div className="inline-hint">Для этой валюты пока нет запусков. Выбери валюту аукциона или добавь повтор.</div>;
  }

  return (
    <section className="auction-run-price-preview">
      <div className="settings-section-title compact">
        <h3>Цены по графику</h3>
        <span>Каждый повтор берёт процент из своей точки на графике и сразу пересчитывает цены.</span>
      </div>
      <div className="auction-run-price-grid">
        {previews.map((preview) => (
          <div key={`${preview.auctionId}-${preview.runIndex}`} className="auction-run-price-row">
            <div>
              <strong>{preview.label}</strong>
              <span>{auctionCurrencyLabels[preview.currency]} · {priceSourceLabel(preview)} · {formatLocalDateTime(preview.startLocal)}</span>
            </div>
            <b>{formatMultiplier(preview.multiplier)}</b>
            <span>Старт: {preview.startPrice}</span>
            <span>Шаг: {preview.stepPrice}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
