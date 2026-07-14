import { localDateTimeInputFromUtcMs } from './auctionCommands';
import {
  createAuctionDraft,
  defaultTimezoneOffset,
  localDateTimeForDay,
  timeInputFromLocalDateTime
} from './auctionDayFolders';
import type { AuctionDayFolder, AuctionDraft, AuctionLotLibraryRecord } from './auctionTypes';

export type AuctionLotLibraryFolderRef = {
  folderId: string;
  auctionId: string;
  folderTitle: string;
  dateLocal: string;
};

export type AuctionLotLibraryEntry = {
  record: AuctionLotLibraryRecord;
  refs: AuctionLotLibraryFolderRef[];
};

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function auctionLotSignature(auction: AuctionDraft): string {
  return JSON.stringify({
    name: normalizeText(auction.name),
    description: normalizeText(auction.description),
    currency: auction.currency,
    startPrice: Math.max(0, Math.round(auction.baseStartPrice || 0)),
    stepPrice: Math.max(0, Math.round(auction.baseStepPrice || 0)),
    duration: Math.max(1, Math.round(auction.durationMinutes || 1)),
    items: auction.items.map((item) => ({
      raw: item.raw,
      meta: item.meta,
      hasNbt: item.hasNbt,
      quantity: Math.max(1, Math.round(item.quantity || 1)),
      basePrice: Math.max(0, Math.round(item.basePrice || 0))
    }))
  });
}

function cloneAuction(auction: AuctionDraft): AuctionDraft {
  return {
    ...auction,
    serverIds: { ...auction.serverIds },
    items: auction.items.map((item) => ({ ...item }))
  };
}

function sameAuctionSnapshot(first: AuctionDraft, second: AuctionDraft): boolean {
  return JSON.stringify(cloneAuction(first)) === JSON.stringify(cloneAuction(second));
}

function createRecordFromAuction(auction: AuctionDraft, index: number): AuctionLotLibraryRecord {
  return {
    id: `lot-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    auction: cloneAuction(auction),
    createdAt: Date.now()
  };
}

export function normalizeAuctionLotLibrary(value: unknown): AuctionLotLibraryRecord[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const records: AuctionLotLibraryRecord[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const record = item as Partial<AuctionLotLibraryRecord>;
    if (!record.auction || typeof record.auction !== 'object') return;
    const signature = auctionLotSignature(record.auction as AuctionDraft);
    if (seen.has(signature)) return;
    seen.add(signature);
    records.push({
      id: typeof record.id === 'string' && record.id.trim() ? record.id : `lot-import-${index + 1}`,
      auction: cloneAuction(record.auction as AuctionDraft),
      createdAt: Number.isFinite(record.createdAt) ? Number(record.createdAt) : Date.now()
    });
  });
  return records.slice(0, 500);
}

export function mergeAuctionLotLibrary(records: AuctionLotLibraryRecord[], folders: AuctionDayFolder[]): AuctionLotLibraryRecord[] {
  const normalized = normalizeAuctionLotLibrary(records);
  const seen = new Set(normalized.map((record) => auctionLotSignature(record.auction)));
  const recordIndexByAuctionId = new Map<string, number>();
  normalized.forEach((record, index) => {
    const id = record.auction.id.trim();
    if (id && !recordIndexByAuctionId.has(id)) recordIndexByAuctionId.set(id, index);
  });
  let changed = normalized.length !== records.length;
  const next = [...normalized];
  folders.forEach((folder) => {
    folder.auctions.forEach((auction) => {
      const existingIndex = recordIndexByAuctionId.get(auction.id.trim());
      if (existingIndex !== undefined) {
        const record = next[existingIndex];
        if (!sameAuctionSnapshot(record.auction, auction)) {
          next[existingIndex] = { ...record, auction: cloneAuction(auction) };
          changed = true;
        }
        seen.add(auctionLotSignature(auction));
        return;
      }
      const signature = auctionLotSignature(auction);
      if (seen.has(signature)) return;
      seen.add(signature);
      changed = true;
      next.push(createRecordFromAuction(auction, next.length));
    });
  });
  return changed ? next.slice(0, 500) : records;
}

export function removeAuctionLotLibraryRecord(records: AuctionLotLibraryRecord[], recordId: string): AuctionLotLibraryRecord[] {
  return records.filter((record) => record.id !== recordId);
}

export function buildAuctionLotLibraryEntries(records: AuctionLotLibraryRecord[], folders: AuctionDayFolder[]): AuctionLotLibraryEntry[] {
  const refsBySignature = new Map<string, AuctionLotLibraryFolderRef[]>();
  folders.forEach((folder) => {
    folder.auctions.forEach((auction) => {
      const signature = auctionLotSignature(auction);
      const refs = refsBySignature.get(signature) ?? [];
      refs.push({ folderId: folder.id, auctionId: auction.id, folderTitle: folder.title, dateLocal: folder.dateLocal });
      refsBySignature.set(signature, refs);
    });
  });
  return normalizeAuctionLotLibrary(records).map((record) => ({
    record,
    refs: refsBySignature.get(auctionLotSignature(record.auction)) ?? []
  }));
}

export function filterAuctionLotLibraryEntries(entries: AuctionLotLibraryEntry[], query: string): AuctionLotLibraryEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return entries;
  return entries.filter(({ record, refs }) => {
    const auction = record.auction;
    const haystack = [
      auction.id,
      auction.name,
      auction.description,
      auction.currency,
      auction.state,
      refs.map((ref) => `${ref.folderTitle} ${ref.dateLocal}`).join(' '),
      Object.values(auction.serverIds).join(' '),
      auction.items.map((item) => `${item.title} ${item.raw} ${item.legacyId ?? ''}`).join(' ')
    ].join(' ').toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function createDetachedAuctionLotRecord(index: number): AuctionLotLibraryRecord {
  const now = Date.now();
  const startLocal = localDateTimeInputFromUtcMs(now, defaultTimezoneOffset());
  return {
    id: `lot-detached-${now}-${Math.random().toString(36).slice(2)}`,
    createdAt: now,
    auction: createAuctionDraft(index, startLocal, {
      id: `library-${index}`,
      name: `Непривязанный лот ${index}`,
      planned: false
    })
  };
}

function uniqueAuctionId(folder: AuctionDayFolder, preferredId: string): string {
  if (!folder.auctions.some((auction) => auction.id === preferredId)) return preferredId;
  let index = 2;
  while (folder.auctions.some((auction) => auction.id === `${preferredId}-${index}`)) index += 1;
  return `${preferredId}-${index}`;
}

export function addAuctionLotRecordToFolder(
  folders: AuctionDayFolder[],
  records: AuctionLotLibraryRecord[],
  lotId: string,
  targetFolderId: string
): { auctionId: string; folderId: string; folders: AuctionDayFolder[] } {
  const targetFolder = folders.find((folder) => folder.id === targetFolderId);
  const record = records.find((item) => item.id === lotId);
  if (!targetFolder || !record) {
    return { auctionId: '', folderId: targetFolderId, folders };
  }
  const nextAuctionId = uniqueAuctionId(targetFolder, record.auction.id || `lot-${targetFolder.auctions.length + 1}`);
  const auction: AuctionDraft = {
    ...cloneAuction(record.auction),
    id: nextAuctionId,
    serverIds: {},
    startLocal: localDateTimeForDay(targetFolder.dateLocal, timeInputFromLocalDateTime(record.auction.startLocal)),
    durationMinutes: record.auction.durationMinutes || targetFolder.defaultDurationMinutes,
    state: record.auction.state ?? targetFolder.state,
    items: record.auction.items.map((item) => ({ ...item, uid: `${item.uid}-${Date.now()}-${Math.random().toString(36).slice(2)}` }))
  };
  return {
    auctionId: nextAuctionId,
    folderId: targetFolder.id,
    folders: folders.map((folder) => folder.id === targetFolder.id ? { ...folder, auctions: [...folder.auctions, auction] } : folder)
  };
}
