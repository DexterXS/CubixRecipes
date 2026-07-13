import { auctionCurrencies, auctionCurrencyLabels, getAuctionBaseItemPrice } from './auctionCommands';
import type { AuctionCommandStage, AuctionCurrency, AuctionDraft, AuctionRenderItemIcon, AuctionState } from './auctionTypes';
import './AuctionLotQuickPanel.css';

type AuctionLotQuickPanelProps = {
  auction: AuctionDraft | undefined;
  renderItemIcon: AuctionRenderItemIcon;
  onOpenLot: (auctionId: string) => void;
  onUpdateAuction: (id: string, patch: Partial<AuctionDraft>) => void;
  onUpdateServerId: (id: string, runIndex: number, serverId: string) => void;
  onOpenCommands: (id: string, stage: AuctionCommandStage) => void;
  onApply: () => void;
};

const stateLabels: Record<AuctionState, string> = {
  SETUP: 'Подготовка',
  ACTIVE: 'Запустить',
  PAUSED: 'Пауза',
  CLOSED: 'Закрыт',
  ENDED: 'Завершён'
};

function firstServerId(auction: AuctionDraft) {
  return auction.serverIds['0']?.trim() ?? '';
}

export function AuctionLotQuickPanel({
  auction,
  renderItemIcon,
  onOpenLot,
  onUpdateAuction,
  onUpdateServerId,
  onOpenCommands,
  onApply
}: AuctionLotQuickPanelProps) {
  if (!auction) {
    return <aside className="auction-lot-quick-panel">Выбери лот.</aside>;
  }

  const mainItem = auction.items[0];
  const startPrice = getAuctionBaseItemPrice(auction);
  const serverId = firstServerId(auction);

  return (
    <aside className="auction-lot-quick-panel" aria-label="auction-lot-quick-panel">
      <div className="auction-lot-quick-header">
        <div>
          <h2>Управление лотом</h2>
          <span>#{auction.id}</span>
        </div>
        <div className="auction-lot-quick-icon">
          {mainItem ? renderItemIcon(mainItem) : <span>+</span>}
        </div>
      </div>

      <section className="auction-lot-quick-section">
        <button type="button" onClick={() => onOpenLot(auction.id)}>Открыть полностью</button>
        <button type="button" onClick={() => onOpenCommands(auction.id, serverId ? 'settings' : 'ids')}>Команды</button>
      </section>

      <section className="auction-lot-quick-section">
        <h3>Быстрые настройки</h3>
        <label className="field-block compact-field">
          <span>Название</span>
          <input value={auction.name} onChange={(event) => onUpdateAuction(auction.id, { name: event.target.value })} />
        </label>
        <label className="field-block compact-field">
          <span>Описание лота</span>
          <textarea value={auction.description} rows={3} onChange={(event) => onUpdateAuction(auction.id, { description: event.target.value })} />
        </label>
        <label className="field-block compact-field">
          <span>Валюта</span>
          <select value={auction.currency} onChange={(event) => onUpdateAuction(auction.id, { currency: event.target.value as AuctionCurrency })}>
            {auctionCurrencies.map((currency) => <option key={currency} value={currency}>{currency} · {auctionCurrencyLabels[currency]}</option>)}
          </select>
        </label>
        <div className="auction-lot-quick-fields">
          <label className="field-block compact-field">
            <span>Стартовая цена</span>
            <input type="number" min={0} value={startPrice} onChange={(event) => onUpdateAuction(auction.id, { baseStartPrice: Number(event.target.value) })} />
          </label>
          <label className="field-block compact-field">
            <span>Шаг ставки</span>
            <input type="number" min={1} value={auction.baseStepPrice} onChange={(event) => onUpdateAuction(auction.id, { baseStepPrice: Number(event.target.value) })} />
          </label>
        </div>
        <div className="auction-lot-quick-fields">
          <label className="field-block compact-field">
            <span>Длительность</span>
            <input type="number" min={1} value={auction.durationMinutes} onChange={(event) => onUpdateAuction(auction.id, { durationMinutes: Number(event.target.value) })} />
          </label>
          <label className="field-block compact-field">
            <span>Состояние</span>
            <select value={auction.state} onChange={(event) => onUpdateAuction(auction.id, { state: event.target.value as AuctionState })}>
              {Object.entries(stateLabels).map(([state, label]) => <option key={state} value={state}>{label}</option>)}
            </select>
          </label>
        </div>
        <label className="field-block compact-field">
          <span>ID сервера</span>
          <input value={serverId} onChange={(event) => onUpdateServerId(auction.id, 0, event.target.value)} placeholder="после /aca create" />
        </label>
        <button type="button" className="auction-lot-quick-apply" onClick={onApply}>Применить</button>
      </section>

      <section className="auction-lot-quick-section">
        <h3>Состав</h3>
        <dl className="auction-lot-quick-stats">
          <div><dt>Предметов</dt><dd>{auction.items.length}</dd></div>
          <div><dt>NBT</dt><dd>{auction.items.filter((item) => item.hasNbt).length}</dd></div>
          <div><dt>Описание</dt><dd>{auction.description.trim() ? 'есть' : 'нет'}</dd></div>
        </dl>
      </section>
    </aside>
  );
}
