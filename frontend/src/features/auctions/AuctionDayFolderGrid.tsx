import { formatDurationCompact, type AuctionDayFolderSummary } from './auctionDayFolders';
import { hasAuctionLotDrag, readAuctionLotDrag, type AuctionLotDragPayload } from './auctionDragDrop';
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { AuctionDayFolder, AuctionState } from './auctionTypes';
import { auctionFolderTagColors, auctionFolderTagLabels } from './auctionFolderTags';
import './AuctionDayFolderGrid.css';

type AuctionDayFolderGridProps = {
  folders: AuctionDayFolder[];
  selectedFolderId: string;
  summaries: Record<string, AuctionDayFolderSummary>;
  onSelectFolder: (id: string) => void;
  onOpenFolder: (id: string) => void;
  onCopyFolder: (id: string) => void;
  onDropAuctionLot: (payload: AuctionLotDragPayload, targetFolderId: string) => void;
};

function folderKindLabel(folder: AuctionDayFolder) {
  return folder.category === 'planned' ? 'Планируемые (повтор)' : 'Обычные аукционы';
}

function priceModeLabel(folder: AuctionDayFolder) {
  if (folder.category === 'planned') return 'фиксированные';
  return folder.priceMode === 'graph' ? 'по графику' : 'вручную';
}

const stateLabels: Record<AuctionState, string> = {
  SETUP: 'Подготовка',
  ACTIVE: 'Запустить',
  PAUSED: 'Пауза',
  CLOSED: 'Закрыт',
  ENDED: 'Завершён'
};

const currencyLabels = {
  DONATE: 'DONATE',
  VAULT: 'ИГРОВАЯ',
  BONUS: 'БОНУС'
} as const;

function warningLabel(summary: AuctionDayFolderSummary) {
  const warnings: string[] = [];
  if (summary.hasMissingServerIds) warnings.push(`ID: ${summary.missingServerIdCount}`);
  if (summary.hasNbtWarnings) warnings.push(`NBT: ${summary.nbtItemCount}`);
  return warnings.join(' · ') || 'OK';
}

function FolderAction({
  label,
  onClick
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="auction-folder-action"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

export function AuctionDayFolderGrid({
  folders,
  selectedFolderId,
  summaries,
  onSelectFolder,
  onOpenFolder,
  onCopyFolder,
  onDropAuctionLot
}: AuctionDayFolderGridProps) {
  const [dropFolderId, setDropFolderId] = useState('');

  return (
    <PanelLikeDayFolderGrid>
      <div className="auction-folder-grid-header">
        <div>
          <h2>Папки аукционов</h2>
          <span>Выбери папку для управления справа или открой её, чтобы увидеть лоты внутри.</span>
        </div>
        <span className="auction-folder-grid-count">{folders.length} папок</span>
      </div>

      <div className="auction-folder-grid">
        {folders.map((folder) => {
          const summary = summaries[folder.id];
          const selected = folder.id === selectedFolderId;
          const isPlanned = folder.category === 'planned';
          return (
            <button
              key={folder.id}
              type="button"
              className={`auction-day-folder-card ${selected ? 'active' : ''} ${isPlanned ? 'planned' : 'regular'} ${dropFolderId === folder.id ? 'drop-target' : ''}`.trim()}
              onClick={() => onSelectFolder(folder.id)}
              onDragOver={(event) => {
                if (!hasAuctionLotDrag(event.dataTransfer)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                setDropFolderId(folder.id);
              }}
              onDragLeave={() => setDropFolderId((current) => current === folder.id ? '' : current)}
              onDrop={(event) => {
                const payload = readAuctionLotDrag(event.dataTransfer);
                if (!payload) return;
                event.preventDefault();
                event.stopPropagation();
                setDropFolderId('');
                onDropAuctionLot(payload, folder.id);
              }}
            >
              <div className="auction-folder-tab" aria-hidden="true" />
              <div className="auction-folder-card-header">
                <strong>{isPlanned ? folder.title : folder.title}</strong>
                <span>{summary?.auctionCount ?? folder.auctions.length} аукционов</span>
              </div>
              <div className="auction-folder-kind">{folderKindLabel(folder)}</div>
              {folder.tag ? <span className="auction-folder-tag" style={{ '--tag-color': auctionFolderTagColors[folder.tag] } as CSSProperties}>{auctionFolderTagLabels[folder.tag]}</span> : null}
              <div className="auction-folder-card-body">
                <div className="auction-folder-icon" aria-hidden="true">
                  <span />
                </div>
                <dl>
                  <div><dt>Дата начала</dt><dd>{isPlanned ? 'по расписанию' : folder.dateLocal}</dd></div>
                  <div><dt>Длительность</dt><dd>{formatDurationCompact(folder.defaultDurationMinutes)}</dd></div>
                  <div><dt>Предметов</dt><dd>{summary?.itemCount ?? 0}</dd></div>
                  <div><dt>Цены</dt><dd>{summary?.priceRangeLabel ?? 'нет цен'}</dd></div>
                  <div><dt>Режим цен</dt><dd>{priceModeLabel(folder)}</dd></div>
                  <div><dt>Валюты</dt><dd>{summary?.currencyLabel ?? currencyLabels[folder.currency]}</dd></div>
                  <div><dt>Статус</dt><dd>{stateLabels[folder.state]}</dd></div>
                </dl>
              </div>
              <div className="auction-folder-indicators">
                {summary?.hasMissingServerIds ? <span className="warning">Нет ID</span> : <span>ID готовы</span>}
                {summary?.hasNbtWarnings ? <span className="warning">NBT</span> : <span>Без NBT</span>}
                <span>{warningLabel(summary ?? {
                  auctionCount: 0,
                  itemCount: 0,
                  nonNbtItemCount: 0,
                  nbtItemCount: 0,
                  currencies: [folder.currency],
                  isMixedCurrency: false,
                  currencyLabel: currencyLabels[folder.currency],
                  missingServerIdCount: 0,
                  hasMissingServerIds: false,
                  hasNbtWarnings: false,
                  minStartPrice: null,
                  maxStartPrice: null,
                  priceRangeLabel: 'нет цен'
                })}</span>
              </div>
              <div className="auction-folder-actions">
                <FolderAction label="Открыть" onClick={() => onOpenFolder(folder.id)} />
                <FolderAction label="Копировать" onClick={() => onCopyFolder(folder.id)} />
              </div>
            </button>
          );
        })}
      </div>
      <div className="auction-folder-tip">
        Глобальный график цен применяется только к обычным синим папкам. Планируемые фиолетовые папки используют фиксированные цены.
      </div>
    </PanelLikeDayFolderGrid>
  );
}

function PanelLikeDayFolderGrid({ children }: { children: ReactNode }) {
  return <section className="auction-day-folder-grid-panel">{children}</section>;
}
