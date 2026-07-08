import { useMemo, useState, type CSSProperties } from 'react';
import { auctionCurrencies, auctionCurrencyLabels } from './auctionCommands';
import { auctionFolderTagColors, auctionFolderTagLabels, auctionFolderTags } from './auctionFolderTags';
import { buildAuctionGraphPoints } from './auctionGraphModel';
import { AuctionPriceGraph, type AuctionPriceGraphPoint, type AuctionPriceGraphSeries } from './AuctionPriceGraph';
import type { AuctionCurrency, AuctionCurve, AuctionDayFolder, AuctionFolderTag } from './auctionTypes';
import './AuctionGraphPanel.css';

type AuctionGraphPanelProps = {
  folders: AuctionDayFolder[];
  curve: AuctionCurve;
  graphStartLocal: string;
  onMovePoint: (currency: AuctionCurrency, sourceDay: number, targetDay: number, value: number) => void;
  onMoveAuction: (currency: AuctionCurrency, folderId: string, auctionId: string, targetDay: number) => void;
  onOpenAuction: (folderId: string, auctionId: string) => void;
  onDuplicateAuctionFolder: (folderId: string, auctionId: string) => void;
  onSetFolderTag: (folderId: string, tag: AuctionFolderTag | null) => void;
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
    color: point.tag ? auctionFolderTagColors[point.tag] : null,
    details: point.auctions.map((auction) => ({
      label: auction.label,
      folderTitle: auction.folderTitle,
      folderCategory: auction.folderCategory,
      folderTagLabel: auction.folderTag ? auctionFolderTagLabels[auction.folderTag] : null,
      folderTagColor: auction.folderTag ? auctionFolderTagColors[auction.folderTag] : null,
      startPrice: auction.startPrice,
      stepPrice: auction.stepPrice,
      multiplier: auction.multiplier
    }))
  };
}

export function AuctionGraphPanel({ folders, curve, graphStartLocal, onMovePoint, onMoveAuction, onOpenAuction, onDuplicateAuctionFolder, onSetFolderTag }: AuctionGraphPanelProps) {
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
        onDropAuction={(currency, folderId, auctionId, targetDay) => {
          onMoveAuction(currency, folderId, auctionId, targetDay);
          setMenu(null);
        }}
      />

      {activeMenuPoint && menu ? (
        <div className="auction-graph-point-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
          <div className="auction-graph-point-menu-header">
            <strong>{menu.currency} · {activeMenuPoint.dateLabel}</strong>
            <button type="button" onClick={() => setMenu(null)}>×</button>
          </div>
          <div className="auction-graph-point-menu-list">
            {activeMenuPoint.auctions.map((auction) => (
              <article
                key={`${auction.folderId}-${auction.auctionId}-${auction.label}`}
                draggable={auction.folderCategory !== 'planned'}
                onDragStart={(event) => {
                  if (auction.folderCategory === 'planned') return;
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('application/x-auction-graph-auction', JSON.stringify({
                    currency: menu.currency,
                    folderId: auction.folderId,
                    auctionId: auction.auctionId
                  }));
                }}
              >
                <div>
                  <span>{auction.folderCategory === 'planned' ? 'Статично' : 'Можно перетащить на график'}</span>
                  <strong>{auction.label}</strong>
                  <small>{auction.folderTitle} · старт {auction.startPrice} · шаг {auction.stepPrice}</small>
                  {auction.folderTag ? <small>Тег: {auctionFolderTagLabels[auction.folderTag]}</small> : null}
                </div>
                <div className="auction-graph-point-menu-actions">
                  <button type="button" onClick={() => onOpenAuction(auction.folderId, auction.auctionId)}>Открыть</button>
                  <button type="button" onClick={() => onDuplicateAuctionFolder(auction.folderId, auction.auctionId)}>Дублировать</button>
                </div>
                <div className="auction-graph-tag-row">
                  <button type="button" className={!auction.folderTag ? 'active' : ''} onClick={() => onSetFolderTag(auction.folderId, null)}>Без тега</button>
                  {auctionFolderTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={auction.folderTag === tag ? 'active' : ''}
                      title={auctionFolderTagLabels[tag]}
                      style={{ '--tag-color': auctionFolderTagColors[tag] } as CSSProperties}
                      onClick={() => onSetFolderTag(auction.folderId, tag)}
                    />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
