import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { addAuctionLotRecordToFolder, createDetachedAuctionLotRecord, mergeAuctionLotLibrary } from './auctionLotLibrary';
import type { AuctionLotDragPayload } from './auctionDragDrop';
import type { AuctionDayFolder, AuctionLotLibraryRecord } from './auctionTypes';
import type { AuctionWorkspaceViewMode } from './AuctionWorkspaceView';

type UseAuctionLotLibraryStateParams = {
  dayFolders: AuctionDayFolder[];
  setDayFolders: Dispatch<SetStateAction<AuctionDayFolder[]>>;
  setSelectedDayFolderId: (id: string) => void;
  setSelectedAuctionId: (id: string) => void;
  setWorkspaceView: (view: AuctionWorkspaceViewMode) => void;
};

export type AuctionLotLibraryState = {
  records: AuctionLotLibraryRecord[];
  setRecords: Dispatch<SetStateAction<AuctionLotLibraryRecord[]>>;
  createDetachedLot: () => void;
  openFirstAttachedLot: (recordId: string, refs: { folderId: string; auctionId: string }[]) => void;
  dropLotOnFolder: (payload: AuctionLotDragPayload, targetFolderId: string) => void;
};

export function useAuctionLotLibraryState({
  dayFolders,
  setDayFolders,
  setSelectedDayFolderId,
  setSelectedAuctionId,
  setWorkspaceView
}: UseAuctionLotLibraryStateParams): AuctionLotLibraryState {
  const [records, setRecords] = useState<AuctionLotLibraryRecord[]>([]);

  useEffect(() => {
    setRecords((current) => mergeAuctionLotLibrary(current, dayFolders));
  }, [dayFolders]);

  const createDetachedLot = useCallback(() => {
    setRecords((current) => mergeAuctionLotLibrary([
      ...current,
      createDetachedAuctionLotRecord(current.length + 1)
    ], dayFolders));
  }, [dayFolders]);

  const openFirstAttachedLot = useCallback((_: string, refs: { folderId: string; auctionId: string }[]) => {
    const [firstRef] = refs;
    if (!firstRef) return;
    setSelectedDayFolderId(firstRef.folderId);
    setSelectedAuctionId(firstRef.auctionId);
    setWorkspaceView('lot');
  }, [setSelectedAuctionId, setSelectedDayFolderId, setWorkspaceView]);

  const dropLotOnFolder = useCallback((payload: AuctionLotDragPayload, targetFolderId: string) => {
    const syncedRecords = mergeAuctionLotLibrary(records, dayFolders);
    const result = addAuctionLotRecordToFolder(dayFolders, syncedRecords, payload.lotId, targetFolderId);
    setRecords(syncedRecords);
    setDayFolders(result.folders);
    if (!result.auctionId) return;
    setSelectedDayFolderId(result.folderId);
    setSelectedAuctionId(result.auctionId);
    setWorkspaceView('folder');
  }, [dayFolders, records, setDayFolders, setSelectedAuctionId, setSelectedDayFolderId, setWorkspaceView]);

  return { records, setRecords, createDetachedLot, openFirstAttachedLot, dropLotOnFolder };
}
