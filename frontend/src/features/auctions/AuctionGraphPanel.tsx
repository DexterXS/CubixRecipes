import { useMemo, useState } from 'react';
import { auctionCurrencies, auctionCurrencyLabels } from './auctionCommands';
import { buildAuctionGraphPoints } from './auctionGraphModel';
import { AuctionPriceGraph, type AuctionPriceGraphPoint, type AuctionPriceGraphSeries } from './AuctionPriceGraph';
import type { AuctionCurrency, AuctionCurve, AuctionDayFolder } from './auctionTypes';
import './AuctionGraphPanel.css';

type AuctionGraphPanelProps = {
  folders: AuctionDayFolder[];
  curve: AuctionCurve;
  graphStartLocal: string;
  onMovePoint: (currency: AuctionCurrency, sourceDay: number, targetDay: number, value: number) => void;
};

type CurrencyTab = AuctionCurrency | 'all';

const currencyColors: Record<AuctionCurrency, string> = {
  DONATE: '#54d8ff',
  VAULT: '#f7c948',
  BONUS: '#a879ff'
};

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function pointToGraphPoint(point: ReturnType<typeof buildAuctionGraphPoints>[number]): AuctionPriceGraphPoint {
  return {
    day: point.day,
    dateLabel: point.dateLabel,
    editable: point.editable,
    value: point.value,
    details: point.auctions.map((auction) => ({
      label: auction.label,
      folderTitle: auction.folderTitle,
      folderCategory: auction.folderCategory,
      startPrice: auction.startPrice,
      stepPrice: auction.stepPrice,
      multiplier: auction.multiplier
    }))
  };
}

export function AuctionGraphPanel({ folders, curve, graphStartLocal, onMovePoint }: AuctionGraphPanelProps) {
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyTab>('all');
  const [menu, setMenu] = useState<{ currency: AuctionCurrency; day: number; x: number; y: number } | null>(null);
  const pointsByCurrency = useMemo(() => Object.fromEntries(auctionCurrencies.map((currency) => [
    currency,
    buildAuctionGraphPoints({ folders, curve, graphStartLocal, currency })
  ])) as Record<AuctionCurrency, ReturnType<typeof buildAuctionGraphPoints>>, [folders, curve, graphStartLocal]);
  const visibleCurrencies = selectedCurrency === 'all' ? auctionCurrencies : [selectedCurrency];
  const regularCount = folders.filter((folder) => folder.category !== 'planned').length;
  const plannedCount = folders.length - regularCount;
  const series: AuctionPriceGraphSeries[] = visibleCurrencies.map((currency) => ({
    currency,
    label: auctionCurrencyLabels[currency],
    color: currencyColors[currency],
    values: curve[currency],
    points: pointsByCurrency[currency].map(pointToGraphPoint)
  }));
  const activeMenuPoint = menu ? pointsByCurrency[menu.currency].find((point) => point.day === menu.day) : null;

  return (
    <section className="auction-graph-panel" aria-label="auction-graph-panel" onClick={() => setMenu(null)}>
      <div className="auction-graph-panel-header">
        <div>
          <h2>График цен</h2>
          <span>Обычные папки можно менять. Фиолетовые планируемые папки показаны статическими точками.</span>
        </div>
        <strong>{regularCount} обычных · {plannedCount} статичных</strong>
      </div>

      <div className="auction-graph-tabs" onClick={(event) => event.stopPropagation()}>
        <button type="button" className={selectedCurrency === 'all' ? 'active' : ''} onClick={() => setSelectedCurrency('all')}>Все валюты</button>
        {auctionCurrencies.map((currency) => (
          <button key={currency} type="button" className={selectedCurrency === currency ? 'active' : ''} onClick={() => setSelectedCurrency(currency)}>
            {currency}
          </button>
        ))}
      </div>

      <div className="auction-graph-legend">
        {visibleCurrencies.map((currency) => (
          <span key={currency}><i style={{ background: currencyColors[currency] }} />{currency} · первая точка {percent(curve[currency][series.find((item) => item.currency === currency)?.points[0]?.day ?? 0] ?? 1)}</span>
        ))}
      </div>

      <AuctionPriceGraph
        series={series}
        onMovePoint={onMovePoint}
        onOpenPoint={(currency, day, x, y) => setMenu({ currency, day, x, y })}
      />

      {activeMenuPoint && menu ? (
        <div className="auction-graph-point-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
          <div className="auction-graph-point-menu-header">
            <strong>{menu.currency} · {activeMenuPoint.dateLabel}</strong>
            <button type="button" onClick={() => setMenu(null)}>×</button>
          </div>
          <div className="auction-graph-point-menu-list">
            {activeMenuPoint.auctions.map((auction) => (
              <article key={`${auction.folderId}-${auction.auctionId}-${auction.label}`}>
                <span>{auction.folderCategory === 'planned' ? 'Статично' : 'Можно менять'}</span>
                <strong>{auction.label}</strong>
                <small>{auction.folderTitle} · старт {auction.startPrice} · шаг {auction.stepPrice}</small>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
