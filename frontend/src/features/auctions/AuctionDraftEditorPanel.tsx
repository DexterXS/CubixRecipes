import { Panel } from '../../components/Panel';
import {
  auctionCurrencies,
  auctionCurrencyLabels,
  type AuctionRunPricePreview
} from './auctionCommands';
import { AuctionPriceGraph, type AuctionPriceGraphPointDetail, type AuctionPriceGraphRepeatMarker } from './AuctionPriceGraph';
import { AuctionRunPricePreviewList } from './AuctionRunPricePreviewList';
import type { AuctionCurrency, AuctionDraft } from './auctionTypes';

type AuctionDraftEditorPanelProps = {
  auction: AuctionDraft;
  graphCurrency: AuctionCurrency;
  graphValues: number[];
  graphActiveDays: number[];
  graphPointDetails: Record<number, AuctionPriceGraphPointDetail[]>;
  graphRepeatMarkers: AuctionPriceGraphRepeatMarker[];
  graphRunPricePreviews: AuctionRunPricePreview[];
  shouldRenderPriceGraph: boolean;
  missingServerIds: string[];
  onRenameAuction: (id: string, nextId: string) => void;
  onUpdateAuction: (id: string, patch: Partial<AuctionDraft>) => void;
  onUpdateServerId: (id: string, runIndex: number, serverId: string) => void;
  onGraphCurrencyChange: (currency: AuctionCurrency) => void;
  onGraphDayChange: (day: number, value: number) => void;
  onOpenGraph: () => void;
};

export function AuctionDraftEditorPanel({
  auction,
  graphCurrency,
  graphValues,
  graphActiveDays,
  graphPointDetails,
  graphRepeatMarkers,
  graphRunPricePreviews,
  shouldRenderPriceGraph,
  missingServerIds,
  onRenameAuction,
  onUpdateAuction,
  onUpdateServerId,
  onGraphCurrencyChange,
  onGraphDayChange,
  onOpenGraph
}: AuctionDraftEditorPanelProps) {
  const repeatRuns = auction.repeatEnabled ? Math.max(1, auction.repeatCount) : 1;

  return (
    <Panel
      title="Настройка выбранного аукциона"
      subtitle="Локальная заготовка: серверные ID появятся только после выполнения /aca create."
    >
      <div className="auction-form-grid">
        <label className="field-block">
          <span>Локальная метка</span>
          <input value={auction.id} onChange={(event) => onRenameAuction(auction.id, event.target.value)} />
        </label>
        <label className="field-block">
          <span>Валюта</span>
          <select value={auction.currency} onChange={(event) => onUpdateAuction(auction.id, { currency: event.target.value as AuctionCurrency })}>
            {auctionCurrencies.map((currency) => <option key={currency} value={currency}>{currency} · {auctionCurrencyLabels[currency]}</option>)}
          </select>
        </label>
        <label className="field-block wide">
          <span>Название</span>
          <input value={auction.name} onChange={(event) => onUpdateAuction(auction.id, { name: event.target.value })} />
        </label>
        <label className="field-block wide">
          <span>Описание</span>
          <input value={auction.description} onChange={(event) => onUpdateAuction(auction.id, { description: event.target.value })} />
        </label>
        <label className="field-block">
          <span>Старт</span>
          <input type="datetime-local" value={auction.startLocal} onChange={(event) => onUpdateAuction(auction.id, { startLocal: event.target.value })} />
        </label>
        <label className="field-block">
          <span>Длительность, мин</span>
          <input type="number" min={1} value={auction.durationMinutes} onChange={(event) => onUpdateAuction(auction.id, { durationMinutes: Number(event.target.value) })} />
        </label>
        <label className="field-block">
          <span>Шаг ставки</span>
          <input type="number" min={1} value={auction.baseStepPrice} onChange={(event) => onUpdateAuction(auction.id, { baseStepPrice: Number(event.target.value) })} />
        </label>
        <label className="field-block switch-field">
          <span>Плановый запуск</span>
          <input type="checkbox" checked={auction.planned} onChange={(event) => onUpdateAuction(auction.id, { planned: event.target.checked })} />
        </label>
        <label className="field-block switch-field">
          <span>Повторять</span>
          <input type="checkbox" checked={auction.repeatEnabled} onChange={(event) => onUpdateAuction(auction.id, { repeatEnabled: event.target.checked })} />
        </label>
        <label className="field-block">
          <span>Повторов</span>
          <input type="number" min={1} max={90} value={auction.repeatCount} onChange={(event) => onUpdateAuction(auction.id, { repeatCount: Number(event.target.value) })} />
        </label>
        <label className="field-block">
          <span>Интервал, дней</span>
          <input type="number" min={1} value={auction.repeatEveryDays} onChange={(event) => onUpdateAuction(auction.id, { repeatEveryDays: Number(event.target.value) })} />
        </label>
      </div>

      <section className="auction-server-id-section">
        <div className="settings-section-title compact">
          <h3>Шаг 2: ID с сервера</h3>
          <span>После /aca create сервер выдаст ID. Впиши его сюда для каждого запуска, чтобы разблокировать команды предметов и настройки.</span>
        </div>
        <div className="auction-server-id-grid">
          {Array.from({ length: repeatRuns }, (_, index) => (
            <label key={index} className="field-block">
              <span>{index === 0 ? auction.name : `${auction.name} #${index + 1}`}</span>
              <input
                value={auction.serverIds[String(index)] ?? ''}
                onChange={(event) => onUpdateServerId(auction.id, index, event.target.value)}
                placeholder="ID, который выдал сервер"
              />
            </label>
          ))}
        </div>
        {missingServerIds.length ? <div className="inline-hint inline-hint-warning">Без этих ID шаги предметов и настроек будут пропущены: {missingServerIds.join(', ')}</div> : null}
      </section>

      <div className="auction-toolbar-row">
        <label className="field-block compact-field">
          <span>График</span>
          <select value={graphCurrency} onChange={(event) => onGraphCurrencyChange(event.target.value as AuctionCurrency)}>
            {auctionCurrencies.map((currency) => <option key={currency} value={currency}>{auctionCurrencyLabels[currency]}</option>)}
          </select>
        </label>
        <span>График меняет множитель цены для выбранной валюты и дня запуска.</span>
      </div>
      {shouldRenderPriceGraph ? (
        <>
          <AuctionPriceGraph
            values={graphValues}
            activeDays={graphActiveDays}
            pointDetails={graphPointDetails}
            repeatMarkers={graphRepeatMarkers}
            onChangeDay={onGraphDayChange}
          />
          <AuctionRunPricePreviewList previews={graphRunPricePreviews} />
        </>
      ) : (
        <div className="inline-hint auction-graph-lazy-note">
          График не строится автоматически в обычном режиме. Это ускоряет работу с папками; открой график только когда нужно менять множители.
          <button type="button" className="secondary-button" onClick={onOpenGraph}>Открыть график</button>
        </div>
      )}
    </Panel>
  );
}
