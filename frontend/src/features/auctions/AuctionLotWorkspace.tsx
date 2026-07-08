import { auctionCurrencies, getAuctionBaseItemPrice } from './auctionCommands';
import type { AuctionCommandStage, AuctionCurrency, AuctionDayFolder, AuctionDraft, AuctionItemOption, AuctionLotItem, AuctionRenderItemIcon, AuctionState, AuctionUiMode } from './auctionTypes';
import './AuctionLotWorkspace.css';

type AuctionLotWorkspaceProps = {
  folder: AuctionDayFolder;
  auction: AuctionDraft;
  uiMode: AuctionUiMode;
  itemSearch: string;
  filteredItems: AuctionItemOption[];
  selectedAuctionFull: boolean;
  maxItemsPerAuction: number;
  renderItemIcon: AuctionRenderItemIcon;
  onBackToFolder: () => void;
  onUpdateAuction: (id: string, patch: Partial<AuctionDraft>) => void;
  onUpdateServerId: (id: string, runIndex: number, serverId: string) => void;
  onItemSearchChange: (query: string) => void;
  onAddItem: (item: AuctionItemOption) => void;
  onUpdateItem: (uid: string, patch: Partial<AuctionLotItem>) => void;
  onRemoveItem: (uid: string) => void;
  onSetCommandStage: (stage: AuctionCommandStage) => void;
  onOpenDownload: () => void;
};

const stateLabels: Record<AuctionState, string> = {
  SETUP: 'Подготовка',
  ACTIVE: 'Запустить',
  PAUSED: 'Пауза',
  CLOSED: 'Закрыт',
  ENDED: 'Завершён'
};

const currencyIcons: Record<AuctionCurrency, string> = {
  DONATE: '◆',
  VAULT: '◆',
  BONUS: '■'
};

const currencyDisplayLabels: Record<AuctionCurrency, string> = {
  DONATE: 'DONATE',
  VAULT: 'ИГРОВАЯ',
  BONUS: 'БОНУС'
};

function firstServerId(auction: AuctionDraft) {
  return auction.serverIds['0']?.trim() ?? '';
}

function itemPreviewSlots(auction: AuctionDraft, renderItemIcon: AuctionRenderItemIcon) {
  return auction.items.slice(0, 8).map((item) => (
    <span key={item.uid} className={`auction-lot-preview-slot ${item.hasNbt ? 'has-warning' : ''}`.trim()} title={item.title}>
      {renderItemIcon(item)}
      <small>{item.quantity}</small>
    </span>
  ));
}

export function AuctionLotWorkspace({
  folder,
  auction,
  uiMode,
  itemSearch,
  filteredItems,
  selectedAuctionFull,
  maxItemsPerAuction,
  renderItemIcon,
  onBackToFolder,
  onUpdateAuction,
  onUpdateServerId,
  onItemSearchChange,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onSetCommandStage,
  onOpenDownload
}: AuctionLotWorkspaceProps) {
  const startPrice = getAuctionBaseItemPrice(auction);
  const serverId = firstServerId(auction);
  const mainItem = auction.items[0];
  const nbtCount = auction.items.filter((item) => item.hasNbt).length;

  return (
    <section className="auction-lot-workspace" aria-label="auction-lot-workspace">
      <div className="auction-lot-breadcrumb">
        <button type="button" className="ghost-button" onClick={onBackToFolder}>Папки аукционов</button>
        <span>›</span>
        <button type="button" className="ghost-button" onClick={onBackToFolder}>{folder.title}</button>
        <span>›</span>
        <strong>{auction.name}</strong>
      </div>

      <div className="auction-lot-layout">
        <aside className="auction-lot-preview">
          <div className="auction-lot-id">#{auction.id}</div>
          <h2>{auction.name}</h2>
          <div className="auction-lot-main-icon">
            {mainItem ? renderItemIcon(mainItem) : <span className="auction-lot-empty-icon">+</span>}
          </div>
          <p>{auction.description || 'Описание пока не заполнено.'}</p>
          <dl className="auction-lot-facts">
            <div><dt>Стартовая цена</dt><dd>{startPrice} {currencyIcons[auction.currency]}</dd></div>
            <div><dt>Шаг ставки</dt><dd>{auction.baseStepPrice} {currencyIcons[auction.currency]}</dd></div>
            <div><dt>Длительность</dt><dd>{auction.durationMinutes} мин.</dd></div>
            <div><dt>Статус</dt><dd>{stateLabels[auction.state]}</dd></div>
            <div><dt>ID сервера</dt><dd>{serverId || 'ожидается'}</dd></div>
            <div><dt>Валюта</dt><dd>{currencyDisplayLabels[auction.currency]}</dd></div>
          </dl>
          <div className="auction-lot-preview-items">
            {itemPreviewSlots(auction, renderItemIcon)}
            {!auction.items.length ? <span className="auction-lot-preview-empty">Предметы не добавлены</span> : null}
          </div>
        </aside>

        <section className="auction-lot-content">
          <div className="auction-lot-section-title">
            <h3>Содержимое лота</h3>
            <span>{auction.items.length}/{maxItemsPerAuction} предметов</span>
          </div>
          <div className="auction-lot-item-list">
            {auction.items.map((item) => (
              <article key={item.uid} className={`auction-lot-item-row ${item.hasNbt ? 'has-warning' : ''}`.trim()}>
                <span className="auction-lot-item-icon">{renderItemIcon(item)}</span>
                <div className="auction-lot-item-name">
                  <strong>{item.title}</strong>
                  <span>{item.raw}</span>
                  {uiMode === 'expert' ? <small>legacy: {item.legacyId ?? '-'} / meta: {item.meta}</small> : null}
                  {item.hasNbt ? <small className="auction-warning">NBT виден в лоте, но не попадёт в /give команды.</small> : null}
                </div>
                <div className="auction-lot-item-controls">
                  <label>
                    <span>Кол-во</span>
                    <input type="number" min={1} value={item.quantity} onChange={(event) => onUpdateItem(item.uid, { quantity: Number(event.target.value) })} />
                  </label>
                  <button type="button" title="Настройки предмета">⚙</button>
                  <button type="button" title="Удалить предмет" onClick={() => onRemoveItem(item.uid)}>×</button>
                </div>
              </article>
            ))}
            {!auction.items.length ? <div className="inline-hint">Добавь предмет из NEI справа, чтобы собрать лот.</div> : null}
            {selectedAuctionFull ? <div className="inline-status inline-status-warning">Лимит предметов заполнен: {auction.items.length}/{maxItemsPerAuction}</div> : null}
          </div>
        </section>

        <aside className="auction-lot-control">
          <h3>Управление аукционом</h3>
          <label className="field-block compact-field">
            <span>Название</span>
            <input value={auction.name} onChange={(event) => onUpdateAuction(auction.id, { name: event.target.value })} />
          </label>
          <label className="field-block compact-field">
            <span>Описание</span>
            <input value={auction.description} onChange={(event) => onUpdateAuction(auction.id, { description: event.target.value })} />
          </label>
          <label className="field-block compact-field">
            <span>Валюта</span>
            <select value={auction.currency} onChange={(event) => onUpdateAuction(auction.id, { currency: event.target.value as AuctionCurrency })}>
              {auctionCurrencies.map((currency) => <option key={currency} value={currency}>{currencyDisplayLabels[currency]}</option>)}
            </select>
          </label>
          <label className="field-block compact-field">
            <span>Стартовая цена</span>
            <input type="number" min={0} value={startPrice} onChange={(event) => onUpdateAuction(auction.id, { baseStartPrice: Number(event.target.value) })} />
          </label>
          <label className="field-block compact-field">
            <span>Шаг ставки</span>
            <input type="number" min={1} value={auction.baseStepPrice} onChange={(event) => onUpdateAuction(auction.id, { baseStepPrice: Number(event.target.value) })} />
          </label>
          <label className="field-block compact-field">
            <span>ID сервера</span>
            <input value={serverId} onChange={(event) => onUpdateServerId(auction.id, 0, event.target.value)} placeholder="после /aca create" />
          </label>
          <div className="auction-lot-command-buttons">
            <button type="button" onClick={() => onSetCommandStage('items')}>Добавить предмет</button>
            <button type="button" onClick={() => onSetCommandStage('settings')}>Установить имя</button>
            <button type="button" onClick={() => onSetCommandStage('settings')}>Установить описание</button>
            <button type="button" onClick={() => onSetCommandStage('settings')}>Установить валюту</button>
            <button type="button" onClick={() => onSetCommandStage('settings')}>Установить цены</button>
            <button type="button" onClick={() => onSetCommandStage('settings')}>Показать команду</button>
            <button type="button" onClick={onOpenDownload}>Скачать файл</button>
            <button type="button" onClick={() => onSetCommandStage(serverId ? 'settings' : 'ids')}>Проверить ID</button>
          </div>
          {nbtCount ? <div className="inline-hint inline-hint-warning">NBT-предметов в лоте: {nbtCount}. Они не попадут в /give.</div> : null}
        </aside>

        <aside className="auction-lot-nei">
          <div className="auction-lot-section-title">
            <h3>NEI — каталог предметов</h3>
            <span>{filteredItems.length} найдено</span>
          </div>
          <input
            aria-label="auction-lot-item-search"
            type="search"
            value={itemSearch}
            onChange={(event) => onItemSearchChange(event.target.value)}
            placeholder="Поиск предметов..."
          />
          <div className="auction-lot-nei-grid">
            {filteredItems.map((item) => (
              <button
                key={`${item.raw}-${item.legacyId ?? 'x'}-${item.meta}`}
                type="button"
                title={selectedAuctionFull ? 'Лимит предметов заполнен' : item.title}
                disabled={selectedAuctionFull}
                onClick={() => onAddItem(item)}
              >
                {renderItemIcon(item)}
                {item.hasNbt ? <b>!</b> : null}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
