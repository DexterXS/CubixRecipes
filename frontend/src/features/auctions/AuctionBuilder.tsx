import { useMemo, useRef, useState } from 'react';
import { buildAuctionCommandStages, createDefaultAuctionCurve, localDateTimeInputFromUtcMs } from './auctionCommands';
import { applyDayDefaultsToAuctions, cloneAuctionDayFolder, createAuctionDayFolder, createAuctionDraft, createInitialAuctionDayFolder, defaultTimezoneOffset, formatAuctionDayTitle, localDateTimeForDay, nextDayLocal, summarizeAuctionDayFolder } from './auctionDayFolders';
import { auctionNameFromItems, moveLotItem } from './auctionLotItems';
import { duplicateAuctionGraphFolder, moveAuctionGraphPointFolders } from './auctionGraphModel';
import { AuctionDayContentsPanel } from './AuctionDayContentsPanel';
import { AuctionDayDetailsPanel } from './AuctionDayDetailsPanel';
import { AuctionDayFolderGrid } from './AuctionDayFolderGrid';
import { AuctionDownloadModal } from './AuctionDownloadModal';
import { AuctionGraphPanel } from './AuctionGraphPanel';
import { AuctionLotWorkspace } from './AuctionLotWorkspace';
import { AuctionRibbon, type AuctionRibbonTab } from './AuctionRibbon';
import { AuctionStatusBar } from './AuctionStatusBar';
import { useAuctionPlannerPersistence } from './useAuctionPlannerPersistence';
import type { AuctionBuilderMode, AuctionCommandStage, AuctionCurrency, AuctionCurve, AuctionDayFolder, AuctionDraft, AuctionFolderCategory, AuctionFolderTag, AuctionItemIdMode, AuctionItemOption, AuctionLotItem, AuctionRenderItemIcon, AuctionState, AuctionUiMode, AuctionWorkflowMode } from './auctionTypes';
import './AuctionBuilder.css';

export function AuctionBuilder({ itemOptions, renderItemIcon }: { itemOptions: AuctionItemOption[]; renderItemIcon: AuctionRenderItemIcon }) {
  const now = Date.now();
  const [workflowMode, setWorkflowMode] = useState<AuctionWorkflowMode>('install');
  const [workspaceView, setWorkspaceView] = useState<'folders' | 'folder' | 'lot'>('folders');
  const [ribbonTab, setRibbonTab] = useState<AuctionRibbonTab>('auctions');
  const [uiMode, setUiMode] = useState<AuctionUiMode>('normal');
  const [commandStage, setCommandStage] = useState<AuctionCommandStage>('create');
  const [idMode] = useState<AuctionItemIdMode>('raw');
  const [commandPlayer] = useState('@p');
  const [graphStartLocal, setGraphStartLocal] = useState(() => localDateTimeInputFromUtcMs(now, defaultTimezoneOffset()));
  const [dayFolders, setDayFolders] = useState<AuctionDayFolder[]>(() => [createInitialAuctionDayFolder(now, defaultTimezoneOffset())]);
  const [selectedDayFolderId, setSelectedDayFolderId] = useState('day-1');
  const [selectedAuctionId, setSelectedAuctionId] = useState('1');
  const [curve, setCurve] = useState<AuctionCurve>(() => createDefaultAuctionCurve());
  const [itemSearch, setItemSearch] = useState('');
  const [maxItemsPerAuction] = useState(16);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [filenameDraft, setFilenameDraft] = useState(() => `auctions_${localDateTimeInputFromUtcMs(now, defaultTimezoneOffset()).replace(/[-:T]/g, '')}`);
  const dayFoldersRef = useRef(dayFolders); dayFoldersRef.current = dayFolders;

  const selectedDayFolder = dayFolders.find((folder) => folder.id === selectedDayFolderId) ?? dayFolders[0];
  const auctions = selectedDayFolder?.auctions ?? [];
  const timezoneOffset = selectedDayFolder?.timezoneOffsetMinutes ?? defaultTimezoneOffset();
  const dayFolderSummaries = useMemo(() => Object.fromEntries(dayFolders.map((folder) => [
    folder.id,
    summarizeAuctionDayFolder({ folder, curve, graphStartLocal })
  ])), [dayFolders, curve, graphStartLocal]);
  const selectedAuction = auctions.find((auction) => auction.id === selectedAuctionId) ?? auctions[0];
  const commandCurve = useMemo(() => selectedDayFolder?.category === 'planned' ? createDefaultAuctionCurve() : curve, [selectedDayFolder?.category, curve]);
  const commandStages = useMemo(() => buildAuctionCommandStages({ auctions, curve: commandCurve, idMode, timezoneOffsetMinutes: timezoneOffset, commandPlayer, graphStartLocal, workflowMode }), [auctions, commandCurve, idMode, timezoneOffset, commandPlayer, graphStartLocal, workflowMode]);
  const commands = commandStages[commandStage];
  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    if (!query) return itemOptions.slice(0, 80);
    return itemOptions.filter((item) => `${item.raw} ${item.title} ${item.legacyId ?? ''}`.toLowerCase().includes(query)).slice(0, 120);
  }, [itemOptions, itemSearch]);
  const selectedAuctionFull = selectedAuction ? selectedAuction.items.length >= maxItemsPerAuction : false;

  useAuctionPlannerPersistence({
    dayFolders,
    selectedDayFolderId: selectedDayFolder?.id ?? selectedDayFolderId,
    selectedAuctionId: selectedAuction?.id ?? selectedAuctionId,
    workflowMode,
    uiMode,
    commandStage,
    curve,
    graphStartLocal,
    onLoad: (state) => {
      setDayFolders(state.dayFolders);
      setSelectedDayFolderId(state.selectedDayFolderId);
      setSelectedAuctionId(state.selectedAuctionId);
      setWorkflowMode(state.workflowMode);
      setUiMode(state.uiMode);
      setCommandStage(state.commandStage);
      if (state.curve) setCurve(state.curve);
      if (state.graphStartLocal) setGraphStartLocal(state.graphStartLocal);
    }
  });

  const updateSelectedDayFolder = (updater: (folder: AuctionDayFolder) => AuctionDayFolder) => {
    if (!selectedDayFolder) return;
    setDayFolders((current) => current.map((folder) => folder.id === selectedDayFolder.id ? updater(folder) : folder));
  };

  const updateSelectedDayAuctions = (updater: (auctions: AuctionDayFolder['auctions']) => AuctionDayFolder['auctions']) => {
    updateSelectedDayFolder((folder) => ({ ...folder, auctions: updater(folder.auctions) }));
  };

  const selectDayFolder = (id: string) => {
    const folder = dayFolders.find((item) => item.id === id);
    if (!folder) return;
    setSelectedDayFolderId(id);
    setSelectedAuctionId(folder.auctions[0]?.id ?? '');
  };

  const openDayFolder = (id = selectedDayFolder?.id) => {
    const folder = dayFolders.find((item) => item.id === id);
    if (!folder) return;
    setSelectedDayFolderId(folder.id);
    setSelectedAuctionId(folder.auctions[0]?.id ?? '');
    setWorkspaceView('folder');
  };

  const openAuctionLot = (id: string) => {
    setSelectedAuctionId(id);
    setWorkspaceView('lot');
  };

  const addDayFolder = () => {
    const nextIndex = dayFolders.length + 1;
    const dateLocal = selectedDayFolder ? nextDayLocal(selectedDayFolder.dateLocal) : localDateTimeInputFromUtcMs(now + 86_400_000, timezoneOffset).slice(0, 10);
    const next = createAuctionDayFolder({
      id: `day-${nextIndex}`,
      dateLocal,
      timezoneOffsetMinutes: timezoneOffset
    });
    setDayFolders((current) => [...current, next]);
    setSelectedDayFolderId(next.id);
    setSelectedAuctionId(next.auctions[0]?.id ?? '');
    setWorkspaceView('folders');
  };

  const copySelectedDayFolder = (sourceId = selectedDayFolder?.id) => {
    const source = dayFolders.find((folder) => folder.id === sourceId);
    if (!source) return;
    const nextIndex = dayFolders.length + 1;
    const copy = cloneAuctionDayFolder(source, {
      id: `day-${nextIndex}`,
      dateLocal: nextDayLocal(source.dateLocal)
    });
    setDayFolders((current) => [...current, copy]);
    setSelectedDayFolderId(copy.id);
    setSelectedAuctionId(copy.auctions[0]?.id ?? '');
    setWorkspaceView('folders');
  };

  const deleteSelectedDayFolder = () => {
    if (!selectedDayFolder || dayFolders.length <= 1) return;
    const confirmed = window.confirm(`Удалить папку "${selectedDayFolder.title}" вместе со всеми локальными аукционами?`);
    if (!confirmed) return;
    const remaining = dayFolders.filter((folder) => folder.id !== selectedDayFolder.id);
    setDayFolders(remaining);
    setSelectedDayFolderId(remaining[0]?.id ?? '');
    setSelectedAuctionId(remaining[0]?.auctions[0]?.id ?? '');
    setWorkspaceView('folders');
  };

  const updateDayCurrency = (currency: AuctionCurrency) => {
    updateSelectedDayFolder((folder) => ({
      ...folder,
      currency,
      auctions: folder.auctions.map((auction) => ({ ...auction, currency }))
    }));
  };

  const updateDayDuration = (minutes: number) => {
    const defaultDurationMinutes = Math.max(1, Math.round(Number.isFinite(minutes) ? minutes : 1));
    updateSelectedDayFolder((folder) => ({
      ...folder,
      defaultDurationMinutes,
      auctions: folder.auctions.map((auction) => ({ ...auction, durationMinutes: defaultDurationMinutes }))
    }));
  };

  const updateDayStepPrice = (step: number) => {
    const defaultStepPrice = Math.max(1, Math.round(Number.isFinite(step) ? step : 1));
    updateSelectedDayFolder((folder) => ({
      ...folder,
      defaultStepPrice,
      auctions: folder.auctions.map((auction) => ({ ...auction, baseStepPrice: defaultStepPrice }))
    }));
  };

  const updateDayState = (state: AuctionState) => {
    updateSelectedDayFolder((folder) => ({
      ...folder,
      state,
      auctions: folder.auctions.map((auction) => ({ ...auction, state }))
    }));
  };

  const updateGraphPoint = (currency: AuctionCurrency, sourceDay: number, targetDay: number, value: number) => {
    const currentFolders = dayFoldersRef.current;
    const nextFolders = sourceDay === targetDay ? currentFolders : moveAuctionGraphPointFolders({ folders: currentFolders, currency, sourceDay, targetDay, graphStartLocal });
    const appliedDay = nextFolders === currentFolders ? sourceDay : targetDay;
    setCurve((current) => ({ ...current, [currency]: current[currency].map((point, index) => index === appliedDay ? value : point) }));
    if (nextFolders !== currentFolders) { dayFoldersRef.current = nextFolders; setDayFolders(nextFolders); }
    return appliedDay;
  };

  const duplicateGraphAuctionFolder = (folderId: string, auctionId: string) => {
    setDayFolders((current) => {
      const result = duplicateAuctionGraphFolder({ folders: current, folderId, auctionId });
      setSelectedDayFolderId(result.folderId); setSelectedAuctionId(result.auctionId);
      return result.folders;
    });
    setWorkspaceView('lot');
  };

  const setGraphFolderTag = (folderId: string, tag: AuctionFolderTag | null) => setDayFolders((current) => current.map((folder) => folder.id === folderId ? { ...folder, tag } : folder));

  const updateDayTitle = (title: string) => {
    updateSelectedDayFolder((folder) => ({ ...folder, title }));
  };

  const updateDayDate = (dateLocal: string) => {
    if (!dateLocal) return;
    updateSelectedDayFolder((folder) => ({
      ...folder,
      dateLocal,
      title: folder.title === formatAuctionDayTitle(folder.dateLocal) ? formatAuctionDayTitle(dateLocal) : folder.title,
      auctions: folder.auctions.map((auction) => ({
        ...auction,
        startLocal: localDateTimeForDay(dateLocal, auction.startLocal.includes('T') ? auction.startLocal.slice(11, 16) : '10:00')
      }))
    }));
  };

  const updateDayCategory = (category: AuctionFolderCategory) => {
    updateSelectedDayFolder((folder) => ({
      ...folder,
      category,
      title: folder.title === formatAuctionDayTitle(folder.dateLocal) || folder.title === 'Планируемая папка'
        ? (category === 'planned' ? 'Планируемая папка' : formatAuctionDayTitle(folder.dateLocal))
        : folder.title,
      priceMode: category === 'planned' ? 'manual' : folder.priceMode,
      graphMode: category === 'planned' ? 'fixed' : 'linear',
      repeatEnabled: category === 'planned',
      auctions: folder.auctions.map((auction) => ({ ...auction, repeatEnabled: category === 'planned' ? true : auction.repeatEnabled }))
    }));
  };

  const updateDayRepeatEveryDays = (days: number) => {
    const repeatEveryDays = Math.max(1, Math.round(Number.isFinite(days) ? days : 1));
    updateSelectedDayFolder((folder) => ({
      ...folder,
      repeatEveryDays,
      auctions: folder.auctions.map((auction) => ({ ...auction, repeatEveryDays }))
    }));
  };

  const updateDayRepeatCount = (count: number) => {
    const repeatCount = Math.max(1, Math.min(90, Math.round(Number.isFinite(count) ? count : 1)));
    updateSelectedDayFolder((folder) => ({
      ...folder,
      repeatCount,
      auctions: folder.auctions.map((auction) => ({ ...auction, repeatCount }))
    }));
  };

  const applySelectedDayDefaults = () => {
    updateSelectedDayFolder((folder) => applyDayDefaultsToAuctions(folder));
  };

  const resetSelectedDayPrices = () => {
    updateSelectedDayAuctions((current) => current.map((auction) => ({
      ...auction,
      baseStartPrice: 100
    })));
  };

  const clearSelectedDayServerIds = () => {
    updateSelectedDayAuctions((current) => current.map((auction) => ({ ...auction, serverIds: {} })));
    setCommandStage('ids');
  };

  const checkSelectedDayErrors = () => {
    setCommandStage(commandStages.missingServerIds.length ? 'ids' : 'settings');
  };

  const updateAuction = (id: string, patch: Partial<AuctionDraft>) => {
    updateSelectedDayAuctions((current) => current.map((auction) => auction.id === id ? { ...auction, ...patch } : auction));
  };

  const renameAuction = (id: string, nextId: string) => {
    updateSelectedDayAuctions((current) => current.map((auction) => auction.id === id ? { ...auction, id: nextId } : auction));
    setSelectedAuctionId(nextId);
  };

  const updateServerId = (id: string, runIndex: number, serverId: string) => {
    updateSelectedDayAuctions((current) => current.map((auction) => auction.id === id
      ? { ...auction, serverIds: { ...auction.serverIds, [String(runIndex)]: serverId } }
      : auction));
  };

  const addAuction = () => {
    const nextIndex = auctions.length + 1;
    const nextStartLocal = selectedDayFolder
      ? localDateTimeForDay(selectedDayFolder.dateLocal, '10:00')
      : localDateTimeInputFromUtcMs(now + nextIndex * 86_400_000, timezoneOffset);
    const next = createAuctionDraft(nextIndex, nextStartLocal, {
      currency: selectedDayFolder?.currency ?? 'DONATE',
      durationMinutes: selectedDayFolder?.defaultDurationMinutes ?? 10,
      baseStartPrice: selectedDayFolder?.defaultStartPrice ?? 100,
      baseStepPrice: selectedDayFolder?.defaultStepPrice ?? 10,
      state: selectedDayFolder?.state ?? 'ACTIVE',
      repeatEnabled: selectedDayFolder?.repeatEnabled ?? false,
      repeatEveryDays: selectedDayFolder?.repeatEveryDays ?? 7,
      repeatCount: selectedDayFolder?.repeatCount ?? 1,
      scheduleLeadMinutes: selectedDayFolder?.scheduleLeadMinutes ?? 1
    });
    updateSelectedDayAuctions((current) => [...current, next].slice(0, 90));
    setSelectedAuctionId(next.id);
    setWorkspaceView('folder');
  };

  const copyAuction = (id: string) => {
    const source = auctions.find((auction) => auction.id === id);
    if (!source) return;
    const nextIndex = auctions.length + 1;
    const copy: AuctionDraft = {
      ...source,
      id: `${source.id}-copy-${nextIndex}`,
      name: `${source.name} копия`,
      serverIds: {},
      items: source.items.map((item) => ({ ...item, uid: `${item.uid}-copy-${Date.now()}` }))
    };
    updateSelectedDayAuctions((current) => [...current, copy].slice(0, 90));
    setSelectedAuctionId(copy.id);
    setWorkspaceView('folder');
  };

  const deleteAuction = (id: string) => {
    if (auctions.length <= 1) return;
    updateSelectedDayAuctions((current) => current.filter((auction) => auction.id !== id));
    if (selectedAuctionId === id) {
      const next = auctions.find((auction) => auction.id !== id);
      setSelectedAuctionId(next?.id ?? '');
    }
  };

  const setBuilderMode = (nextMode: AuctionBuilderMode) => {
    if (nextMode === 'items' && selectedAuction) {
      setWorkspaceView('lot');
    }
  };

  const addItemToAuction = (option: AuctionItemOption) => {
    if (!selectedAuction) return;
    if (selectedAuction.items.length >= maxItemsPerAuction) return;
    const item: AuctionLotItem = { ...option, uid: `${option.raw}-${Date.now()}-${Math.random().toString(36).slice(2)}`, quantity: 1, basePrice: 100 };
    const items = [...selectedAuction.items, item];
    updateAuction(selectedAuction.id, { items, name: auctionNameFromItems(items, selectedAuction.name) });
  };

  const updateLotItem = (uid: string, patch: Partial<AuctionLotItem>) => {
    if (!selectedAuction) return;
    const items = selectedAuction.items.map((item) => item.uid === uid ? { ...item, ...patch } : item);
    updateAuction(selectedAuction.id, { items, name: auctionNameFromItems(items, selectedAuction.name) });
  };

  const moveSelectedLotItem = (uid: string, direction: -1 | 1) => {
    if (!selectedAuction) return;
    const items = moveLotItem(selectedAuction.items, uid, direction);
    updateAuction(selectedAuction.id, { items, name: auctionNameFromItems(items, selectedAuction.name) });
  };

  const removeLotItem = (uid: string) => {
    if (!selectedAuction) return;
    const items = selectedAuction.items.filter((item) => item.uid !== uid);
    updateAuction(selectedAuction.id, { items, name: auctionNameFromItems(items, selectedAuction.name) });
  };

  return (
    <div className="auction-builder">
      <AuctionRibbon
        activeTab={ribbonTab}
        selectedFolder={selectedDayFolder}
        uiMode={uiMode}
        workflowMode={workflowMode}
        timezoneOffset={timezoneOffset}
        onTabChange={setRibbonTab}
        onUiModeChange={setUiMode}
        onWorkflowModeChange={(nextMode) => {
          setWorkflowMode(nextMode);
          setCommandStage(nextMode === 'install' ? 'create' : 'ids');
        }}
        onNewDay={addDayFolder}
        onCopyDay={copySelectedDayFolder}
        onDeleteDay={deleteSelectedDayFolder}
        onCurrencyChange={updateDayCurrency}
        onDurationChange={updateDayDuration}
        onStepPriceChange={updateDayStepPrice}
        onTimezoneOffsetChange={(offset) => updateSelectedDayFolder((folder) => ({ ...folder, timezoneOffsetMinutes: offset }))}
        onPriceModeChange={(priceMode) => updateSelectedDayFolder((folder) => ({ ...folder, priceMode }))}
        onApplyDayDefaults={applySelectedDayDefaults}
        onResetPrices={resetSelectedDayPrices}
        onClearServerIds={clearSelectedDayServerIds}
        onCheckErrors={checkSelectedDayErrors}
        onSetBuilderMode={setBuilderMode}
        onSetCommandStage={setCommandStage}
        onOpenDownload={() => setDownloadModalOpen(true)}
      />

      <div className={`auction-layout ${workspaceView === 'lot' ? 'lot-view' : ''}`}>
        {selectedDayFolder && selectedAuction && workspaceView === 'lot' ? (
          <AuctionLotWorkspace
            folder={selectedDayFolder}
            auction={selectedAuction}
            uiMode={uiMode}
            itemSearch={itemSearch}
            filteredItems={filteredItems}
            selectedAuctionFull={selectedAuctionFull}
            maxItemsPerAuction={maxItemsPerAuction}
            renderItemIcon={renderItemIcon}
            onBackToFolder={() => setWorkspaceView('folder')}
            onUpdateAuction={updateAuction}
            onUpdateServerId={updateServerId}
            onItemSearchChange={setItemSearch}
            onAddItem={addItemToAuction}
            onUpdateItem={updateLotItem}
            onMoveItem={moveSelectedLotItem}
            onRemoveItem={removeLotItem}
            onSetCommandStage={setCommandStage}
          />
        ) : (
          <>
            {ribbonTab === 'graphs' ? (
              <AuctionGraphPanel
                folders={dayFolders}
                curve={curve}
                graphStartLocal={graphStartLocal}
                onMovePoint={updateGraphPoint}
                onDuplicateAuctionFolder={duplicateGraphAuctionFolder}
                onSetFolderTag={setGraphFolderTag}
                onOpenAuction={(folderId, auctionId) => {
                  setSelectedDayFolderId(folderId);
                  setSelectedAuctionId(auctionId);
                  setWorkspaceView('lot');
                }}
              />
            ) : selectedDayFolder && workspaceView === 'folder' ? (
              <AuctionDayContentsPanel
                folder={selectedDayFolder}
                selectedAuctionId={selectedAuctionId}
                renderItemIcon={renderItemIcon}
                onBackToDays={() => setWorkspaceView('folders')}
                onSelectAuction={setSelectedAuctionId}
                onAddAuction={addAuction}
                onOpenAuction={openAuctionLot}
                onCopyAuction={copyAuction}
                onDeleteAuction={deleteAuction}
                onOpenCommands={(id, stage) => {
                  setSelectedAuctionId(id);
                  setCommandStage(stage);
                }}
              />
            ) : (
              <AuctionDayFolderGrid
                folders={dayFolders}
                selectedFolderId={selectedDayFolder?.id ?? ''}
                summaries={dayFolderSummaries}
                onSelectFolder={selectDayFolder}
                onOpenFolder={openDayFolder}
                onCopyFolder={copySelectedDayFolder}
              />
            )}

            <AuctionDayDetailsPanel
              folder={selectedDayFolder}
              summary={selectedDayFolder ? dayFolderSummaries[selectedDayFolder.id] : undefined}
              uiMode={uiMode}
              commandStages={commandStages}
              onOpenFolder={() => openDayFolder()}
              onCopyFolder={() => copySelectedDayFolder()}
              onDeleteFolder={deleteSelectedDayFolder}
              onTitleChange={updateDayTitle}
              onDateChange={updateDayDate}
              onCategoryChange={updateDayCategory}
              onTagChange={(tag) => updateSelectedDayFolder((folder) => ({ ...folder, tag }))}
              onCurrencyChange={updateDayCurrency}
              onDurationChange={updateDayDuration}
              onStepPriceChange={updateDayStepPrice}
              onStateChange={updateDayState}
              onRepeatEveryDaysChange={updateDayRepeatEveryDays}
              onRepeatCountChange={updateDayRepeatCount}
              onPriceModeChange={(priceMode) => updateSelectedDayFolder((folder) => ({ ...folder, priceMode }))}
            />
          </>
        )}
      </div>

      <AuctionStatusBar
        view={workspaceView}
        folders={dayFolders}
        summaries={dayFolderSummaries}
        selectedFolder={selectedDayFolder}
        selectedAuction={selectedAuction}
      />

      {downloadModalOpen ? (
        <AuctionDownloadModal
          filenameDraft={filenameDraft}
          commands={commands}
          onFilenameChange={setFilenameDraft}
          onClose={() => setDownloadModalOpen(false)}
        />
      ) : null}
    </div>
  );
}
