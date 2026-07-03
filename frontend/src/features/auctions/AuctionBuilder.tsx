import { useMemo, useState } from 'react';
import { Panel } from '../../components/Panel';
import {
  addDaysToLocalDateTime,
  auctionCurrencies,
  auctionCurrencyLabels,
  buildAuctionCommands,
  createDefaultAuctionCurve,
  dayIndexFromStart,
  localDateTimeInputFromUtcMs,
  sanitizeAuctionFilename
} from './auctionCommands';
import { AuctionPriceGraph } from './AuctionPriceGraph';
import type { AuctionBuilderMode, AuctionCurrency, AuctionCurve, AuctionDraft, AuctionItemIdMode, AuctionItemOption, AuctionLotItem, AuctionRenderItemIcon } from './auctionTypes';
import './AuctionBuilder.css';

type AuctionBuilderProps = {
  itemOptions: AuctionItemOption[];
  renderItemIcon: AuctionRenderItemIcon;
};

function defaultTimezoneOffset() {
  return -new Date().getTimezoneOffset();
}

function timezoneLabel(offset: number) {
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function createAuction(index: number, startLocal: string): AuctionDraft {
  return {
    id: String(index),
    name: `Аукцион ${index}`,
    description: '',
    startLocal,
    durationMinutes: 10,
    currency: 'DONATE',
    baseStartPrice: 100,
    baseStepPrice: 10,
    state: 'ACTIVE',
    planned: true,
    repeatEnabled: false,
    repeatEveryDays: 7,
    repeatCount: 1,
    scheduleLeadMinutes: 1,
    items: []
  };
}

function downloadTextWithoutExtension(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = sanitizeAuctionFilename(filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function AuctionBuilder({ itemOptions, renderItemIcon }: AuctionBuilderProps) {
  const now = Date.now();
  const [mode, setMode] = useState<AuctionBuilderMode>('config');
  const [timezoneOffset, setTimezoneOffset] = useState(defaultTimezoneOffset());
  const [graphCurrency, setGraphCurrency] = useState<AuctionCurrency>('DONATE');
  const [idMode, setIdMode] = useState<AuctionItemIdMode>('raw');
  const [commandPlayer, setCommandPlayer] = useState('@p');
  const [graphStartLocal] = useState(() => localDateTimeInputFromUtcMs(now, defaultTimezoneOffset()));
  const [auctions, setAuctions] = useState<AuctionDraft[]>(() => [createAuction(1, localDateTimeInputFromUtcMs(now + 86_400_000, defaultTimezoneOffset()))]);
  const [selectedAuctionId, setSelectedAuctionId] = useState('1');
  const [curve, setCurve] = useState<AuctionCurve>(() => createDefaultAuctionCurve());
  const [itemSearch, setItemSearch] = useState('');
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [filenameDraft, setFilenameDraft] = useState(() => `auctions_${localDateTimeInputFromUtcMs(now, defaultTimezoneOffset()).replace(/[-:T]/g, '')}`);

  const selectedAuction = auctions.find((auction) => auction.id === selectedAuctionId) ?? auctions[0];
  const commands = useMemo(() => buildAuctionCommands({ auctions, curve, idMode, timezoneOffsetMinutes: timezoneOffset, commandPlayer, graphStartLocal }), [auctions, curve, idMode, timezoneOffset, commandPlayer, graphStartLocal]);
  const activeGraphDays = useMemo(() => auctions.filter((auction) => auction.currency === graphCurrency).flatMap((auction) => {
    const repeats = auction.repeatEnabled ? Math.max(1, auction.repeatCount) : 1;
    return Array.from({ length: repeats }, (_, index) => dayIndexFromStart(index === 0 ? auction.startLocal : addDaysToLocalDateTime(auction.startLocal, auction.repeatEveryDays * index), graphStartLocal));
  }), [auctions, graphCurrency, graphStartLocal]);
  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    if (!query) return itemOptions.slice(0, 80);
    return itemOptions.filter((item) => `${item.raw} ${item.title} ${item.legacyId ?? ''}`.toLowerCase().includes(query)).slice(0, 120);
  }, [itemOptions, itemSearch]);
  const nbtSkippedCount = auctions.flatMap((auction) => auction.items).filter((item) => item.hasNbt).length;

  const updateAuction = (id: string, patch: Partial<AuctionDraft>) => {
    setAuctions((current) => current.map((auction) => auction.id === id ? { ...auction, ...patch } : auction));
  };

  const addAuction = () => {
    const nextIndex = auctions.length + 1;
    const next = createAuction(nextIndex, localDateTimeInputFromUtcMs(now + nextIndex * 86_400_000, timezoneOffset));
    setAuctions((current) => [...current, next].slice(0, 90));
    setSelectedAuctionId(next.id);
  };

  const addItemToAuction = (option: AuctionItemOption) => {
    if (!selectedAuction) return;
    const item: AuctionLotItem = { ...option, uid: `${option.raw}-${Date.now()}-${Math.random().toString(36).slice(2)}`, quantity: 1 };
    updateAuction(selectedAuction.id, { items: [...selectedAuction.items, item] });
  };

  const updateLotItem = (uid: string, patch: Partial<AuctionLotItem>) => {
    if (!selectedAuction) return;
    updateAuction(selectedAuction.id, { items: selectedAuction.items.map((item) => item.uid === uid ? { ...item, ...patch } : item) });
  };

  const removeLotItem = (uid: string) => {
    if (!selectedAuction) return;
    updateAuction(selectedAuction.id, { items: selectedAuction.items.filter((item) => item.uid !== uid) });
  };

  return (
    <div className="auction-builder">
      <div className="auction-builder-toolbar">
        <div className="auction-mode-tabs" aria-label="auction-builder-mode">
          <button type="button" className={mode === 'config' ? 'active' : ''} onClick={() => setMode('config')}>Конфиги и графики</button>
          <button type="button" className={mode === 'items' ? 'active' : ''} onClick={() => setMode('items')}>Предметы и файл</button>
        </div>
        <div className="inline-actions">
          <label className="field-block compact-field">
            <span>Часовой пояс</span>
            <select value={timezoneOffset} onChange={(event) => setTimezoneOffset(Number(event.target.value))}>
              {Array.from({ length: 27 }, (_, index) => (index - 12) * 60).map((offset) => <option key={offset} value={offset}>{timezoneLabel(offset)}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => setDownloadModalOpen(true)}>Скачать файл команд</button>
        </div>
      </div>

      <div className="auction-layout">
        <Panel title="План аукционов" subtitle="По умолчанию горизонт ограничен 3 месяцами">
          <div className="auction-list">
            {auctions.map((auction) => (
              <button key={auction.id} type="button" className={`auction-card ${selectedAuction?.id === auction.id ? 'active' : ''}`.trim()} onClick={() => setSelectedAuctionId(auction.id)}>
                <strong>{auction.name}</strong>
                <span>{auction.currency} · {auction.startLocal.replace('T', ' ')}</span>
                {auction.repeatEnabled ? <span>Повтор: {auction.repeatCount} раз, каждые {auction.repeatEveryDays} дн.</span> : null}
              </button>
            ))}
            <button type="button" className="secondary-button" onClick={addAuction}>Добавить аукцион</button>
          </div>
        </Panel>

        {selectedAuction && mode === 'config' ? (
          <Panel title="Настройка аукциона" subtitle="График меняет цены в день запуска аукциона">
            <div className="auction-form-grid">
              <label className="field-block"><span>ID аукциона</span><input value={selectedAuction.id} onChange={(event) => updateAuction(selectedAuction.id, { id: event.target.value })} /></label>
              <label className="field-block"><span>Валюта</span><select value={selectedAuction.currency} onChange={(event) => updateAuction(selectedAuction.id, { currency: event.target.value as AuctionCurrency })}>{auctionCurrencies.map((currency) => <option key={currency} value={currency}>{currency} · {auctionCurrencyLabels[currency]}</option>)}</select></label>
              <label className="field-block wide"><span>Название</span><input value={selectedAuction.name} onChange={(event) => updateAuction(selectedAuction.id, { name: event.target.value })} /></label>
              <label className="field-block wide"><span>Описание</span><input value={selectedAuction.description} onChange={(event) => updateAuction(selectedAuction.id, { description: event.target.value })} /></label>
              <label className="field-block"><span>Старт</span><input type="datetime-local" value={selectedAuction.startLocal} onChange={(event) => updateAuction(selectedAuction.id, { startLocal: event.target.value })} /></label>
              <label className="field-block"><span>Длительность, мин</span><input type="number" min={1} value={selectedAuction.durationMinutes} onChange={(event) => updateAuction(selectedAuction.id, { durationMinutes: Number(event.target.value) })} /></label>
              <label className="field-block"><span>Стартовая цена</span><input type="number" min={1} value={selectedAuction.baseStartPrice} onChange={(event) => updateAuction(selectedAuction.id, { baseStartPrice: Number(event.target.value) })} /></label>
              <label className="field-block"><span>Шаг ставки</span><input type="number" min={1} value={selectedAuction.baseStepPrice} onChange={(event) => updateAuction(selectedAuction.id, { baseStepPrice: Number(event.target.value) })} /></label>
              <label className="field-block switch-field"><span>Плановый запуск</span><input type="checkbox" checked={selectedAuction.planned} onChange={(event) => updateAuction(selectedAuction.id, { planned: event.target.checked })} /></label>
              <label className="field-block switch-field"><span>Повторять</span><input type="checkbox" checked={selectedAuction.repeatEnabled} onChange={(event) => updateAuction(selectedAuction.id, { repeatEnabled: event.target.checked })} /></label>
              <label className="field-block"><span>Повторов</span><input type="number" min={1} max={90} value={selectedAuction.repeatCount} onChange={(event) => updateAuction(selectedAuction.id, { repeatCount: Number(event.target.value) })} /></label>
              <label className="field-block"><span>Интервал, дней</span><input type="number" min={1} value={selectedAuction.repeatEveryDays} onChange={(event) => updateAuction(selectedAuction.id, { repeatEveryDays: Number(event.target.value) })} /></label>
            </div>
            <div className="auction-toolbar-row">
              <label className="field-block compact-field"><span>График</span><select value={graphCurrency} onChange={(event) => setGraphCurrency(event.target.value as AuctionCurrency)}>{auctionCurrencies.map((currency) => <option key={currency} value={currency}>{auctionCurrencyLabels[currency]}</option>)}</select></label>
              <span>Тащи точку вверх/вниз: множитель меняет цену всех аукционов этой валюты в этот день.</span>
            </div>
            <AuctionPriceGraph
              values={curve[graphCurrency]}
              activeDays={activeGraphDays}
              onChangeDay={(day, value) => setCurve((current) => ({ ...current, [graphCurrency]: current[graphCurrency].map((item, index) => index === day ? value : item) }))}
            />
          </Panel>
        ) : null}

        {selectedAuction && mode === 'items' ? (
          <>
            <Panel title="Предметы аукциона" subtitle="NBT предметы видны, но не попадут в файл команд">
              <div className="auction-toolbar-row">
                <div className="auction-id-mode">
                  <button type="button" className={idMode === 'raw' ? 'active' : ''} onClick={() => setIdMode('raw')}>mod:item + meta</button>
                  <button type="button" className={idMode === 'legacy' ? 'active' : ''} onClick={() => setIdMode('legacy')}>id:meta</button>
                </div>
                <label className="field-block compact-field"><span>Игрок выдачи</span><input value={commandPlayer} onChange={(event) => setCommandPlayer(event.target.value)} /></label>
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
                    <div className="inline-actions">
                      <input aria-label={`auction-item-qty-${item.uid}`} type="number" min={1} value={item.quantity} onChange={(event) => updateLotItem(item.uid, { quantity: Number(event.target.value) })} />
                      <button type="button" className="ghost-button" onClick={() => removeLotItem(item.uid)}>Удалить</button>
                    </div>
                  </div>
                ))}
                {!selectedAuction.items.length ? <div className="inline-hint">Выбери предмет из списка NEI справа.</div> : null}
              </div>
              {nbtSkippedCount ? <div className="inline-status inline-status-warning">NBT предметов будет пропущено при генерации: {nbtSkippedCount}</div> : null}
            </Panel>
            <Panel title="NEI предметы" subtitle="Поиск и добавление в аукцион">
              <input aria-label="auction-item-search" type="search" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Поиск предмета, mod:item или ID" />
              <div className="auction-item-picker">
                {filteredItems.map((item) => (
                  <button key={`${item.raw}-${item.legacyId ?? 'x'}-${item.meta}`} type="button" className="auction-picker-row" onClick={() => addItemToAuction(item)}>
                    <span className="auction-item-icon">{renderItemIcon(item)}</span>
                    <span><strong>{item.title}</strong><br /><small>{item.raw}</small></span>
                    {item.hasNbt ? <span className="auction-warning">!</span> : null}
                  </button>
                ))}
              </div>
            </Panel>
          </>
        ) : null}
      </div>

      <Panel title="Предпросмотр файла" subtitle="Файл скачивается без расширения">
        <pre className="raw-block auction-command-preview">{commands || 'Команды появятся после настройки аукциона.'}</pre>
      </Panel>

      {downloadModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setDownloadModalOpen(false)}>
          <form
            className="modal cloud-save-modal"
            role="dialog"
            aria-modal="true"
            aria-label="auction-download-file"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              downloadTextWithoutExtension(filenameDraft, commands);
              setDownloadModalOpen(false);
            }}
          >
            <div className="modal-header">
              <div>
                <h2>Скачать файл команд</h2>
                <span className="modal-subtitle">Расширение не добавляется: итоговый файл будет без .txt.</span>
              </div>
              <button type="button" className="ghost-button" onClick={() => setDownloadModalOpen(false)}>Закрыть</button>
            </div>
            <div className="settings-modal-body">
              <label className="field-block">
                <span>Имя файла</span>
                <input autoFocus value={filenameDraft} onChange={(event) => setFilenameDraft(event.target.value)} />
              </label>
              <div className="cloud-save-preview"><span>Итог</span><strong>{sanitizeAuctionFilename(filenameDraft)}</strong></div>
              <div className="inline-actions cloud-save-actions">
                <button type="button" className="ghost-button" onClick={() => setDownloadModalOpen(false)}>Отмена</button>
                <button type="submit" disabled={!commands.trim()}>Скачать</button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
