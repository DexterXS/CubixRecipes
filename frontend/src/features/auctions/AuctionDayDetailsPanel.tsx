import { auctionCurrencies, type AuctionCommandStages } from './auctionCommands';
import type { AuctionDayFolderSummary } from './auctionDayFolders';
import { AuctionPriceModePanel } from './AuctionPriceModePanel';
import { AuctionServerIdPanel } from './AuctionServerIdPanel';
import type { AuctionCurrency, AuctionDayFolder, AuctionFolderCategory, AuctionPriceMode, AuctionUiMode } from './auctionTypes';
import './AuctionDayDetailsPanel.css';

type AuctionDayDetailsPanelProps = {
  folder: AuctionDayFolder | undefined;
  summary: AuctionDayFolderSummary | undefined;
  uiMode: AuctionUiMode;
  commandStages: AuctionCommandStages;
  onOpenFolder: () => void;
  onCopyFolder: () => void;
  onDeleteFolder: () => void;
  onTitleChange: (title: string) => void;
  onDateChange: (dateLocal: string) => void;
  onCategoryChange: (category: AuctionFolderCategory) => void;
  onCurrencyChange: (currency: AuctionCurrency) => void;
  onDurationChange: (minutes: number) => void;
  onStepPriceChange: (step: number) => void;
  onRepeatEveryDaysChange: (days: number) => void;
  onRepeatCountChange: (count: number) => void;
  onPriceModeChange: (mode: AuctionPriceMode) => void;
};

const currencyDisplayLabels: Record<AuctionCurrency, string> = {
  DONATE: 'DONATE',
  VAULT: 'ИГРОВАЯ',
  BONUS: 'БОНУС'
};

function commandStatusText(commandStages: AuctionCommandStages) {
  if (commandStages.missingServerIds.length) {
    return 'Есть незаполненные серверные ID. Команды предметов и настройки будут неполными.';
  }
  return 'ID заполнены: команды предметов и настройки готовы к выгрузке.';
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
  uiMode,
  commandStages,
  onOpenFolder,
  onCopyFolder,
  onDeleteFolder,
  onTitleChange,
  onDateChange,
  onCategoryChange,
  onCurrencyChange,
  onDurationChange,
  onStepPriceChange,
  onRepeatEveryDaysChange,
  onRepeatCountChange,
  onPriceModeChange
}: AuctionDayDetailsPanelProps) {
  const items = visibleItems(folder);

  if (!folder) {
    return <aside className="auction-day-details-panel">Выбери папку.</aside>;
  }

  const isPlanned = folder.category === 'planned';

  return (
    <aside className="auction-day-details-panel" aria-label="auction-day-details">
      <div className="auction-day-details-header">
        <div>
          <h2>Управление папкой</h2>
          <span>{folder.title}</span>
        </div>
      </div>

      <section className="auction-day-details-section">
        <div className="auction-day-details-actions">
          <button type="button" onClick={onOpenFolder}>Открыть папку</button>
          <button type="button" onClick={onCopyFolder}>Копировать</button>
          <button type="button" className="danger-button" onClick={onDeleteFolder}>Удалить</button>
        </div>
      </section>

      <section className="auction-day-details-section">
        <h3>Параметры папки</h3>
        <label className="field-block compact-field">
          <span>Название папки</span>
          <input value={folder.title} onChange={(event) => onTitleChange(event.target.value)} />
        </label>
        <label className="field-block compact-field">
          <span>Категория папки</span>
          <select value={folder.category} onChange={(event) => onCategoryChange(event.target.value as AuctionFolderCategory)}>
            <option value="regular">Обычные аукционы</option>
            <option value="planned">Планируемые / повтор</option>
          </select>
        </label>
        {!isPlanned ? (
          <label className="field-block compact-field">
            <span>Дата дня</span>
            <input type="date" value={folder.dateLocal} onChange={(event) => onDateChange(event.target.value)} />
          </label>
        ) : (
          <div className="inline-hint">У планируемой фиолетовой папки нет фиксированной даты.</div>
        )}
        <label className="field-block compact-field">
          <span>Валюта</span>
          <select value={folder.currency} onChange={(event) => onCurrencyChange(event.target.value as AuctionCurrency)}>
            {auctionCurrencies.map((currency) => <option key={currency} value={currency}>{currency} · {currencyDisplayLabels[currency]}</option>)}
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
        {isPlanned ? (
          <div className="auction-day-details-fields">
            <label className="field-block compact-field">
              <span>Повтор каждые, дней</span>
              <input type="number" min={1} value={folder.repeatEveryDays} onChange={(event) => onRepeatEveryDaysChange(Number(event.target.value))} />
            </label>
            <label className="field-block compact-field">
              <span>Повторов</span>
              <input type="number" min={1} max={90} value={folder.repeatCount} onChange={(event) => onRepeatCountChange(Number(event.target.value))} />
            </label>
          </div>
        ) : null}
      </section>

      <section className="auction-day-details-section">
        <h3>Статистика папки</h3>
        <dl className="auction-day-details-stats">
          <div><dt>Аукционов</dt><dd>{summary?.auctionCount ?? folder.auctions.length}</dd></div>
          <div><dt>Предметов</dt><dd>{summary?.itemCount ?? 0}</dd></div>
          <div><dt>Нет ID</dt><dd>{summary?.missingServerIdCount ?? 0}</dd></div>
          <div><dt>NBT предупреждения</dt><dd>{summary?.nbtItemCount ?? 0}</dd></div>
        </dl>
      </section>

      <AuctionPriceModePanel folder={folder} items={items} onPriceModeChange={onPriceModeChange} />

      <section className="auction-day-details-section">
        <h3>Глобальный график</h3>
        <p>{isPlanned ? 'Глобальный график цен не применяется.' : 'Папка подключена к глобальному графику цен.'}</p>
      </section>

      <AuctionServerIdPanel folder={folder} summary={summary} />

      <section className="auction-day-details-section">
        <h3>Команды</h3>
        <p>{commandStatusText(commandStages)}</p>
      </section>

      {uiMode === 'expert' ? (
        <section className="auction-day-details-section">
          <h3>Экспертно</h3>
          <p>timezone offset: {folder.timezoneOffsetMinutes}; graph mode: {folder.graphMode}; repeat: {folder.repeatEnabled ? folder.repeatCount : 1}</p>
        </section>
      ) : null}
    </aside>
  );
}
