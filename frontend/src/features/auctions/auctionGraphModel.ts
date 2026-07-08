import { addDaysToLocalDateTime, buildAuctionRunPricePreviews, createDefaultAuctionCurve, dayIndexFromStart } from './auctionCommands';
import { dateInputFromLocalDateTime, formatAuctionDayTitle, localDateTimeForDay } from './auctionDayFolders';
import type { AuctionCurrency, AuctionCurve, AuctionDayFolder, AuctionFolderCategory } from './auctionTypes';

export type AuctionGraphPointAuction = {
  folderId: string;
  folderTitle: string;
  folderCategory: AuctionFolderCategory;
  auctionId: string;
  auctionName: string;
  label: string;
  startLocal: string;
  startPrice: number;
  stepPrice: number;
  multiplier: number;
};

export type AuctionGraphPoint = {
  day: number;
  dateLabel: string;
  editable: boolean;
  value: number;
  auctions: AuctionGraphPointAuction[];
};

function graphDateLabel(startLocal: string) {
  const [date = startLocal, time = ''] = startLocal.split('T');
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return startLocal;
  const [, year, month, day] = match;
  const dateValue = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const formatted = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(dateValue);
  return time ? `${formatted}, ${time}` : formatted;
}

export function getRegularAuctionFolders(folders: AuctionDayFolder[]) {
  return folders.filter((folder) => folder.category !== 'planned');
}

export function buildAuctionGraphPoints(params: {
  folders: AuctionDayFolder[];
  curve: AuctionCurve;
  graphStartLocal: string;
  currency: AuctionCurrency;
}): AuctionGraphPoint[] {
  const pointMap = new Map<number, AuctionGraphPoint>();

  const fixedCurve = createDefaultAuctionCurve();

  params.folders.forEach((folder) => {
    const folderUsesGraph = folder.category !== 'planned' && folder.priceMode === 'graph';
    const curve = folderUsesGraph ? params.curve : fixedCurve;

    buildAuctionRunPricePreviews({ auctions: folder.auctions, curve, graphStartLocal: params.graphStartLocal })
      .filter((preview) => preview.currency === params.currency)
      .forEach((preview) => {
        const editable = folderUsesGraph && preview.dayIndex === preview.priceDayIndex;
        const current = pointMap.get(preview.dayIndex) ?? {
          day: preview.dayIndex,
          dateLabel: graphDateLabel(preview.startLocal),
          editable: false,
          value: preview.multiplier,
          auctions: []
        };
        current.editable = current.editable || editable;
        if (editable) current.value = params.curve[params.currency]?.[preview.dayIndex] ?? preview.multiplier;
        current.auctions.push({
          folderId: folder.id,
          folderTitle: folder.title,
          folderCategory: folder.category,
          auctionId: preview.auctionId,
          auctionName: preview.auctionName,
          label: preview.label,
          startLocal: preview.startLocal,
          startPrice: preview.startPrice,
          stepPrice: preview.stepPrice,
          multiplier: preview.multiplier
        });
        pointMap.set(preview.dayIndex, current);
      });
  });

  return Array.from(pointMap.values()).sort((left, right) => left.day - right.day);
}

export function moveAuctionGraphPointFolders(params: {
  folders: AuctionDayFolder[];
  currency: AuctionCurrency;
  sourceDay: number;
  targetDay: number;
  graphStartLocal: string;
}): AuctionDayFolder[] {
  const deltaDays = params.targetDay - params.sourceDay;
  if (!deltaDays) return params.folders;

  return params.folders.map((folder) => {
    if (folder.category === 'planned') return folder;

    let movedAuctionCount = 0;
    const auctions = folder.auctions.map((auction) => {
      const auctionDay = dayIndexFromStart(auction.startLocal, params.graphStartLocal);
      if (auction.currency !== params.currency || auctionDay !== params.sourceDay) return auction;
      movedAuctionCount += 1;
      return { ...auction, startLocal: addDaysToLocalDateTime(auction.startLocal, deltaDays) };
    });

    if (!movedAuctionCount) return folder;

    const folderDay = dayIndexFromStart(localDateTimeForDay(folder.dateLocal, '00:00'), params.graphStartLocal);
    const nextDateLocal = folderDay === params.sourceDay
      ? dateInputFromLocalDateTime(addDaysToLocalDateTime(localDateTimeForDay(folder.dateLocal, '00:00'), deltaDays))
      : folder.dateLocal;

    return {
      ...folder,
      dateLocal: nextDateLocal,
      title: folder.title === formatAuctionDayTitle(folder.dateLocal) ? formatAuctionDayTitle(nextDateLocal) : folder.title,
      auctions
    };
  });
}
