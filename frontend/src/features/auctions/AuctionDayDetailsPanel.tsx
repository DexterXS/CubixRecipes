import { auctionCurrencies, auctionCurrencyLabels, type AuctionCommandStages } from './auctionCommands';
import type { AuctionDayFolderSummary } from './auctionDayFolders';
import { AuctionPriceModePanel } from './AuctionPriceModePanel';
import { AuctionServerIdPanel } from './AuctionServerIdPanel';
import type { AuctionBuilderMode, AuctionCommandStage, AuctionCurrency, AuctionDayFolder, AuctionPriceMode, AuctionUiMode } from './auctionTypes';
import './AuctionDayDetailsPanel.css';

type AuctionDayDetailsPanelProps = {
  folder: AuctionDayFolder | undefined;
  summary: AuctionDayFolderSummary | undefined;
  selectedAuctionId: string;
  maxItemsPerAuction: number;
  uiMode: AuctionUiMode;
  commandStages: AuctionCommandStages;
  onSelectAuction: (id: string) => void;
  onAddAuction: () => void;
  onTitleChange: (title: string) => void;
  onDateChange: (dateLocal: string) => void;
  onCurrencyChange: (currency: AuctionCurrency) => void;
  onDurationChange: (minutes: number) => void;
  onStepPriceChange: (step: number) => void;
  onPriceModeChange: (mode: AuctionPriceMode) => void;
  onMaxItemsChange: (value: number) => void;
  onSetBuilderMode: (mode: AuctionBuilderMode) => void;
  onSetCommandStage: (stage: AuctionCommandStage) => void;
};

function commandStatusText(commandStages: AuctionCommandStages) {
  if (commandStages.missingServerIds.length) {
    return 'Команды предметов и настройки заблокированы до ввода ID';
  }
  return 'Команды создания, предметов и настройки готовы';
}

function visibleItems(folder: AuctionDayFolder | undefined) {
  return (folder?.auctions.flatMap((auction) => auction.items.map((item) => ({
    ...item,
    auctionName: auction.name
  }))) ?? []).slice(0, 3);
}

export function AuctionDayDetailsPanel({
  folder,
  summary,
  selectedAuctionId,
  maxItemsPerAuction,
  uiMode,
  commandStages,
  onSelectAuction,
  onAddAuction,
  onTitleChange,
  onDateChange,
  onCurrencyChange,
  onDurationChange,
  onStepPriceChange,
  onPriceModeChange,
  onMaxItemsChange,
  onSetBuilderMode,
  onSetCommandStage
}: AuctionDayDetailsPanelProps) {
  const items = visibleItems(folder);

  if (!folder) {
    return <aside className="auction-day-details-panel">Выбери папку дня.</aside>;
  }

  return (
    <aside className="auction-day-details-panel" aria-label="auction-day-details">
      <div className="auction-day-details-header">
        <div>
          <h2>{folder.title}</h2>
          <span>{summary?.auctionCount ?? folder.auctions.length} аукционов</span>
        </div>
        <button type="button" className="secondary-button" onClick={onAddAuction}>+ аукцион</button>
      </div>

      <section className="auction-day-details-section">
        <h3>Базовые поля</h3>
        <label className="field-block compact-field">
          <span>Название папки</span>
          <input value={folder.title} onChange={(event) => onTitleChange(event.target.value)} />
        </label>
        <label className="field-block compact-field">
          <span>Дата дня</span>
          <input type="date" value={folder.dateLocal} onChange={(event) => onDateChange(event.target.value)} />
        </label>
        <label className="field-block compact-field">
          <span>Валюта</span>
          <select value={folder.currency} onChange={(event) => onCurrencyChange(event.target.value as AuctionCurrency)}>
            {auctionCurrencies.map((currency) => <option key={currency} value={currency}>{currency} · {auctionCurrencyLabels[currency]}</option>)}
          </select>
        </label>
        <div className="auction-day-details-fields">
          <label className="field-block compact-field">
            <span>Шаг ставки</span>
            <input type="number" min={1} value={folder.defaultStepPrice} onChange={(event) => onStepPriceChange(Number(event.target.value))} />
          </label>
          <label className="field-block compact-field">
            <span>Длительность</span>
            <input type="number" min={1} value={folder.defaultDurationMinutes} onChange={(event) => onDurationChange(Number(event.target.value))} />
          </label>
        </div>
        <label className="field-block compact-field">
          <span>Лимит предметов в аукционе</span>
          <input type="number" min={1} max={27} value={maxItemsPerAuction} onChange={(event) => onMaxItemsChange(Number(event.target.value))} />
        </label>
      </section>

      <section className="auction-day-details-section">
        <h3>Аукционы дня</h3>
        <div className="auction-day-auction-list">
          {folder.auctions.map((auction) => (
            <button
              key={auction.id}
              type="button"
              className={auction.id === selectedAuctionId ? 'active' : ''}
              onClick={() => onSelectAuction(auction.id)}
            >
              <strong>{auction.name}</strong>
              <span>{auction.items.length}/{maxItemsPerAuction} предметов</span>
            </button>
          ))}
        </div>
      </section>

      <AuctionPriceModePanel folder={folder} items={items} onPriceModeChange={onPriceModeChange} />

      <AuctionServerIdPanel folder={folder} summary={summary} />

      <section className="auction-day-details-section">
        <h3>Команды</h3>
        <p>{commandStatusText(commandStages)}</p>
        <div className="auction-day-details-actions">
          <button type="button" onClick={() => onSetCommandStage('create')}>Создание</button>
          <button type="button" onClick={() => onSetCommandStage('ids')}>ID</button>
          <button type="button" onClick={() => onSetCommandStage('items')}>Предметы</button>
          <button type="button" onClick={() => onSetCommandStage('settings')}>Настройки</button>
        </div>
      </section>

      {uiMode === 'expert' ? (
        <section className="auction-day-details-section">
          <h3>Экспертно</h3>
          <p>timezone offset: {folder.timezoneOffsetMinutes}; graph mode: {folder.graphMode}; repeats: {folder.repeatEnabled ? folder.repeatCount : 1}</p>
          <button type="button" onClick={() => onSetBuilderMode('items')}>Raw ID, legacy/meta и NBT</button>
        </section>
      ) : null}
    </aside>
  );
}
