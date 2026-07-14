import { useCallback, useEffect, useRef } from 'react';
import { getAuctionPlannerState, saveAuctionPlannerState } from '../../services/api/auctions';
import { dateInputFromLocalDateTime, formatAuctionDayTitle } from './auctionDayFolders';
import { normalizeAuctionCommandProfile } from './auctionCommandProfile';
import { mergeAuctionLotLibrary, normalizeAuctionLotLibrary } from './auctionLotLibrary';
import type { AuctionCommandProfile, AuctionCommandStage, AuctionCurve, AuctionDayFolder, AuctionDraft, AuctionLotLibraryRecord, AuctionPlannerState, AuctionUiMode, AuctionWorkflowMode } from './auctionTypes';

type AuctionPlannerPersistenceParams = {
  dayFolders: AuctionDayFolder[];
  selectedDayFolderId: string;
  selectedAuctionId: string;
  workflowMode: AuctionWorkflowMode;
  uiMode: AuctionUiMode;
  commandStage: AuctionCommandStage;
  commandProfile: AuctionCommandProfile;
  curve: AuctionCurve;
  graphStartLocal: string;
  lotLibrary: AuctionLotLibraryRecord[];
  onLoad: (state: AuctionPlannerState) => void;
};

const REMOTE_REFRESH_INTERVAL_MS = 5000;

function buildPlannerState(params: AuctionPlannerPersistenceParams): AuctionPlannerState {
  return {
    dayFolders: params.dayFolders,
    selectedDayFolderId: params.selectedDayFolderId,
    selectedAuctionId: params.selectedAuctionId,
    workflowMode: params.workflowMode,
    uiMode: params.uiMode,
    commandStage: params.commandStage,
    commandProfile: params.commandProfile,
    curve: params.curve,
    graphStartLocal: params.graphStartLocal,
    lotLibrary: params.lotLibrary
  };
}

function normalizeLoadedAuction(auction: AuctionDraft, folder: AuctionDayFolder): AuctionDraft {
  return {
    ...auction,
    currency: auction.currency ?? folder.currency,
    baseStartPrice: Number.isFinite(auction.baseStartPrice) ? auction.baseStartPrice : folder.defaultStartPrice,
    baseStepPrice: Number.isFinite(auction.baseStepPrice) ? auction.baseStepPrice : folder.defaultStepPrice,
    durationMinutes: Number.isFinite(auction.durationMinutes) ? auction.durationMinutes : folder.defaultDurationMinutes,
    state: auction.state ?? folder.state,
    serverIds: auction.serverIds ?? {},
    addItemsToAuction: auction.addItemsToAuction !== false,
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
    tag: folder.tag ?? null,
    defaultDurationMinutes: Number.isFinite(folder.defaultDurationMinutes) ? folder.defaultDurationMinutes : 10,
    defaultStartPrice,
    defaultStepPrice: Number.isFinite(folder.defaultStepPrice) ? folder.defaultStepPrice : 10,
    state,
    auctions: []
  };
  normalizedFolder.auctions = (Array.isArray(folder.auctions) ? folder.auctions : [])
    .map((auction) => normalizeLoadedAuction(auction, normalizedFolder));
  const auctionDates = new Set(normalizedFolder.auctions.map((auction) => dateInputFromLocalDateTime(auction.startLocal)).filter(Boolean));
  const [auctionDateLocal] = Array.from(auctionDates);
  if (normalizedFolder.category !== 'planned' && auctionDates.size === 1 && auctionDateLocal) {
    const previousTitle = normalizedFolder.title;
    const previousDateTitle = formatAuctionDayTitle(normalizedFolder.dateLocal);
    normalizedFolder.dateLocal = auctionDateLocal;
    if (!previousTitle || previousTitle === previousDateTitle) {
      normalizedFolder.title = formatAuctionDayTitle(auctionDateLocal);
    }
  }
  return normalizedFolder;
}

export function normalizePlannerState(payload: { state: Partial<AuctionPlannerState> }, localState?: AuctionPlannerState): AuctionPlannerState | null {
  const remoteState = payload.state ?? {};
  const commandProfile = normalizeAuctionCommandProfile(remoteState.commandProfile ?? localState?.commandProfile);
  const loadedFolders = Array.isArray(remoteState.dayFolders)
    ? remoteState.dayFolders.map(normalizeLoadedFolder).filter((folder) => folder.auctions.length > 0)
    : [];
  const lotLibrary = mergeAuctionLotLibrary(
    normalizeAuctionLotLibrary(remoteState.lotLibrary ?? localState?.lotLibrary ?? []),
    loadedFolders
  );
  if (!loadedFolders.length) {
    if (!localState) return null;
    return {
      ...localState,
      commandProfile,
      curve: remoteState.curve ?? localState.curve,
      graphStartLocal: remoteState.graphStartLocal ?? localState.graphStartLocal,
      lotLibrary
    };
  }

  const requestedFolderId = localState?.selectedDayFolderId ?? remoteState.selectedDayFolderId;
  const nextFolderId = loadedFolders.some((folder) => folder.id === requestedFolderId)
    ? requestedFolderId
    : loadedFolders[0].id;
  const nextFolder = loadedFolders.find((folder) => folder.id === nextFolderId) ?? loadedFolders[0];
  const requestedAuctionId = localState?.selectedAuctionId ?? remoteState.selectedAuctionId;
  const nextAuctionId = nextFolder.auctions.some((auction) => auction.id === requestedAuctionId)
    ? requestedAuctionId
    : nextFolder.auctions[0]?.id ?? '';

  return {
    dayFolders: loadedFolders,
    selectedDayFolderId: nextFolderId,
    selectedAuctionId: nextAuctionId,
    workflowMode: localState?.workflowMode ?? remoteState.workflowMode ?? 'install',
    uiMode: localState?.uiMode ?? remoteState.uiMode ?? 'normal',
    commandStage: localState?.commandStage ?? remoteState.commandStage ?? 'create',
    commandProfile,
    curve: remoteState.curve ?? localState?.curve,
    graphStartLocal: remoteState.graphStartLocal ?? localState?.graphStartLocal,
    lotLibrary
  };
}

export function useAuctionPlannerPersistence(params: AuctionPlannerPersistenceParams) {
  const paramsRef = useRef(params);
  const plannerLoadedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedAtRef = useRef(0);
  const dirtyRef = useRef(false);
  const suppressNextSaveRef = useRef(false);
  paramsRef.current = params;

  const saveNow = useCallback(async (overrides: Partial<AuctionPlannerState> = {}) => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const state = { ...buildPlannerState(paramsRef.current), ...overrides };
    try {
      const payload = await saveAuctionPlannerState(state);
      lastSavedAtRef.current = payload.savedAt;
      dirtyRef.current = false;
      return payload;
    } catch (error) {
      dirtyRef.current = true;
      throw error;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAuctionPlannerState()
      .then((payload) => {
        if (cancelled) return;
        lastSavedAtRef.current = payload.savedAt;
        let nextState = normalizePlannerState(payload);
        if (!nextState) {
          nextState = normalizePlannerState(payload, buildPlannerState(paramsRef.current));
        }
        if (nextState) paramsRef.current.onLoad(nextState);
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
    const timer = window.setInterval(() => {
      if (!plannerLoadedRef.current || dirtyRef.current || saveTimerRef.current !== null) return;
      void getAuctionPlannerState()
        .then((payload) => {
          if (!payload.savedAt || payload.savedAt <= lastSavedAtRef.current) return;
          const nextState = normalizePlannerState(payload, buildPlannerState(paramsRef.current));
          if (!nextState) return;
          lastSavedAtRef.current = payload.savedAt;
          suppressNextSaveRef.current = true;
          paramsRef.current.onLoad(nextState);
        })
        .catch(() => {
          // A failed refresh should not interrupt local editing.
        });
    }, REMOTE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!plannerLoadedRef.current) return undefined;
    if (suppressNextSaveRef.current) {
      suppressNextSaveRef.current = false;
      return undefined;
    }
    dirtyRef.current = true;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveNow().catch(() => {
        // The next user edit will retry saving the latest planner state.
      });
    }, 600);
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [params.dayFolders, params.selectedDayFolderId, params.selectedAuctionId, params.workflowMode, params.uiMode, params.commandStage, params.commandProfile, params.curve, params.graphStartLocal, params.lotLibrary, saveNow]);

  return { saveNow };
}
