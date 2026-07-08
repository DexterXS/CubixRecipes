import { buildAuctionRunPricePreviews } from './auctionCommands';
import { AuctionPriceGraph, type AuctionPriceGraphPointDetail, type AuctionPriceGraphRepeatMarker } from './AuctionPriceGraph';
import { AuctionRunPricePreviewList } from './AuctionRunPricePreviewList';
import type { AuctionCurve, AuctionDayFolder } from './auctionTypes';
import './AuctionGraphPanel.css';

type AuctionGraphPanelProps = {
  folder: AuctionDayFolder;
  curve: AuctionCurve;
  graphStartLocal: string;
  onChangeDay: (day: number, value: number) => void;
};

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function AuctionGraphPanel({ folder, curve, graphStartLocal, onChangeDay }: AuctionGraphPanelProps) {
  const previews = buildAuctionRunPricePreviews({ auctions: folder.auctions, curve, graphStartLocal })
    .filter((preview) => preview.currency === folder.currency);
  const pointDetails: Record<number, AuctionPriceGraphPointDetail[]> = {};
  const repeatMarkers: AuctionPriceGraphRepeatMarker[] = [];
  previews.forEach((preview) => {
    const detail = {
      label: preview.label,
      startPrice: preview.startPrice,
      stepPrice: preview.stepPrice,
      multiplier: preview.multiplier
    };
    if (preview.dayIndex !== preview.priceDayIndex) {
      repeatMarkers.push({ ...detail, day: preview.dayIndex, priceDay: preview.priceDayIndex });
      return;
    }
    pointDetails[preview.dayIndex] = [...(pointDetails[preview.dayIndex] ?? []), detail];
  });
  const activeDays = Object.keys(pointDetails).map(Number);
  const graphDays = activeDays.length ? activeDays : [0, 89];
  const values = curve[folder.currency];
  const isEditable = folder.category !== 'planned' && folder.priceMode === 'graph';

  return (
    <section className="auction-graph-panel" aria-label="auction-graph-panel">
      <div className="auction-graph-panel-header">
        <div>
          <h2>График цен</h2>
          <span>{folder.title}: {folder.currency}, текущий множитель для первой точки {percent(values[graphDays[0]] ?? 1)}</span>
        </div>
        <strong>{isEditable ? 'Можно менять' : 'Только просмотр'}</strong>
      </div>
      {folder.category === 'planned' ? (
        <div className="inline-hint">Планируемые папки используют фиксированные цены. График доступен для обычных папок.</div>
      ) : folder.priceMode !== 'graph' ? (
        <div className="inline-hint">Включи режим «По графику» во вкладке «Графики», чтобы менять множители.</div>
      ) : null}
      <AuctionPriceGraph
        values={values}
        activeDays={graphDays}
        pointDetails={pointDetails}
        repeatMarkers={repeatMarkers}
        onChangeDay={(day, value) => {
          if (isEditable) onChangeDay(day, value);
        }}
      />
      <AuctionRunPricePreviewList previews={previews} />
    </section>
  );
}
