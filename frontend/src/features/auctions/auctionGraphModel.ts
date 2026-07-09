import { addDaysToLocalDateTime, buildAuctionRunPricePreviews, createDefaultAuctionCurve, dayIndexFromStart, parseLocalDateTime } from './auctionCommands';
import { categoryTitle, dateInputFromLocalDateTime, formatAuctionDayTitle, getAuctionFolderCurrencies, localDateTimeForDay, nextDayLocal } from './auctionDayFolders';
import type { AuctionCurrency, AuctionCurve, AuctionDayFolder, AuctionFolderCategory, AuctionFolderTag } from './auctionTypes';

export type AuctionGraphPointAuction = {
  folderId: string;
  folderTitle: string;
  folderCategory: AuctionFolderCategory;
  folderTag: AuctionFolderTag | null;
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
  durationEndDay: number;
  durationLabel: string;
  tag: AuctionFolderTag | null;
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

function timeFromLocalDateTime(value: string) {
  return value.includes('T') ? value.slice(11, 16) : '10:00';
}

function dateLocalForGraphDay(graphStartLocal: string, day: number) {
  return dateInputFromLocalDateTime(addDaysToLocalDateTime(graphStartLocal, day));
}

function graphFolderKeys(folder: AuctionDayFolder) {
  return getAuctionFolderCurrencies(folder).map((currency) => `${folder.category}:${currency}`);
}

function durationDays(startLocal: string, endLocal: string) {
  const startMs = parseLocalDateTime(startLocal);
  const endMs = parseLocalDateTime(endLocal);
  if (startMs === null || endMs === null || endMs <= startMs) return 0;
  return (endMs - startMs) / 86_400_000;
}

function formatDurationLabel(days: number) {
  if (days >= 1) return `${Math.ceil(days)} дн.`;
  return `${Math.max(1, Math.round(days * 24))} ч.`;
}

function canPlaceGraphFolders(params: {
  folders: AuctionDayFolder[];
  movingFolders: AuctionDayFolder[];
  targetDateLocal: string;
}) {
  const movingIds = new Set(params.movingFolders.map((folder) => folder.id));
  const movingKeys = new Set<string>();
  for (const folder of params.movingFolders) {
    for (const key of graphFolderKeys(folder)) {
      if (movingKeys.has(key)) return false;
      movingKeys.add(key);
      const hasTargetConflict = params.folders.some((candidate) => (
        !movingIds.has(candidate.id)
        && candidate.dateLocal === params.targetDateLocal
        && graphFolderKeys(candidate).includes(key)
      ));
      if (hasTargetConflict) return false;
    }
  }
  return true;
}

function moveFolderToGraphDay(folder: AuctionDayFolder, targetDay: number, graphStartLocal: string): AuctionDayFolder {
  if (folder.category === 'planned') return folder;
  const nextDateLocal = dateLocalForGraphDay(graphStartLocal, targetDay);

  return {
    ...folder,
    dateLocal: nextDateLocal,
    title: formatAuctionDayTitle(nextDateLocal),
    auctions: folder.auctions.map((auction) => ({
      ...auction,
      startLocal: localDateTimeForDay(nextDateLocal, timeFromLocalDateTime(auction.startLocal))
    }))
  };
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
          durationEndDay: preview.dayIndex,
          durationLabel: '',
          tag: null,
          auctions: []
        };
        const days = durationDays(preview.startLocal, preview.endLocal);
        const visibleDays = Math.max(days, days > 0 ? 0.5 : 0);
        const durationEndDay = Math.min(89, preview.dayIndex + visibleDays);
        current.editable = current.editable || editable;
        if (editable) current.value = params.curve[params.currency]?.[preview.dayIndex] ?? preview.multiplier;
        if (durationEndDay > current.durationEndDay) {
          current.durationEndDay = durationEndDay;
          current.durationLabel = days > 0 ? formatDurationLabel(days) : '';
        }
        current.tag = current.tag ?? folder.tag ?? null;
        current.auctions.push({
          folderId: folder.id,
          folderTitle: folder.title,
          folderCategory: folder.category,
          folderTag: folder.tag ?? null,
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

  const movingFolders = params.folders.filter((folder) => {
    if (folder.category === 'planned') return false;
    return folder.auctions.some((auction) => {
      const auctionDay = dayIndexFromStart(auction.startLocal, params.graphStartLocal);
      return auction.currency === params.currency && auctionDay === params.sourceDay;
    });
  });

  const targetDateLocal = dateLocalForGraphDay(params.graphStartLocal, params.targetDay);
  if (!movingFolders.length || !canPlaceGraphFolders({ folders: params.folders, movingFolders, targetDateLocal })) {
    return params.folders;
  }

  const movingIds = new Set(movingFolders.map((folder) => folder.id));
  return params.folders.map((folder) => {
    return movingIds.has(folder.id) ? moveFolderToGraphDay(folder, params.targetDay, params.graphStartLocal) : folder;
  });
}

export function duplicateAuctionGraphFolder(params: {
  folders: AuctionDayFolder[];
  folderId: string;
  auctionId: string;
}): { folders: AuctionDayFolder[]; folderId: string; auctionId: string } {
  const source = params.folders.find((folder) => folder.id === params.folderId);
  const auction = source?.auctions.find((item) => item.id === params.auctionId);
  if (!source || !auction) {
    return { folders: params.folders, folderId: params.folderId, auctionId: params.auctionId };
  }

  const nextId = `day-${params.folders.length + 1}`;
  const nextDateLocal = nextDayLocal(source.dateLocal);
  const nextAuctionId = `${nextId}-auction-1`;
  const timeLocal = auction.startLocal.includes('T') ? auction.startLocal.slice(11, 16) : '10:00';
  const nextFolder: AuctionDayFolder = {
    ...source,
    id: nextId,
    dateLocal: nextDateLocal,
    title: categoryTitle(source.category, nextDateLocal),
    auctions: [{
      ...auction,
      id: nextAuctionId,
      serverIds: {},
      startLocal: localDateTimeForDay(nextDateLocal, timeLocal),
      items: auction.items.map((item) => ({ ...item, uid: `${item.uid}-${nextId}` }))
    }]
  };

  return { folders: [...params.folders, nextFolder], folderId: nextId, auctionId: nextAuctionId };
}
