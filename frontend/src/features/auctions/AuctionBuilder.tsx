import { useMemo, useState, type ReactNode } from 'react';
import { Panel } from '../../components/Panel';
import {
  addDaysToLocalDateTime,
  auctionCurrencies,
  auctionCurrencyLabels,
  buildAuctionCommandStages,
  createDefaultAuctionCurve,
  dayIndexFromStart,
  localDateTimeInputFromUtcMs,
  sanitizeAuctionFilename
} from './auctionCommands';
import { AuctionHelpTip } from './AuctionHelpTip';
import { AuctionPlanPanel } from './AuctionPlanPanel';
import { AuctionPriceGraph } from './AuctionPriceGraph';
import type { AuctionBuilderMode, AuctionCommandStage, AuctionCurrency, AuctionCurve, AuctionDraft, AuctionItemIdMode, AuctionItemOption, AuctionLotItem, AuctionRenderItemIcon, AuctionWorkflowMode } from './auctionTypes';
import './AuctionBuilder.css';

type AuctionBuilderProps = {
  itemOptions: AuctionItemOption[];
  renderItemIcon: AuctionRenderItemIcon;
};

function HelpLabel({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="auction-help-label">
      {text}
      <AuctionHelpTip label={`Подсказка: ${text}`}>{children}</AuctionHelpTip>
    </span>
  );
}

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
    serverIds: {},
    name: `Аукцион ${index}`,
    description: '',
    startLocal,
    durationMinutes: 10,
    currency: 'DONATE',
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
  const [workflowMode, setWorkflowMode] = useState<AuctionWorkflowMode>('install');
  const [mode, setMode] = useState<AuctionBuilderMode>('config');
  const [commandStage, setCommandStage] = useState<AuctionCommandStage>('create');
  const [timezoneOffset, setTimezoneOffset] = useState(defaultTimezoneOffset());
  const [graphCurrency, setGraphCurrency] = useState<AuctionCurrency>('DONATE');
  const [idMode, setIdMode] = useState<AuctionItemIdMode>('raw');
  const [commandPlayer, setCommandPlayer] = useState('@p');
  const [graphStartLocal] = useState(() => localDateTimeInputFromUtcMs(now, defaultTimezoneOffset()));
  const [auctions, setAuctions] = useState<AuctionDraft[]>(() => [createAuction(1, localDateTimeInputFromUtcMs(now + 86_400_000, defaultTimezoneOffset()))]);
  const [selectedAuctionId, setSelectedAuctionId] = useState('1');
  const [curve, setCurve] = useState<AuctionCurve>(() => createDefaultAuctionCurve());
  const [itemSearch, setItemSearch] = useState('');
  const [maxItemsPerAuction, setMaxItemsPerAuction] = useState(4);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [filenameDraft, setFilenameDraft] = useState(() => `auctions_${localDateTimeInputFromUtcMs(now, defaultTimezoneOffset()).replace(/[-:T]/g, '')}`);

  const selectedAuction = auctions.find((auction) => auction.id === selectedAuctionId) ?? auctions[0];
  const commandStages = useMemo(() => buildAuctionCommandStages({ auctions, curve, idMode, timezoneOffsetMinutes: timezoneOffset, commandPlayer, graphStartLocal, workflowMode }), [auctions, curve, idMode, timezoneOffset, commandPlayer, graphStartLocal, workflowMode]);
  const commands = commandStages[commandStage];
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
  const selectedAuctionFull = selectedAuction ? selectedAuction.items.length >= maxItemsPerAuction : false;

  const updateAuction = (id: string, patch: Partial<AuctionDraft>) => {
    setAuctions((current) => current.map((auction) => auction.id === id ? { ...auction, ...patch } : auction));
  };

  const renameAuction = (id: string, nextId: string) => {
    setAuctions((current) => current.map((auction) => auction.id === id ? { ...auction, id: nextId } : auction));
    setSelectedAuctionId(nextId);
  };

  const updateServerId = (id: string, runIndex: number, serverId: string) => {
    const auction = auctions.find((item) => item.id === id);
    if (!auction) return;
    updateAuction(id, { serverIds: { ...auction.serverIds, [String(runIndex)]: serverId } });
  };

  const addAuction = () => {
    const nextIndex = auctions.length + 1;
    const next = createAuction(nextIndex, localDateTimeInputFromUtcMs(now + nextIndex * 86_400_000, timezoneOffset));
    setAuctions((current) => [...current, next].slice(0, 90));
    setSelectedAuctionId(next.id);
  };

  const addItemToAuction = (option: AuctionItemOption) => {
    if (!selectedAuction) return;
    if (selectedAuction.items.length >= maxItemsPerAuction) return;
    const item: AuctionLotItem = { ...option, uid: `${option.raw}-${Date.now()}-${Math.random().toString(36).slice(2)}`, quantity: 1, basePrice: 100 };
    updateAuction(selectedAuction.id, { items: [...selectedAuction.items, item] });
  };

  const updateMaxItemsPerAuction = (value: number) => {
    const normalized = Math.max(1, Math.min(27, Math.round(Number.isFinite(value) ? value : 1)));
    setMaxItemsPerAuction(normalized);
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
        <div className="auction-mode-stack">
          <div className="auction-mode-tabs" aria-label="auction-workflow-mode">
            <button type="button" title="Для новых аукционов: сначала создаём пустые слоты, потом вписываем ID, затем добавляем предметы и настройки." className={workflowMode === 'install' ? 'active' : ''} onClick={() => { setWorkflowMode('install'); setCommandStage('create'); }}>Установка новых</button>
            <button type="button" title="Для уже созданных аукционов: создание слотов пропускается, работа начинается с ввода серверных ID." className={workflowMode === 'existing' ? 'active' : ''} onClick={() => { setWorkflowMode('existing'); setCommandStage('ids'); }}>Настройка существующих</button>
          </div>
          <div className="auction-mode-tabs" aria-label="auction-builder-mode">
            <button type="button" className={mode === 'config' ? 'active' : ''} onClick={() => setMode('config')}>Конфиги и графики</button>
            <button type="button" className={mode === 'items' ? 'active' : ''} onClick={() => setMode('items')}>Предметы и файл</button>
          </div>
        </div>
        <div className="inline-actions">
          <label className="field-block compact-field">
            <HelpLabel text="Часовой пояс">
              Выбирает локальный часовой пояс, в котором ты задаёшь дату старта. В файл команды попадут в UTC+0, как требует серверная команда.
              Пример: если старт 10.07.2026 20:00 в UTC+03:00, в команде будет 10.07.2026_17:00.
            </HelpLabel>
            <select value={timezoneOffset} onChange={(event) => setTimezoneOffset(Number(event.target.value))}>
              {Array.from({ length: 27 }, (_, index) => (index - 12) * 60).map((offset) => <option key={offset} value={offset}>{timezoneLabel(offset)}</option>)}
            </select>
          </label>
          <button type="button" title="Открывает окно имени файла и скачивает текущий выбранный шаг команд без расширения .txt." onClick={() => setDownloadModalOpen(true)}>Скачать файл команд</button>
        </div>
      </div>

      <div className="auction-layout">
        <AuctionPlanPanel
          auctions={auctions}
          selectedAuctionId={selectedAuctionId}
          maxItemsPerAuction={maxItemsPerAuction}
          renderItemIcon={renderItemIcon}
          onSelectAuction={setSelectedAuctionId}
          onAddAuction={addAuction}
          onMaxItemsChange={updateMaxItemsPerAuction}
        />

        {selectedAuction && mode === 'config' ? (
          <Panel
            title="Настройка аукциона"
            subtitle="График меняет процент цены предметов в день запуска аукциона"
            actions={(
              <AuctionHelpTip label="Подсказка: Настройка аукциона">
                Это настройки выбранной локальной заготовки: дата, длительность, валюта, повторы и серверные ID.
                Цены предметов задаются во вкладке “Предметы и файл”, а график здесь меняет их процентом по дню запуска.
              </AuctionHelpTip>
            )}
          >
            <div className="auction-form-grid">
              <label className="field-block"><HelpLabel text="Локальная метка">Внутреннее имя заготовки внутри сайта. Это не ID сервера и не попадает в `/aca addItem`. Нужно только чтобы различать строки до того, как сервер выдаст настоящий ID. Пример: `donate_july_01`.</HelpLabel><input value={selectedAuction.id} onChange={(event) => renameAuction(selectedAuction.id, event.target.value)} /></label>
              <label className="field-block"><HelpLabel text="Валюта">Валюта аукциона. От неё зависит, какой график процента будет применён: кубиксы, кристаллы или бонусы.</HelpLabel><select value={selectedAuction.currency} onChange={(event) => updateAuction(selectedAuction.id, { currency: event.target.value as AuctionCurrency })}>{auctionCurrencies.map((currency) => <option key={currency} value={currency}>{currency} · {auctionCurrencyLabels[currency]}</option>)}</select></label>
              <label className="field-block wide"><HelpLabel text="Название">Название, которое будет отправлено в команду настройки аукциона. Пример: “Июльский набор кристаллов”.</HelpLabel><input value={selectedAuction.name} onChange={(event) => updateAuction(selectedAuction.id, { name: event.target.value })} /></label>
              <label className="field-block wide"><HelpLabel text="Описание">Дополнительный текст для аукциона. Если поле пустое, команда описания не будет добавлена.</HelpLabel><input value={selectedAuction.description} onChange={(event) => updateAuction(selectedAuction.id, { description: event.target.value })} /></label>
              <label className="field-block"><HelpLabel text="Старт">Локальная дата и время запуска. Эта дата выбирает точку на графике, поэтому процент цены берётся именно для этого дня.</HelpLabel><input type="datetime-local" value={selectedAuction.startLocal} onChange={(event) => updateAuction(selectedAuction.id, { startLocal: event.target.value })} /></label>
              <label className="field-block"><HelpLabel text="Длительность, мин">Сколько минут аукцион будет активен. Конец считается автоматически: старт плюс длительность.</HelpLabel><input type="number" min={1} value={selectedAuction.durationMinutes} onChange={(event) => updateAuction(selectedAuction.id, { durationMinutes: Number(event.target.value) })} /></label>
              <label className="field-block"><HelpLabel text="Шаг ставки">Базовый шаг повышения ставки. Он тоже умножается на процент графика для даты запуска. Пример: шаг 10 и график +25% дадут 13.</HelpLabel><input type="number" min={1} value={selectedAuction.baseStepPrice} onChange={(event) => updateAuction(selectedAuction.id, { baseStepPrice: Number(event.target.value) })} /></label>
              <label className="field-block switch-field"><HelpLabel text="Плановый запуск">Если включено, аукцион остаётся в SETUP и добавляется команда расписания. Если выключено, используется выбранное состояние запуска.</HelpLabel><input type="checkbox" checked={selectedAuction.planned} onChange={(event) => updateAuction(selectedAuction.id, { planned: event.target.checked })} /></label>
              <label className="field-block switch-field"><HelpLabel text="Повторять">Создаёт несколько запусков этой же заготовки. Для каждого запуска сервер выдаст отдельный ID, и каждый ID нужно вписать в шаге 2.</HelpLabel><input type="checkbox" checked={selectedAuction.repeatEnabled} onChange={(event) => updateAuction(selectedAuction.id, { repeatEnabled: event.target.checked })} /></label>
              <label className="field-block"><HelpLabel text="Повторов">Количество запусков в пределах 3 месяцев. Пример: 4 повтора с интервалом 7 дней создадут 4 строки ID.</HelpLabel><input type="number" min={1} max={90} value={selectedAuction.repeatCount} onChange={(event) => updateAuction(selectedAuction.id, { repeatCount: Number(event.target.value) })} /></label>
              <label className="field-block"><HelpLabel text="Интервал, дней">Через сколько дней повторяется запуск. Пример: старт 10.07 и интервал 30 дней даст следующий запуск 09.08.</HelpLabel><input type="number" min={1} value={selectedAuction.repeatEveryDays} onChange={(event) => updateAuction(selectedAuction.id, { repeatEveryDays: Number(event.target.value) })} /></label>
            </div>
            <section className="auction-server-id-section">
              <div className="settings-section-title compact">
                <h3>
                  Шаг 2: ID с сервера
                  <AuctionHelpTip label="Подсказка: ID с сервера">
                    Серверный ID появляется только после выполнения команды `/aca create`. Его нужно скопировать из ответа сервера и вписать сюда.
                    Пример: сервер выдал `27`, значит команды предметов будут использовать `/aca addItem 27`.
                  </AuctionHelpTip>
                </h3>
                <span>После выполнения `/aca create` сервер выдаст ID. Впиши его сюда для каждого запуска.</span>
              </div>
              <div className="auction-server-id-grid">
                {Array.from({ length: selectedAuction.repeatEnabled ? Math.max(1, selectedAuction.repeatCount) : 1 }, (_, index) => (
                  <label key={index} className="field-block">
                    <HelpLabel text={index === 0 ? selectedAuction.name : `${selectedAuction.name} #${index + 1}`}>
                      Поле для настоящего ID, который сгенерировал сервер. Для повторов каждый запуск получает свой отдельный ID.
                    </HelpLabel>
                    <input
                      value={selectedAuction.serverIds[String(index)] ?? ''}
                      onChange={(event) => updateServerId(selectedAuction.id, index, event.target.value)}
                      placeholder="ID, который выдал сервер"
                    />
                  </label>
                ))}
              </div>
              {commandStages.missingServerIds.length ? <div className="inline-hint inline-hint-warning">Без этих ID шаги предметов и настроек будут пропущены: {commandStages.missingServerIds.join(', ')}</div> : null}
            </section>
            <div className="auction-toolbar-row">
              <label className="field-block compact-field"><HelpLabel text="График">Выбирает валюту графика. Точки на графике меняют процент цены для всех предметов этой валюты в день запуска.</HelpLabel><select value={graphCurrency} onChange={(event) => setGraphCurrency(event.target.value as AuctionCurrency)}>{auctionCurrencies.map((currency) => <option key={currency} value={currency}>{auctionCurrencyLabels[currency]}</option>)}</select></label>
              <span>Тащи точку вверх/вниз: процент меняет цены всех предметов этой валюты в этот день.</span>
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
            <Panel
              title="Предметы аукциона"
              subtitle="NBT предметы видны, но не попадут в файл команд"
              actions={(
                <AuctionHelpTip label="Подсказка: Предметы аукциона">
                  Здесь собирается содержимое выбранного аукциона. Каждый предмет имеет количество и базовую цену.
                  Итоговая стартовая цена аукциона = сумма цен предметов без NBT, умноженная на процент графика для даты запуска.
                </AuctionHelpTip>
              )}
            >
              <div className="auction-toolbar-row">
                <div className="auction-id-mode">
                  <button type="button" title="В командах /give будет использоваться буквенный ID предмета и meta, например minecraft:stone 1." className={idMode === 'raw' ? 'active' : ''} onClick={() => setIdMode('raw')}>mod:item + meta</button>
                  <button type="button" title="В командах /give будет использоваться числовой legacy ID и meta, например 1 0." className={idMode === 'legacy' ? 'active' : ''} onClick={() => setIdMode('legacy')}>id:meta</button>
                </div>
                <label className="field-block compact-field"><HelpLabel text="Игрок выдачи">Кому временно выдаётся предмет перед добавлением в аукцион. Обычно `@p`, но можно вписать ник администратора.</HelpLabel><input value={commandPlayer} onChange={(event) => setCommandPlayer(event.target.value)} /></label>
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
                        <input aria-label={`auction-item-qty-${item.uid}`} type="number" min={1} value={item.quantity} onChange={(event) => updateLotItem(item.uid, { quantity: Number(event.target.value) })} />
                      </label>
                      <label className="field-block compact-field">
                        <HelpLabel text="Цена">Базовая цена именно этого предмета до графика. Пример: предмет стоит 2000, а график на дату +25%, значит в расчёте будет 2500.</HelpLabel>
                        <input aria-label={`auction-item-price-${item.uid}`} type="number" min={0} value={item.basePrice} onChange={(event) => updateLotItem(item.uid, { basePrice: Number(event.target.value) })} />
                      </label>
                      <button type="button" className="ghost-button" title="Убирает предмет из текущей локальной заготовки аукциона." onClick={() => removeLotItem(item.uid)}>Удалить</button>
                    </div>
                  </div>
                ))}
                {!selectedAuction.items.length ? <div className="inline-hint">Выбери предмет из списка NEI справа.</div> : null}
                {selectedAuctionFull ? <div className="inline-status inline-status-warning">Лимит предметов для этого аукциона заполнен: {selectedAuction.items.length}/{maxItemsPerAuction}</div> : null}
              </div>
              {nbtSkippedCount ? <div className="inline-status inline-status-warning">NBT предметов будет пропущено при генерации: {nbtSkippedCount}</div> : null}
            </Panel>
            <Panel
              title="NEI предметы"
              subtitle="Поиск и добавление в аукцион"
              actions={(
                <AuctionHelpTip label="Подсказка: NEI предметы">
                  Это список предметов из каталога NEI. Нажатие добавляет предмет в текущий аукцион визуально.
                  Если у предмета есть NBT, он будет помечен восклицательным знаком и не попадёт в файл команд.
                </AuctionHelpTip>
              )}
            >
              <input aria-label="auction-item-search" title="Ищи по названию, raw ID вроде minecraft:diamond или legacy ID." type="search" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Поиск предмета, mod:item или ID" />
              <div className="auction-item-picker">
                {filteredItems.map((item) => (
                  <button
                    key={`${item.raw}-${item.legacyId ?? 'x'}-${item.meta}`}
                    type="button"
                    title={selectedAuctionFull ? 'Лимит предметов в этом аукционе уже заполнен.' : item.hasNbt ? 'NBT-предмет добавится только визуально и будет исключён из команд.' : 'Добавить этот предмет в выбранный аукцион.'}
                    className="auction-picker-row"
                    disabled={selectedAuctionFull}
                    onClick={() => addItemToAuction(item)}
                  >
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

      <Panel
        title="Предпросмотр файла"
        subtitle="Файл скачивается без расширения"
        actions={(
          <AuctionHelpTip label="Подсказка: Предпросмотр файла">
            Здесь показывается выбранный шаг команд. Скачивание сохраняет именно активный шаг: создание слотов, список ID, добавление предметов или финальную настройку.
            Для полного процесса выполняй шаги по порядку.
          </AuctionHelpTip>
        )}
      >
        <div className="auction-step-tabs" aria-label="auction-command-stage">
          {workflowMode === 'install' ? <button type="button" title="Команды /aca create создают пустые серверные аукционы. После этого сервер выдаст ID." className={commandStage === 'create' ? 'active' : ''} onClick={() => setCommandStage('create')}>1. Создать слоты</button> : null}
          <button type="button" title="Шпаргалка, куда вписать ID, которые сервер выдал после создания слотов." className={commandStage === 'ids' ? 'active' : ''} onClick={() => setCommandStage('ids')}>2. Выписать ID</button>
          <button type="button" title="Команды /clear, /give и /aca addItem для добавления предметов в уже известные серверные ID." className={commandStage === 'items' ? 'active' : ''} onClick={() => setCommandStage('items')}>3. Закинуть предметы</button>
          <button type="button" title="Команды финальной настройки: название, даты, валюта, цена, шаг ставки, состояние и расписание." className={commandStage === 'settings' ? 'active' : ''} onClick={() => setCommandStage('settings')}>4. Настроить и запустить</button>
        </div>
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
                <HelpLabel text="Имя файла">
                  Имя итогового файла команд. Расширение удаляется автоматически, даже если вписать `.txt`.
                  Пример: `auction_step_3` скачается как файл без расширения.
                </HelpLabel>
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
