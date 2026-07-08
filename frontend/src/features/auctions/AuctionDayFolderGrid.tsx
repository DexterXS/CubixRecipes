import type { AuctionDayFolderSummary } from './auctionDayFolders';
import type { ReactNode } from 'react';
import type { AuctionBuilderMode, AuctionCommandStage, AuctionDayFolder } from './auctionTypes';
import './AuctionDayFolderGrid.css';

type AuctionDayFolderGridProps = {
  folders: AuctionDayFolder[];
  selectedFolderId: string;
  summaries: Record<string, AuctionDayFolderSummary>;
  onSelectFolder: (id: string) => void;
  onCopyFolder: (id: string) => void;
  onSetBuilderMode: (mode: AuctionBuilderMode) => void;
  onSetCommandStage: (stage: AuctionCommandStage) => void;
};

function priceModeLabel(folder: AuctionDayFolder) {
  return folder.priceMode === 'graph' ? 'по графику' : 'вручную';
}

function warningLabel(summary: AuctionDayFolderSummary) {
  const warnings: string[] = [];
  if (summary.hasMissingServerIds) warnings.push(`ID: ${summary.missingServerIdCount}`);
  if (summary.hasNbtWarnings) warnings.push(`NBT: ${summary.nbtItemCount}`);
  return warnings.join(' · ');
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
  onCopyFolder,
  onSetBuilderMode,
  onSetCommandStage
}: AuctionDayFolderGridProps) {
  return (
    <PanelLikeDayFolderGrid>
      <div className="auction-folder-grid-header">
        <div>
          <h2>Папки аукционов по дням</h2>
          <span>Локальный планировщик команд: папка равна одному дню подготовки.</span>
        </div>
        <span className="auction-folder-grid-count">{folders.length} дн.</span>
      </div>

      <div className="auction-folder-grid">
        {folders.map((folder) => {
          const summary = summaries[folder.id];
          const selected = folder.id === selectedFolderId;
          return (
            <button
              key={folder.id}
              type="button"
              className={`auction-day-folder-card ${selected ? 'active' : ''}`.trim()}
              onClick={() => onSelectFolder(folder.id)}
            >
              <div className="auction-folder-tab" aria-hidden="true" />
              <div className="auction-folder-card-header">
                <strong>{folder.title}</strong>
                <span>{summary?.auctionCount ?? folder.auctions.length} аукционов</span>
              </div>
              <div className="auction-folder-card-body">
                <div className="auction-folder-icon" aria-hidden="true">
                  <span />
                </div>
                <dl>
                  <div>
                    <dt>Цена</dt>
                    <dd>{summary?.priceRangeLabel ?? 'нет цен'}</dd>
                  </div>
                  <div>
                    <dt>Шаг</dt>
                    <dd>{folder.defaultStepPrice}</dd>
                  </div>
                  <div>
                    <dt>Предметов</dt>
                    <dd>{summary?.itemCount ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Цены</dt>
                    <dd>{priceModeLabel(folder)}</dd>
                  </div>
                </dl>
              </div>
              <div className="auction-folder-indicators">
                {summary?.hasMissingServerIds ? <span className="warning">Нет ID</span> : <span> ID готовы</span>}
                {summary?.hasNbtWarnings ? <span className="warning">NBT</span> : <span>Без NBT</span>}
                <span>{warningLabel(summary ?? {
                  auctionCount: 0,
                  itemCount: 0,
                  nonNbtItemCount: 0,
                  nbtItemCount: 0,
                  missingServerIdCount: 0,
                  hasMissingServerIds: false,
                  hasNbtWarnings: false,
                  minStartPrice: null,
                  maxStartPrice: null,
                  priceRangeLabel: 'нет цен'
                }) || 'OK'}</span>
              </div>
              <div className="auction-folder-actions">
                <FolderAction label="Копировать" onClick={() => onCopyFolder(folder.id)} />
                <FolderAction label="Изменить день" onClick={() => onSetBuilderMode('config')} />
                <FolderAction label="Шаг ставки" onClick={() => onSetBuilderMode('config')} />
                <FolderAction label="Цены" onClick={() => onSetBuilderMode('items')} />
                <FolderAction label="График" onClick={() => onSetBuilderMode('config')} />
                <FolderAction label="Команды" onClick={() => onSetCommandStage('settings')} />
              </div>
            </button>
          );
        })}
      </div>
      <div className="auction-folder-tip">
        Инструмент не подключается к серверу. Он только готовит команды, а server ID нужно вписать после `/aca create`.
      </div>
    </PanelLikeDayFolderGrid>
  );
}

function PanelLikeDayFolderGrid({ children }: { children: ReactNode }) {
  return <section className="auction-day-folder-grid-panel">{children}</section>;
}
