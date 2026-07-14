import type { AuctionCommandStages } from './auctionCommands';
import { AuctionDayContentsPanel } from './AuctionDayContentsPanel';
import { AuctionDayDetailsPanel } from './AuctionDayDetailsPanel';
import { AuctionDayFolderGrid } from './AuctionDayFolderGrid';
import { AuctionGraphsWorkspace } from './AuctionGraphsWorkspace';
import { AuctionLotLibraryPanel } from './AuctionLotLibraryPanel';
import { AuctionLotQuickPanel } from './AuctionLotQuickPanel';
import { AuctionLotWorkspace } from './AuctionLotWorkspace';
import type { AuctionRibbonTab } from './AuctionRibbon';
import type { AuctionDayFolderSummary } from './auctionDayFolders';
import type { AuctionLotLibraryState } from './useAuctionLotLibraryState';
import type {
  AuctionCommandStage,
  AuctionCurrency,
  AuctionCurve,
  AuctionDayFolder,
  AuctionDraft,
  AuctionFolderCategory,
  AuctionFolderTag,
  AuctionItemOption,
  AuctionLotItem,
  AuctionRenderItemIcon,
  AuctionState,
  AuctionUiMode
} from './auctionTypes';

export type AuctionWorkspaceViewMode = 'folders' | 'folder' | 'lot';

type AuctionWorkspaceViewProps = {
  workspaceView: AuctionWorkspaceViewMode;
  ribbonTab: AuctionRibbonTab;
  dayFolders: AuctionDayFolder[];
  summaries: Record<string, AuctionDayFolderSummary>;
  selectedFolder: AuctionDayFolder | undefined;
  selectedAuction: AuctionDraft | undefined;
  selectedAuctionId: string;
  uiMode: AuctionUiMode;
  itemSearch: string;
  filteredItems: AuctionItemOption[];
  selectedAuctionFull: boolean;
  maxItemsPerAuction: number;
  renderItemIcon: AuctionRenderItemIcon;
  lotLibraryState: AuctionLotLibraryState;
  curve: AuctionCurve;
  graphStartLocal: string;
  commandStages: AuctionCommandStages;
  onBackToFolder: () => void;
  onBackToDays: () => void;
  onUpdateAuction: (id: string, patch: Partial<AuctionDraft>) => void;
  onUpdateServerId: (id: string, runIndex: number, serverId: string) => void;
  onItemSearchChange: (value: string) => void;
  onAddItem: (item: AuctionItemOption) => void;
  onUpdateItem: (uid: string, patch: Partial<AuctionLotItem>) => void;
  onMoveItem: (uid: string, direction: -1 | 1) => void;
  onRemoveItem: (uid: string) => void;
  onSetCommandStage: (stage: AuctionCommandStage) => void;
  onGraphStartLocalChange: (value: string) => void;
  onMoveGraphPoint: (currency: AuctionCurrency, sourceDay: number, targetDay: number, value: number) => number;
  onOpenFolder: (folderId?: string) => void;
  onSelectFolder: (folderId: string) => void;
  onCopyFolder: (folderId?: string) => void;
  onOpenGraphAuction: (folderId: string, auctionId: string) => void;
  onDuplicateGraphAuctionFolder: (folderId: string, auctionId: string) => void;
  onSetGraphFolderTag: (folderId: string, tag: AuctionFolderTag | null) => void;
  onSelectAuction: (auctionId: string) => void;
  onAddAuction: () => void;
  onOpenAuctionLot: (auctionId: string) => void;
  onCopyAuction: (auctionId: string) => void;
  onDeleteAuction: (auctionId: string) => void;
  onOpenCommands: (auctionId: string, stage: AuctionCommandStage) => void;
  onDeleteFolder: () => void;
  onApplyLotSettings: () => void;
  onTitleChange: (title: string) => void;
  onDateChange: (dateLocal: string) => void;
  onCategoryChange: (category: AuctionFolderCategory) => void;
  onTagChange: (tag: AuctionFolderTag | null) => void;
  onCurrencyChange: (currency: AuctionCurrency) => void;
  onDurationChange: (minutes: number) => void;
  onStepPriceChange: (step: number) => void;
  onStateChange: (state: AuctionState) => void;
  onRepeatEveryDaysChange: (days: number) => void;
  onRepeatCountChange: (count: number) => void;
  onPriceModeChange: (mode: AuctionDayFolder['priceMode']) => void;
};

export function AuctionWorkspaceView({
  workspaceView,
  ribbonTab,
  dayFolders,
  summaries,
  selectedFolder,
  selectedAuction,
  selectedAuctionId,
  uiMode,
  itemSearch,
  filteredItems,
  selectedAuctionFull,
  maxItemsPerAuction,
  renderItemIcon,
  lotLibraryState,
  curve,
  graphStartLocal,
  commandStages,
  onBackToFolder,
  onBackToDays,
  onUpdateAuction,
  onUpdateServerId,
  onItemSearchChange,
  onAddItem,
  onUpdateItem,
  onMoveItem,
  onRemoveItem,
  onSetCommandStage,
  onGraphStartLocalChange,
  onMoveGraphPoint,
  onOpenFolder,
  onSelectFolder,
  onCopyFolder,
  onOpenGraphAuction,
  onDuplicateGraphAuctionFolder,
  onSetGraphFolderTag,
  onSelectAuction,
  onAddAuction,
  onOpenAuctionLot,
  onCopyAuction,
  onDeleteAuction,
  onOpenCommands,
  onDeleteFolder,
  onApplyLotSettings,
  onTitleChange,
  onDateChange,
  onCategoryChange,
  onTagChange,
  onCurrencyChange,
  onDurationChange,
  onStepPriceChange,
  onStateChange,
  onRepeatEveryDaysChange,
  onRepeatCountChange,
  onPriceModeChange
}: AuctionWorkspaceViewProps) {
  if (selectedFolder && selectedAuction && workspaceView === 'lot') {
    return (
      <AuctionLotWorkspace
        folder={selectedFolder}
        auction={selectedAuction}
        uiMode={uiMode}
        itemSearch={itemSearch}
        filteredItems={filteredItems}
        selectedAuctionFull={selectedAuctionFull}
        maxItemsPerAuction={maxItemsPerAuction}
        renderItemIcon={renderItemIcon}
        onBackToFolder={onBackToFolder}
        onUpdateAuction={onUpdateAuction}
        onUpdateServerId={onUpdateServerId}
        onItemSearchChange={onItemSearchChange}
        onAddItem={onAddItem}
        onUpdateItem={onUpdateItem}
        onMoveItem={onMoveItem}
        onRemoveItem={onRemoveItem}
        onSetCommandStage={onSetCommandStage}
      />
    );
  }

  if (ribbonTab === 'graphs') {
    return (
      <AuctionGraphsWorkspace
        folders={dayFolders}
        summaries={summaries}
        selectedFolderId={selectedFolder?.id ?? ''}
        curve={curve}
        graphStartLocal={graphStartLocal}
        onGraphStartLocalChange={onGraphStartLocalChange}
        onMovePoint={onMoveGraphPoint}
        onOpenFolder={onOpenFolder}
        onDuplicateAuctionFolder={onDuplicateGraphAuctionFolder}
        onSetFolderTag={onSetGraphFolderTag}
        onOpenAuction={onOpenGraphAuction}
      />
    );
  }

  return (
    <>
      {workspaceView === 'folders' ? (
        <AuctionLotLibraryPanel
          folders={dayFolders}
          records={lotLibraryState.records}
          renderItemIcon={renderItemIcon}
          onCreateLot={lotLibraryState.createDetachedLot}
          onOpenAuction={lotLibraryState.openFirstAttachedLot}
        />
      ) : null}

      {selectedFolder && workspaceView === 'folder' ? (
        <AuctionDayContentsPanel
          folder={selectedFolder}
          selectedAuctionId={selectedAuctionId}
          renderItemIcon={renderItemIcon}
          onBackToDays={onBackToDays}
          onSelectAuction={onSelectAuction}
          onAddAuction={onAddAuction}
          onOpenAuction={onOpenAuctionLot}
          onCopyAuction={onCopyAuction}
          onDeleteAuction={onDeleteAuction}
          onOpenCommands={onOpenCommands}
        />
      ) : (
        <AuctionDayFolderGrid
          folders={dayFolders}
          selectedFolderId={selectedFolder?.id ?? ''}
          summaries={summaries}
          onSelectFolder={onSelectFolder}
          onOpenFolder={onOpenFolder}
          onCopyFolder={onCopyFolder}
          onDropAuctionLot={lotLibraryState.dropLotOnFolder}
        />
      )}

      {workspaceView === 'folder' ? (
        <AuctionLotQuickPanel
          auction={selectedAuction}
          renderItemIcon={renderItemIcon}
          onOpenLot={onOpenAuctionLot}
          onUpdateAuction={onUpdateAuction}
          onUpdateServerId={onUpdateServerId}
          onOpenCommands={onOpenCommands}
          onApply={onApplyLotSettings}
        />
      ) : (
        <AuctionDayDetailsPanel
          folder={selectedFolder}
          summary={selectedFolder ? summaries[selectedFolder.id] : undefined}
          uiMode={uiMode}
          commandStages={commandStages}
          onOpenFolder={() => onOpenFolder()}
          onCopyFolder={() => onCopyFolder()}
          onDeleteFolder={onDeleteFolder}
          onTitleChange={onTitleChange}
          onDateChange={onDateChange}
          onCategoryChange={onCategoryChange}
          onTagChange={onTagChange}
          onCurrencyChange={onCurrencyChange}
          onDurationChange={onDurationChange}
          onStepPriceChange={onStepPriceChange}
          onStateChange={onStateChange}
          onRepeatEveryDaysChange={onRepeatEveryDaysChange}
          onRepeatCountChange={onRepeatCountChange}
          onPriceModeChange={onPriceModeChange}
        />
      )}
    </>
  );
}
