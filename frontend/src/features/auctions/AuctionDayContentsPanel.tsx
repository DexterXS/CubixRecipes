import type { AuctionCommandStage, AuctionDayFolder, AuctionDraft } from './auctionTypes';
import './AuctionDayContentsPanel.css';

type AuctionDayContentsPanelProps = {
  folder: AuctionDayFolder;
  selectedAuctionId: string;
  maxItemsPerAuction: number;
  onBackToDays: () => void;
  onSelectAuction: (id: string) => void;
  onAddAuction: () => void;
  onCopyAuction: (id: string) => void;
  onDeleteAuction: (id: string) => void;
  onOpenItems: (id: string) => void;
  onOpenSettings: (id: string) => void;
  onOpenCommands: (id: string, stage: AuctionCommandStage) => void;
};

function expectedServerIds(auction: AuctionDraft) {
  return auction.repeatEnabled ? Math.max(1, auction.repeatCount) : 1;
}

function missingServerIds(auction: AuctionDraft) {
  let missing = 0;
  for (let index = 0; index < expectedServerIds(auction); index += 1) {
    if (!auction.serverIds[String(index)]?.trim()) missing += 1;
  }
  return missing;
}

function nonNbtBasePrice(auction: AuctionDraft) {
  return auction.items.filter((item) => !item.hasNbt).reduce((total, item) => total + Math.max(0, item.basePrice), 0);
}

function formatLocalDateTime(value: string) {
  return value.replace('T', ' ');
}

export function AuctionDayContentsPanel({
  folder,
  selectedAuctionId,
  maxItemsPerAuction,
  onBackToDays,
  onSelectAuction,
  onAddAuction,
  onCopyAuction,
  onDeleteAuction,
  onOpenItems,
  onOpenSettings,
  onOpenCommands
}: AuctionDayContentsPanelProps) {
  return (
    <section className="auction-day-contents-panel">
      <div className="auction-day-contents-header">
        <div>
          <button type="button" className="ghost-button" onClick={onBackToDays}>← Все дни</button>
          <h2>{folder.title}</h2>
          <span>{folder.auctions.length} аукционов внутри папки</span>
        </div>
        <button type="button" onClick={onAddAuction}>+ Аукцион</button>
      </div>

      <div className="auction-day-auction-table" role="list" aria-label="Аукционы выбранного дня">
        {folder.auctions.map((auction) => {
          const isSelected = auction.id === selectedAuctionId;
          const missingIds = missingServerIds(auction);
          const nbtCount = auction.items.filter((item) => item.hasNbt).length;
          return (
            <article key={auction.id} className={`auction-day-auction-row ${isSelected ? 'active' : ''}`.trim()} role="listitem">
              <button type="button" className="auction-day-auction-main" onClick={() => onSelectAuction(auction.id)}>
                <strong>{auction.name}</strong>
                <span>{formatLocalDateTime(auction.startLocal)} · {auction.durationMinutes} мин</span>
              </button>
              <div className="auction-day-auction-metrics">
                <span>{auction.currency}</span>
                <span>{auction.items.length}/{maxItemsPerAuction} предметов</span>
                <span>Цена {nonNbtBasePrice(auction)}</span>
                <span>Шаг {auction.baseStepPrice}</span>
                <span className={missingIds ? 'warning' : ''}>{missingIds ? `Нет ID: ${missingIds}` : 'ID готовы'}</span>
                <span className={nbtCount ? 'warning' : ''}>{nbtCount ? `NBT: ${nbtCount}` : 'Без NBT'}</span>
              </div>
              <div className="auction-day-auction-actions">
                <button type="button" onClick={() => onOpenSettings(auction.id)}>Настройки</button>
                <button type="button" onClick={() => onOpenItems(auction.id)}>Предметы</button>
                <button type="button" onClick={() => onOpenCommands(auction.id, 'settings')}>Команды</button>
                <button type="button" onClick={() => onCopyAuction(auction.id)}>Копировать</button>
                <button type="button" onClick={() => onDeleteAuction(auction.id)} disabled={folder.auctions.length <= 1}>Удалить</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
