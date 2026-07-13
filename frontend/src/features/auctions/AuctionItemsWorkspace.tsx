import type { ReactNode } from 'react';
import { Panel } from '../../components/Panel';
import { AuctionHelpTip } from './AuctionHelpTip';
import type { AuctionDraft, AuctionItemIdMode, AuctionItemOption, AuctionLotItem, AuctionRenderItemIcon } from './auctionTypes';

type AuctionItemsWorkspaceProps = {
  selectedAuction: AuctionDraft;
  idMode: AuctionItemIdMode;
  commandPlayer: string;
  itemSearch: string;
  filteredItems: AuctionItemOption[];
  selectedAuctionFull: boolean;
  maxItemsPerAuction: number;
  nbtSkippedCount: number;
  renderItemIcon: AuctionRenderItemIcon;
  onIdModeChange: (mode: AuctionItemIdMode) => void;
  onCommandPlayerChange: (player: string) => void;
  onItemSearchChange: (query: string) => void;
  onAddItem: (item: AuctionItemOption) => void;
  onUpdateItem: (uid: string, patch: Partial<AuctionLotItem>) => void;
  onRemoveItem: (uid: string) => void;
};

function HelpLabel({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="auction-help-label">
      {text}
      <AuctionHelpTip label={`Подсказка: ${text}`}>{children}</AuctionHelpTip>
    </span>
  );
}

export function AuctionItemsWorkspace({
  selectedAuction,
  idMode,
  commandPlayer,
  itemSearch,
  filteredItems,
  selectedAuctionFull,
  maxItemsPerAuction,
  nbtSkippedCount,
  renderItemIcon,
  onIdModeChange,
  onCommandPlayerChange,
  onItemSearchChange,
  onAddItem,
  onUpdateItem,
  onRemoveItem
}: AuctionItemsWorkspaceProps) {
  return (
    <Panel
      title="Предметы аукциона"
      subtitle="Слева каталог NEI, справа внутренний инвентарь выбранного аукциона"
      className="auction-items-panel"
      actions={(
        <AuctionHelpTip label="Подсказка: Предметы аукциона">
          Здесь удобнее собирать содержимое выбранного аукциона: выбери предмет из NEI слева, затем настрой количество и цену справа.
          NBT-предметы видны в инвентаре, но не попадут в файл команд.
        </AuctionHelpTip>
      )}
    >
      <div className="auction-items-summary">
        <strong>{selectedAuction.name}</strong>
        <span>{selectedAuction.items.length}/{maxItemsPerAuction} предметов</span>
        {nbtSkippedCount ? <span className="auction-warning">NBT будет пропущено: {nbtSkippedCount}</span> : null}
      </div>

      <div className="auction-items-workspace">
        <section className="auction-picker-column">
          <div className="settings-section-title compact">
            <h3>Каталог NEI</h3>
            <span>Нажми предмет, чтобы добавить его во внутренний инвентарь выбранного аукциона.</span>
          </div>
          <input
            aria-label="auction-item-search"
            title="Ищи по названию, raw ID вроде minecraft:diamond или legacy ID."
            type="search"
            value={itemSearch}
            onChange={(event) => onItemSearchChange(event.target.value)}
            placeholder="Поиск предмета, mod:item или ID"
          />
          <div className="auction-item-picker">
            {filteredItems.map((item) => (
              <button
                key={`${item.raw}-${item.legacyId ?? 'x'}-${item.meta}`}
                type="button"
                title={selectedAuctionFull ? 'Лимит предметов в этом аукционе уже заполнен.' : item.hasNbt ? 'NBT-предмет добавится только визуально и будет исключён из команд.' : 'Добавить этот предмет в выбранный аукцион.'}
                className="auction-picker-row"
                disabled={selectedAuctionFull}
                onClick={() => onAddItem(item)}
              >
                <span className="auction-item-icon">{renderItemIcon(item)}</span>
                <span><strong>{item.title}</strong><br /><small>{item.raw}</small></span>
                {item.hasNbt ? <span className="auction-warning">!</span> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="auction-lot-column">
          <div className="settings-section-title compact">
            <h3>Внутренний инвентарь</h3>
            <span>Будущие предметы этого аукциона. Эти строки участвуют в командах и расчёте цены, кроме NBT.</span>
          </div>
          <div className="auction-toolbar-row">
            <div className="auction-id-mode">
              <button type="button" title="В командах /give будет использоваться буквенный ID предмета и meta, например minecraft:stone 1." className={idMode === 'raw' ? 'active' : ''} onClick={() => onIdModeChange('raw')}>mod:item + meta</button>
              <button type="button" title="В командах /give будет использоваться числовой legacy ID и meta, например 1 0." className={idMode === 'legacy' ? 'active' : ''} onClick={() => onIdModeChange('legacy')}>id:meta</button>
            </div>
            <label className="field-block compact-field">
              <HelpLabel text="Игрок выдачи">Кому временно выдаётся предмет перед добавлением в аукцион. Обычно `@p`, но можно вписать ник администратора.</HelpLabel>
              <input value={commandPlayer} onChange={(event) => onCommandPlayerChange(event.target.value)} />
            </label>
          </div>
          <div className="auction-lot-list">
            {selectedAuction.items.map((item) => (
              <div key={item.uid} className={`auction-lot-row ${item.hasNbt ? 'has-warning' : ''}`.trim()}>
                <span className="auction-item-icon">{renderItemIcon(item)}</span>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.raw}</span>
                  {item.hasNbt ? <div className="auction-warning">! NBT нельзя выдать командой, лот не попадёт в файл</div> : null}
                </div>
                <div className="auction-lot-controls">
                  <label className="field-block compact-field">
                    <HelpLabel text="Кол-во">Количество предметов в команде `/give`. Пример: 64 алмаза в одном лоте.</HelpLabel>
                    <input aria-label={`auction-item-qty-${item.uid}`} type="number" min={1} value={item.quantity} onChange={(event) => onUpdateItem(item.uid, { quantity: Number(event.target.value) })} />
                  </label>
                  <label className="field-block compact-field">
                    <HelpLabel text="Цена">Базовая цена именно этого предмета до графика. Пример: предмет стоит 2000, а график на дату +25%, значит в расчёте будет 2500.</HelpLabel>
                    <input aria-label={`auction-item-price-${item.uid}`} type="number" min={0} value={item.basePrice} onChange={(event) => onUpdateItem(item.uid, { basePrice: Number(event.target.value) })} />
                  </label>
                  <button type="button" className="ghost-button" title="Убирает предмет из текущей локальной заготовки аукциона." onClick={() => onRemoveItem(item.uid)}>Удалить</button>
                </div>
              </div>
            ))}
            {!selectedAuction.items.length ? <div className="inline-hint">Выбери предмет из каталога NEI слева.</div> : null}
            {selectedAuctionFull ? <div className="inline-status inline-status-warning">Лимит предметов для этого аукциона заполнен: {selectedAuction.items.length}/{maxItemsPerAuction}</div> : null}
          </div>
        </section>
      </div>
    </Panel>
  );
}
