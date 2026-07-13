import { auctionCurrencyLabels, getAuctionBaseItemPrice } from './auctionCommands';
import type { AuctionCommandStage, AuctionDayFolder, AuctionDraft, AuctionRenderItemIcon } from './auctionTypes';
import './AuctionDayContentsPanel.css';

type AuctionDayContentsPanelProps = {
  folder: AuctionDayFolder;
  selectedAuctionId: string;
  renderItemIcon: AuctionRenderItemIcon;
  onBackToDays: () => void;
  onSelectAuction: (id: string) => void;
  onAddAuction: () => void;
  onOpenAuction: (id: string) => void;
  onCopyAuction: (id: string) => void;
  onDeleteAuction: (id: string) => void;
  onOpenCommands: (id: string, stage: AuctionCommandStage) => void;
};

function firstServerId(auction: AuctionDraft) {
  return auction.serverIds['0']?.trim();
}

function nbtWarnings(auction: AuctionDraft) {
  return auction.items.filter((item) => item.hasNbt).length;
}

export function buildAuctionLotWarning(auction: AuctionDraft) {
  const nbtCount = nbtWarnings(auction);
  const missingDescription = !auction.description.trim();
  const parts = [
    missingDescription ? 'Высокий риск: не заполнено описание' : '',
    nbtCount ? `NBT-предметов: ${nbtCount}` : ''
  ].filter(Boolean);
  return {
    text: parts.length ? parts.join(' · ') : 'нет',
    level: missingDescription ? 'danger' : nbtCount ? 'warning' : ''
  };
}

function priceWithCurrency(value: number, auction: AuctionDraft) {
  return `${value} ${auction.currency} · ${auctionCurrencyLabels[auction.currency]}`;
}

function itemSlots(auction: AuctionDraft, renderItemIcon: AuctionRenderItemIcon) {
  return auction.items.slice(0, 5).map((item) => (
    <span key={item.uid} className={`auction-day-auction-item ${item.hasNbt ? 'has-warning' : ''}`.trim()} title={item.title}>
      {renderItemIcon(item)}
      <small>{item.quantity}</small>
    </span>
  ));
}

export function AuctionDayContentsPanel({
  folder,
  selectedAuctionId,
  renderItemIcon,
  onBackToDays,
  onSelectAuction,
  onAddAuction,
  onOpenAuction,
  onCopyAuction,
  onDeleteAuction,
  onOpenCommands
}: AuctionDayContentsPanelProps) {
  return (
    <section className="auction-day-contents-panel">
      <div className="auction-day-contents-header">
        <div>
          <div className="auction-day-breadcrumb">
            <button type="button" className="ghost-button" onClick={onBackToDays}>Папки аукционов</button>
            <span>›</span>
            <strong>{folder.title}</strong>
          </div>
          <h2>Аукционы внутри папки</h2>
          <span>{folder.auctions.length} лотов. Дата и длительность управляются папкой.</span>
        </div>
        <button type="button" onClick={onAddAuction}>+ Аукцион</button>
      </div>

      <div className="auction-day-auction-table" role="list" aria-label="Аукционы выбранной папки">
        {folder.auctions.map((auction) => {
          const isSelected = auction.id === selectedAuctionId;
          const serverId = firstServerId(auction);
          const warning = buildAuctionLotWarning(auction);
          return (
            <article key={auction.id} className={`auction-day-auction-card ${isSelected ? 'active' : ''}`.trim()} role="listitem" onClick={() => onSelectAuction(auction.id)}>
              <button type="button" className="auction-day-auction-preview" onClick={() => onOpenAuction(auction.id)}>
                {auction.items[0] ? renderItemIcon(auction.items[0]) : <span>+</span>}
              </button>
              <div className="auction-day-auction-main">
                <div>
                  <span className="auction-day-auction-id">#{auction.id}</span>
                  <strong>{auction.name}</strong>
                  <span className={`auction-day-auction-state ${auction.state.toLowerCase()}`}>{auction.state}</span>
                </div>
                <p className="auction-day-auction-description">
                  {auction.description.trim() ? auction.description.trim() : 'Описание лота не заполнено'}
                </p>
                <div className="auction-day-auction-items">
                  {itemSlots(auction, renderItemIcon)}
                  {auction.items.length > 5 ? <span className="auction-day-auction-more">+{auction.items.length - 5}</span> : null}
                  {!auction.items.length ? <span className="auction-day-auction-empty">Предметы не добавлены</span> : null}
                </div>
                <div className="auction-day-auction-actions">
                  <button type="button" onClick={() => onOpenAuction(auction.id)}>Открыть</button>
                  <button type="button" onClick={() => onCopyAuction(auction.id)}>Копировать</button>
                  <button type="button" onClick={() => onOpenCommands(auction.id, 'settings')}>Команды</button>
                  <button type="button" onClick={() => onDeleteAuction(auction.id)} disabled={folder.auctions.length <= 1}>Удалить</button>
                </div>
              </div>
              <dl className="auction-day-auction-metrics">
                <div><dt>Стартовая цена</dt><dd>{priceWithCurrency(getAuctionBaseItemPrice(auction), auction)}</dd></div>
                <div><dt>Шаг ставки</dt><dd>{priceWithCurrency(auction.baseStepPrice, auction)}</dd></div>
                <div><dt>Длительность</dt><dd>{auction.durationMinutes} мин.</dd></div>
                <div><dt>ID сервера</dt><dd>{serverId ? `ID: ${serverId}` : 'нет ID'}</dd></div>
                <div><dt>Предметов</dt><dd>{auction.items.length}</dd></div>
                <div><dt>Предупреждения</dt><dd className={warning.level}>{warning.text}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
