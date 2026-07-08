import { useEffect, useRef } from 'react';
import { getAuctionPlannerState, saveAuctionPlannerState } from '../../services/api/auctions';
import type { AuctionCommandStage, AuctionDayFolder, AuctionDraft, AuctionPlannerState, AuctionUiMode, AuctionWorkflowMode } from './auctionTypes';

type AuctionPlannerPersistenceParams = {
  dayFolders: AuctionDayFolder[];
  selectedDayFolderId: string;
  selectedAuctionId: string;
  workflowMode: AuctionWorkflowMode;
  uiMode: AuctionUiMode;
  commandStage: AuctionCommandStage;
  onLoad: (state: AuctionPlannerState) => void;
};

function normalizeLoadedAuction(auction: AuctionDraft, folder: AuctionDayFolder): AuctionDraft {
  return {
    ...auction,
    currency: auction.currency ?? folder.currency,
    baseStartPrice: Number.isFinite(auction.baseStartPrice) ? auction.baseStartPrice : folder.defaultStartPrice,
    baseStepPrice: Number.isFinite(auction.baseStepPrice) ? auction.baseStepPrice : folder.defaultStepPrice,
    durationMinutes: Number.isFinite(auction.durationMinutes) ? auction.durationMinutes : folder.defaultDurationMinutes,
    state: auction.state ?? folder.state,
    serverIds: auction.serverIds ?? {},
    items: Array.isArray(auction.items) ? auction.items : []
  };
}

function normalizeLoadedFolder(folder: AuctionDayFolder): AuctionDayFolder {
  const state = folder.state ?? folder.auctions?.[0]?.state ?? 'ACTIVE';
  const defaultStartPrice = Number.isFinite(folder.defaultStartPrice)
    ? folder.defaultStartPrice
    : folder.auctions?.[0]?.baseStartPrice ?? 100;
  const normalizedFolder: AuctionDayFolder = {
    ...folder,
    currency: folder.currency ?? 'DONATE',
    defaultDurationMinutes: Number.isFinite(folder.defaultDurationMinutes) ? folder.defaultDurationMinutes : 10,
    defaultStartPrice,
    defaultStepPrice: Number.isFinite(folder.defaultStepPrice) ? folder.defaultStepPrice : 10,
    state,
    auctions: []
  };
  normalizedFolder.auctions = (Array.isArray(folder.auctions) ? folder.auctions : [])
    .map((auction) => normalizeLoadedAuction(auction, normalizedFolder));
  return normalizedFolder;
}

export function useAuctionPlannerPersistence(params: AuctionPlannerPersistenceParams) {
  const paramsRef = useRef(params);
  const plannerLoadedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  paramsRef.current = params;

  useEffect(() => {
    let cancelled = false;
    getAuctionPlannerState()
      .then((payload) => {
        if (cancelled) return;
        const loadedFolders = Array.isArray(payload.state?.dayFolders)
          ? payload.state.dayFolders.map(normalizeLoadedFolder).filter((folder) => folder.auctions.length > 0)
          : [];
        if (!loadedFolders.length) return;
        const nextFolderId = loadedFolders.some((folder) => folder.id === payload.state.selectedDayFolderId)
          ? payload.state.selectedDayFolderId
          : loadedFolders[0].id;
        const nextFolder = loadedFolders.find((folder) => folder.id === nextFolderId) ?? loadedFolders[0];
        paramsRef.current.onLoad({
          dayFolders: loadedFolders,
          selectedDayFolderId: nextFolderId,
          selectedAuctionId: nextFolder.auctions.some((auction) => auction.id === payload.state.selectedAuctionId)
            ? payload.state.selectedAuctionId
            : nextFolder.auctions[0]?.id ?? '',
          workflowMode: payload.state.workflowMode ?? 'install',
          uiMode: payload.state.uiMode ?? 'normal',
          commandStage: payload.state.commandStage ?? 'create'
        });
      })
      .catch(() => {
        // Keep the local initial planner when the backend is unavailable.
      })
      .finally(() => {
        if (!cancelled) {
          plannerLoadedRef.current = true;
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!plannerLoadedRef.current) return undefined;
    const state: AuctionPlannerState = {
      dayFolders: params.dayFolders,
      selectedDayFolderId: params.selectedDayFolderId,
      selectedAuctionId: params.selectedAuctionId,
      workflowMode: params.workflowMode,
      uiMode: params.uiMode,
      commandStage: params.commandStage
    };
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      void saveAuctionPlannerState(state).catch(() => {
        // The next user edit will retry saving the latest planner state.
      });
    }, 600);
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [params.dayFolders, params.selectedDayFolderId, params.selectedAuctionId, params.workflowMode, params.uiMode, params.commandStage]);
}
