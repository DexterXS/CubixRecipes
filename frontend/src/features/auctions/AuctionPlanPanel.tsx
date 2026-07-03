import { Panel } from '../../components/Panel';
import { AuctionHelpTip } from './AuctionHelpTip';
import type { AuctionDraft, AuctionRenderItemIcon } from './auctionTypes';

type AuctionPlanPanelProps = {
  auctions: AuctionDraft[];
  selectedAuctionId: string;
  maxItemsPerAuction: number;
  renderItemIcon: AuctionRenderItemIcon;
  onSelectAuction: (id: string) => void;
  onAddAuction: () => void;
  onMaxItemsChange: (value: number) => void;
};

export function AuctionPlanPanel({
  auctions,
  selectedAuctionId,
  maxItemsPerAuction,
  renderItemIcon,
  onSelectAuction,
  onAddAuction,
  onMaxItemsChange
}: AuctionPlanPanelProps) {
  const normalizedMaxItems = Math.max(1, maxItemsPerAuction);

  return (
    <Panel
      title="План аукционов"
      subtitle="По умолчанию горизонт ограничен 3 месяцами"
      actions={(
        <AuctionHelpTip label="Подсказка: План аукционов">
          Здесь список локальных заготовок аукционов и их внутренний инвентарь.
          Слоты показывают, какие предметы уже будут добавлены в конкретный аукцион.
          Серверный ID появится только после выполнения `/aca create`.
        </AuctionHelpTip>
      )}
    >
      <div className="auction-admin-settings">
        <label className="field-block compact-field">
          <span>Максимум предметов в аукционе</span>
          <input
            type="number"
            min={1}
            max={27}
            value={normalizedMaxItems}
            onChange={(event) => onMaxItemsChange(Number(event.target.value))}
          />
        </label>
        <span>Админ-настройка лимита слотов. Например, 4 значит один аукцион сможет принять до 4 предметов.</span>
      </div>

      <div className="auction-list">
        {auctions.map((auction) => {
          const isSelected = selectedAuctionId === auction.id;
          const slotCount = Math.max(normalizedMaxItems, auction.items.length);
          const emptySlots = Math.max(0, slotCount - auction.items.length);

          return (
            <button
              key={auction.id}
              type="button"
              className={`auction-card ${isSelected ? 'active' : ''}`.trim()}
              onClick={() => onSelectAuction(auction.id)}
            >
              <strong>{auction.name}</strong>
              <span>{auction.currency} · {auction.startLocal.replace('T', ' ')}</span>
              {auction.repeatEnabled ? <span>Повтор: {auction.repeatCount} раз, каждые {auction.repeatEveryDays} дн.</span> : null}
              <div className="auction-card-inventory" aria-label={`auction-inventory-${auction.id}`}>
                {auction.items.map((item) => (
                  <span key={item.uid} className={`auction-inventory-slot ${item.hasNbt ? 'has-warning' : ''}`.trim()} title={`${item.title} · ${item.quantity} шт. · ${item.basePrice}`}>
                    {renderItemIcon(item)}
                    {item.quantity > 1 ? <small>{item.quantity}</small> : null}
                    {item.hasNbt ? <b>!</b> : null}
                  </span>
                ))}
                {Array.from({ length: emptySlots }, (_, index) => (
                  <span key={`empty-${index}`} className="auction-inventory-slot empty" aria-label="empty-auction-slot" />
                ))}
              </div>
              <span>{auction.items.length}/{normalizedMaxItems} предметов</span>
            </button>
          );
        })}
        <button type="button" className="secondary-button" title="Создаёт ещё одну локальную заготовку аукциона в текущем плане." onClick={onAddAuction}>Добавить аукцион</button>
      </div>
    </Panel>
  );
}
