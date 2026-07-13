import { auctionCurrencies } from './auctionCommands';
import type { ReactNode } from 'react';
import type { AuctionBuilderMode, AuctionCommandStage, AuctionCurrency, AuctionDayFolder, AuctionPriceMode, AuctionUiMode, AuctionWorkflowMode } from './auctionTypes';
import './AuctionRibbon.css';

export type AuctionRibbonTab = 'home' | 'auctions' | 'items' | 'commands' | 'graphs' | 'templates' | 'view' | 'tools';

type AuctionRibbonProps = {
  activeTab: AuctionRibbonTab;
  selectedFolder: AuctionDayFolder | undefined;
  uiMode: AuctionUiMode;
  workflowMode: AuctionWorkflowMode;
  timezoneOffset: number;
  onTabChange: (tab: AuctionRibbonTab) => void;
  onUiModeChange: (mode: AuctionUiMode) => void;
  onWorkflowModeChange: (mode: AuctionWorkflowMode) => void;
  onNewDay: () => void;
  onCopyDay: () => void;
  onDeleteDay: () => void;
  onCurrencyChange: (currency: AuctionCurrency) => void;
  onDurationChange: (minutes: number) => void;
  onStepPriceChange: (step: number) => void;
  onTimezoneOffsetChange: (offset: number) => void;
  onPriceModeChange: (mode: AuctionPriceMode) => void;
  onApplyDayDefaults: () => void;
  onResetPrices: () => void;
  onClearServerIds: () => void;
  onCheckErrors: () => void;
  onSetBuilderMode: (mode: AuctionBuilderMode) => void;
  onSetCommandStage: (stage: AuctionCommandStage) => void;
  onOpenDownload: () => void;
};

const ribbonTabs: Array<{ id: AuctionRibbonTab; label: string }> = [
  { id: 'home', label: 'Главная' },
  { id: 'auctions', label: 'Аукционы' },
  { id: 'items', label: 'Предметы' },
  { id: 'commands', label: 'Команды' },
  { id: 'graphs', label: 'Графики' },
  { id: 'templates', label: 'Шаблоны' },
  { id: 'view', label: 'Вид' },
  { id: 'tools', label: 'Инструменты' }
];

const currencyDisplayLabels: Record<AuctionCurrency, string> = {
  DONATE: 'DONATE',
  VAULT: 'ИГРОВАЯ',
  BONUS: 'БОНУС'
};

function timezoneLabel(offset: number) {
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function RibbonButton({
  icon,
  label,
  title,
  disabled,
  onClick
}: {
  icon: string;
  label: string;
  title?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="auction-ribbon-button" title={title ?? label} disabled={disabled} onClick={onClick}>
      <span className="auction-ribbon-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function RibbonGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="auction-ribbon-group" aria-label={title}>
      <div className="auction-ribbon-group-body">{children}</div>
      <strong>{title}</strong>
    </section>
  );
}

function RibbonField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="auction-ribbon-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function AuctionRibbon({
  activeTab,
  selectedFolder,
  uiMode,
  workflowMode,
  timezoneOffset,
  onTabChange,
  onUiModeChange,
  onWorkflowModeChange,
  onNewDay,
  onCopyDay,
  onDeleteDay,
  onCurrencyChange,
  onDurationChange,
  onStepPriceChange,
  onTimezoneOffsetChange,
  onPriceModeChange,
  onApplyDayDefaults,
  onResetPrices,
  onClearServerIds,
  onCheckErrors,
  onSetBuilderMode,
  onSetCommandStage,
  onOpenDownload
}: AuctionRibbonProps) {
  const hasFolder = Boolean(selectedFolder);
  const isPlanned = selectedFolder?.category === 'planned';

  const renderTabContent = () => {
    if (activeTab === 'home') {
      return (
        <>
          <RibbonGroup title="Создание">
            <RibbonButton icon="+" label="Новый день" onClick={onNewDay} />
            <RibbonButton icon="CP" label="Копия дня" disabled={!hasFolder} onClick={onCopyDay} />
            <RibbonButton icon="T" label="Из шаблона" disabled title="Шаблоны будут подключены отдельным шагом" onClick={() => undefined} />
            <RibbonButton icon="X" label="Удалить день" disabled={!hasFolder} onClick={onDeleteDay} />
          </RibbonGroup>
          <RibbonGroup title="Работа">
            <RibbonButton icon="A" label="Применить" disabled={!hasFolder} onClick={onApplyDayDefaults} />
            <RibbonButton icon="!" label="Проверить" disabled={!hasFolder} onClick={onCheckErrors} />
          </RibbonGroup>
        </>
      );
    }

    if (activeTab === 'auctions') {
      return (
        <>
          <RibbonGroup title="Параметры дня">
            <RibbonField label="Валюта новых">
              <select value={selectedFolder?.currency ?? 'DONATE'} disabled={!hasFolder} onChange={(event) => onCurrencyChange(event.target.value as AuctionCurrency)}>
                {auctionCurrencies.map((currency) => (
                  <option key={currency} value={currency}>{currency} · {currencyDisplayLabels[currency]}</option>
                ))}
              </select>
            </RibbonField>
            <RibbonField label="Длительность">
              <input type="number" min={1} value={selectedFolder?.defaultDurationMinutes ?? 10} disabled={!hasFolder} onChange={(event) => onDurationChange(Number(event.target.value))} />
            </RibbonField>
            <RibbonField label="Шаг ставки">
              <input type="number" min={1} value={selectedFolder?.defaultStepPrice ?? 10} disabled={!hasFolder} onChange={(event) => onStepPriceChange(Number(event.target.value))} />
            </RibbonField>
            <RibbonField label="Часовой пояс">
              <select value={timezoneOffset} disabled={!hasFolder} onChange={(event) => onTimezoneOffsetChange(Number(event.target.value))}>
                {Array.from({ length: 27 }, (_, index) => (index - 12) * 60).map((offset) => <option key={offset} value={offset}>{timezoneLabel(offset)}</option>)}
              </select>
            </RibbonField>
          </RibbonGroup>
          <RibbonGroup title="Папка">
            <RibbonButton icon="A" label="Применить" disabled={!hasFolder} onClick={onApplyDayDefaults} />
            <RibbonButton icon="X" label="Удалить день" disabled={!hasFolder} onClick={onDeleteDay} />
          </RibbonGroup>
        </>
      );
    }

    if (activeTab === 'items') {
      return (
        <RibbonGroup title="Лоты">
          <RibbonButton icon="+" label="Открыть лот" disabled={!hasFolder} onClick={() => onSetBuilderMode('items')} />
          <RibbonButton icon="Q" label="Количество" disabled={!hasFolder} onClick={() => onSetBuilderMode('items')} />
          <RibbonButton icon="!" label="NBT-фильтр" disabled={!hasFolder} onClick={() => onSetBuilderMode('items')} />
        </RibbonGroup>
      );
    }

    if (activeTab === 'commands') {
      return (
        <>
          <RibbonGroup title="Серверные ID">
            <RibbonButton icon="ID" label="Вставить ID" disabled={!hasFolder} onClick={() => onSetCommandStage('ids')} />
            <RibbonButton icon="OK" label="Проверить ID" disabled={!hasFolder} onClick={onCheckErrors} />
            <RibbonButton icon="#" label="Список ID" disabled={!hasFolder} onClick={() => onSetCommandStage('ids')} />
            <RibbonButton icon="CL" label="Очистить ID" disabled={!hasFolder} onClick={onClearServerIds} />
          </RibbonGroup>
          <RibbonGroup title="Команды">
            <RibbonButton icon="N" label="Новые" disabled={!hasFolder} onClick={() => onWorkflowModeChange('install')} />
            <RibbonButton icon="E" label="Существующие" disabled={!hasFolder} onClick={() => onWorkflowModeChange('existing')} />
            <RibbonButton icon=">" label="Генерировать" disabled={!hasFolder} onClick={() => onSetCommandStage('create')} />
            <RibbonButton icon="DL" label="Скачать файл" disabled={!hasFolder} onClick={onOpenDownload} />
            <RibbonButton icon="SH" label="Показать" disabled={!hasFolder} onClick={() => onSetCommandStage('settings')} />
            <span className="auction-ribbon-status">{workflowMode === 'install' ? 'Новые слоты' : 'По готовым ID'}</span>
          </RibbonGroup>
        </>
      );
    }

    if (activeTab === 'graphs') {
      return (
        <RibbonGroup title="Цены и график">
          <RibbonButton icon="G" label="По графику" disabled={!hasFolder || isPlanned} title="Глобальный график применяется только к обычным папкам" onClick={() => onPriceModeChange('graph')} />
          <RibbonButton icon="M" label="Вручную" disabled={!hasFolder} onClick={() => onPriceModeChange('manual')} />
          <RibbonButton icon="S" label="Сбросить цены" disabled={!hasFolder || isPlanned} onClick={onResetPrices} />
        </RibbonGroup>
      );
    }

    if (activeTab === 'tools') {
      return (
        <RibbonGroup title="Планировщик">
          <RibbonButton icon="R" label="Повторы" disabled={!hasFolder} onClick={() => onSetBuilderMode('config')} />
          <RibbonButton icon="I" label="Интервал" disabled={!hasFolder} onClick={() => onSetBuilderMode('config')} />
          <RibbonButton icon="SC" label="Расписание" disabled={!hasFolder} onClick={() => onSetCommandStage('settings')} />
          <RibbonButton icon="C" label="Проверка" disabled={!hasFolder} onClick={onCheckErrors} />
        </RibbonGroup>
      );
    }

    if (activeTab === 'view') {
      return (
        <RibbonGroup title="Режим">
          <RibbonButton icon="N" label="Обычный" disabled={!hasFolder} onClick={() => onUiModeChange('normal')} />
          <RibbonButton icon="E" label="Экспертный" disabled={!hasFolder} onClick={() => onUiModeChange('expert')} />
          <span className="auction-ribbon-status">{uiMode === 'expert' ? 'Экспертный режим' : 'Обычный режим'}</span>
        </RibbonGroup>
      );
    }

    return (
      <div className="auction-ribbon-placeholder">
        <strong>{ribbonTabs.find((tab) => tab.id === activeTab)?.label}</strong>
        <span>Раздел будет заполнен следующим структурным шагом.</span>
      </div>
    );
  };

  return (
    <div className="auction-ribbon" aria-label="auction-ribbon">
      <div className="auction-ribbon-tabs">
        {ribbonTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="auction-ribbon-content">
        {renderTabContent()}
      </div>
    </div>
  );
}
