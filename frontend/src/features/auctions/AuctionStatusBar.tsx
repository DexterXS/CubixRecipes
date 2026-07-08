import type { AuctionDayFolder, AuctionDraft } from './auctionTypes';
import type { AuctionDayFolderSummary } from './auctionDayFolders';
import './AuctionStatusBar.css';

type AuctionStatusBarProps = {
  view: 'folders' | 'folder' | 'lot';
  folders: AuctionDayFolder[];
  summaries: Record<string, AuctionDayFolderSummary>;
  selectedFolder?: AuctionDayFolder;
  selectedAuction?: AuctionDraft;
};

function sumFolders(folders: AuctionDayFolder[], summaries: Record<string, AuctionDayFolderSummary>) {
  return folders.reduce((total, folder) => {
    const summary = summaries[folder.id];
    return {
      missing: total.missing + (summary?.missingServerIdCount ?? 0),
      warnings: total.warnings + (summary?.nbtItemCount ?? 0)
    };
  }, { missing: 0, warnings: 0 });
}

export function AuctionStatusBar({ view, folders, summaries, selectedFolder, selectedAuction }: AuctionStatusBarProps) {
  if (view === 'lot' && selectedAuction) {
    const missingId = selectedAuction.serverIds['0']?.trim() ? 0 : 1;
    const warnings = selectedAuction.items.filter((item) => item.hasNbt).length;
    return (
      <footer className="auction-status-bar">
        <span>Открытый лот: {selectedAuction.name}</span>
        <span>Предметов: {selectedAuction.items.length}</span>
        <span className={missingId ? 'warning' : 'ok'}>{missingId ? 'Нет ID' : 'ID заполнен'}</span>
        <span className={warnings ? 'warning' : 'ok'}>Предупреждения: {warnings}</span>
      </footer>
    );
  }

  if (view === 'folder' && selectedFolder) {
    const summary = summaries[selectedFolder.id];
    return (
      <footer className="auction-status-bar">
        <span>Открытая папка: {selectedFolder.title}</span>
        <span>Аукционов: {summary?.auctionCount ?? selectedFolder.auctions.length}</span>
        <span>Предметов: {summary?.itemCount ?? 0}</span>
        <span className={summary?.hasMissingServerIds ? 'warning' : 'ok'}>Нет ID: {summary?.missingServerIdCount ?? 0}</span>
        <span className={summary?.hasNbtWarnings ? 'warning' : 'ok'}>Предупреждения: {summary?.nbtItemCount ?? 0}</span>
      </footer>
    );
  }

  const totals = sumFolders(folders, summaries);
  const regular = folders.filter((folder) => folder.category === 'regular').length;
  const planned = folders.filter((folder) => folder.category === 'planned').length;
  return (
    <footer className="auction-status-bar">
      <span>Всего папок: {folders.length}</span>
      <span>Обычные: {regular}</span>
      <span>Планируемые: {planned}</span>
      <span className={totals.missing ? 'warning' : 'ok'}>Нет ID: {totals.missing}</span>
      <span className={totals.warnings ? 'warning' : 'ok'}>Предупреждения: {totals.warnings}</span>
    </footer>
  );
}
