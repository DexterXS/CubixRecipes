import { getDayServerIdStatus, type AuctionDayFolderSummary } from './auctionDayFolders';
import type { AuctionDayFolder } from './auctionTypes';

type AuctionServerIdPanelProps = {
  folder: AuctionDayFolder;
  summary: AuctionDayFolderSummary | undefined;
};

function serverIdStatusText(folder: AuctionDayFolder) {
  const status = getDayServerIdStatus(folder, 'ids');
  if (status === 'not-needed-yet') return 'ID пока не нужны: сначала создай слоты';
  if (status === 'waiting') return 'ID ожидаются после `/aca create`';
  if (status === 'missing') return 'Есть пропущенные ID';
  return 'ID заполнены';
}

export function AuctionServerIdPanel({ folder, summary }: AuctionServerIdPanelProps) {
  return (
    <section className="auction-day-details-section">
      <h3>Серверные ID</h3>
      <p>{serverIdStatusText(folder)}</p>
      {summary?.hasMissingServerIds ? <span className="auction-day-warning">Пропущено ID: {summary.missingServerIdCount}</span> : null}
    </section>
  );
}
