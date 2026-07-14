const auctionLotDragMime = 'application/x-cubix-auction-lot';

export type AuctionLotDragPayload = {
  lotId: string;
};

export function writeAuctionLotDrag(dataTransfer: DataTransfer, payload: AuctionLotDragPayload) {
  dataTransfer.effectAllowed = 'copy';
  dataTransfer.setData(auctionLotDragMime, JSON.stringify(payload));
  dataTransfer.setData('text/plain', payload.lotId);
}

export function hasAuctionLotDrag(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes(auctionLotDragMime);
}

export function readAuctionLotDrag(dataTransfer: DataTransfer): AuctionLotDragPayload | null {
  try {
    const payload = JSON.parse(dataTransfer.getData(auctionLotDragMime)) as Partial<AuctionLotDragPayload>;
    if (typeof payload.lotId !== 'string' || !payload.lotId.trim()) return null;
    return { lotId: payload.lotId };
  } catch {
    return null;
  }
}
