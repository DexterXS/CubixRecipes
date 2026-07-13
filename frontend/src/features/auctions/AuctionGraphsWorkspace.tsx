import { auctionCurrencyLabels } from './auctionCommands';
import { AuctionGraphPanel } from './AuctionGraphPanel';
import type { AuctionDayFolderSummary } from './auctionDayFolders';
import type { AuctionCurrency, AuctionCurve, AuctionDayFolder, AuctionFolderTag } from './auctionTypes';
import './AuctionGraphsWorkspace.css';

type AuctionGraphsWorkspaceProps = {
  folders: AuctionDayFolder[];
  summaries: Record<string, AuctionDayFolderSummary>;
  selectedFolderId: string;
  curve: AuctionCurve;
  graphStartLocal: string;
  onGraphStartLocalChange: (value: string) => void;
  onMovePoint: (currency: AuctionCurrency, sourceDay: number, targetDay: number, value: number) => number;
  onOpenFolder: (folderId: string) => void;
  onOpenAuction: (folderId: string, auctionId: string) => void;
  onDuplicateAuctionFolder: (folderId: string, auctionId: string) => void;
  onSetFolderTag: (folderId: string, tag: AuctionFolderTag | null) => void;
};

export function buildAuctionGraphsWorkspaceSummary(folders: AuctionDayFolder[], summaries: Record<string, AuctionDayFolderSummary>) {
  return folders.reduce((total, folder) => {
    const summary = summaries[folder.id];
    total.folderCount += 1;
    total.regularCount += folder.category === 'planned' ? 0 : 1;
    total.plannedCount += folder.category === 'planned' ? 1 : 0;
    total.auctionCount += summary?.auctionCount ?? folder.auctions.length;
    total.itemCount += summary?.itemCount ?? 0;
    total.missingServerIdCount += summary?.missingServerIdCount ?? 0;
    total.nbtWarningCount += summary?.nbtItemCount ?? 0;
    return total;
  }, {
    folderCount: 0,
    regularCount: 0,
    plannedCount: 0,
    auctionCount: 0,
    itemCount: 0,
    missingServerIdCount: 0,
    nbtWarningCount: 0
  });
}

function formatDate(dateLocal: string) {
  const match = dateLocal.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateLocal;
  const [, year, month, day] = match;
  const value = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(value).replace('.', '');
}

function folderCurrencyLabel(summary: AuctionDayFolderSummary | undefined, folder: AuctionDayFolder) {
  if (summary?.currencyLabel) return summary.currencyLabel;
  return auctionCurrencyLabels[folder.currency] ?? folder.currency;
}

export function AuctionGraphsWorkspace({
  folders,
  summaries,
  selectedFolderId,
  curve,
  graphStartLocal,
  onGraphStartLocalChange,
  onMovePoint,
  onOpenFolder,
  onOpenAuction,
  onDuplicateAuctionFolder,
  onSetFolderTag
}: AuctionGraphsWorkspaceProps) {
  const total = buildAuctionGraphsWorkspaceSummary(folders, summaries);
  const orderedFolders = [...folders].sort((left, right) => {
    if (left.category !== right.category) return left.category === 'regular' ? -1 : 1;
    return left.dateLocal.localeCompare(right.dateLocal);
  });

  return (
    <section className="auction-graphs-workspace" aria-label="auction-graphs-workspace">
      <AuctionGraphPanel
        folders={folders}
        curve={curve}
        graphStartLocal={graphStartLocal}
        onGraphStartLocalChange={onGraphStartLocalChange}
        onMovePoint={onMovePoint}
        onDuplicateAuctionFolder={onDuplicateAuctionFolder}
        onSetFolderTag={onSetFolderTag}
        onOpenAuction={onOpenAuction}
      />

      <aside className="auction-graphs-sidebar" aria-label="auction-graphs-sidebar">
        <header>
          <span>Глобальная очередь</span>
          <strong>{total.folderCount} папок</strong>
        </header>

        <div className="auction-graphs-stat-grid">
          <span><b>{total.regularCount}</b> обычных</span>
          <span><b>{total.plannedCount}</b> плановых</span>
          <span><b>{total.auctionCount}</b> лотов</span>
          <span><b>{total.itemCount}</b> предметов</span>
        </div>

        <div className="auction-graphs-alerts">
          <span className={total.missingServerIdCount ? 'warning' : 'ok'}>
            ID сервера: {total.missingServerIdCount ? `пропущено ${total.missingServerIdCount}` : 'готово'}
          </span>
          <span className={total.nbtWarningCount ? 'warning' : 'ok'}>
            NBT: {total.nbtWarningCount ? `${total.nbtWarningCount} предметов вне команд` : 'без предупреждений'}
          </span>
        </div>

        <div className="auction-graphs-folder-list">
          {orderedFolders.map((folder) => {
            const summary = summaries[folder.id];
            const selected = folder.id === selectedFolderId;
            return (
              <button
                key={folder.id}
                type="button"
                className={selected ? 'active' : ''}
                onClick={() => onOpenFolder(folder.id)}
              >
                <span>{folder.category === 'planned' ? 'План' : formatDate(folder.dateLocal)}</span>
                <strong>{folder.title}</strong>
                <small>
                  {folderCurrencyLabel(summary, folder)} · {summary?.auctionCount ?? folder.auctions.length} лотов · {summary?.priceRangeLabel ?? 'нет цен'}
                </small>
              </button>
            );
          })}
        </div>
      </aside>
    </section>
  );
}
