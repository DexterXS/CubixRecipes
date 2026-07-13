import type { ReactNode } from 'react';

export type AuctionCurrency = 'VAULT' | 'DONATE' | 'BONUS';
export type AuctionBuilderMode = 'config' | 'items';
export type AuctionWorkflowMode = 'install' | 'existing';
export type AuctionCommandModeId = string;
export type AuctionCommandOrderMode = 'grouped' | 'perLot';
export type AuctionCommandStage = 'create' | 'ids' | 'items' | 'settings';
export type AuctionCommandTemplateKey =
  | 'create'
  | 'giveItem'
  | 'addItem'
  | 'setName'
  | 'setDescription'
  | 'setStartDate'
  | 'setEndDate'
  | 'setCurrency'
  | 'setStartPrice'
  | 'setStepPrice'
  | 'setState'
  | 'scheduleCreate';
export type AuctionCommandEntryScope = 'file' | 'auction' | 'item';
export type AuctionItemIdMode = 'raw' | 'legacy';
export type AuctionState = 'SETUP' | 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'ENDED';
export type AuctionPriceMode = 'graph' | 'manual';
export type AuctionGraphMode = 'linear' | 'fixed' | 'custom';
export type AuctionUiMode = 'normal' | 'expert';
export type AuctionFolderCategory = 'regular' | 'planned';
export type AuctionFolderTag = 'red' | 'orange' | 'green' | 'cyan' | 'blue' | 'purple' | 'pink';

export type AuctionItemOption = {
  raw: string;
  title: string;
  legacyId?: number | null;
  meta: number;
  hasNbt: boolean;
};

export type AuctionLotItem = AuctionItemOption & {
  uid: string;
  quantity: number;
  basePrice: number;
};

export type AuctionDraft = {
  id: string;
  serverIds: Record<string, string>;
  name: string;
  description: string;
  startLocal: string;
  durationMinutes: number;
  currency: AuctionCurrency;
  baseStartPrice: number;
  baseStepPrice: number;
  state: AuctionState;
  planned: boolean;
  repeatEnabled: boolean;
  repeatEveryDays: number;
  repeatCount: number;
  scheduleLeadMinutes: number;
  items: AuctionLotItem[];
};

export type AuctionDayFolder = {
  id: string;
  dateLocal: string;
  title: string;
  category: AuctionFolderCategory;
  tag: AuctionFolderTag | null;
  currency: AuctionCurrency;
  defaultDurationMinutes: number;
  defaultStartPrice: number;
  defaultStepPrice: number;
  state: AuctionState;
  timezoneOffsetMinutes: number;
  priceMode: AuctionPriceMode;
  graphMode: AuctionGraphMode;
  planned: boolean;
  repeatEnabled: boolean;
  repeatEveryDays: number;
  repeatCount: number;
  scheduleLeadMinutes: number;
  auctions: AuctionDraft[];
};

export type AuctionCommandProfileEntry =
  | {
    id: string;
    kind: 'template';
    command: AuctionCommandTemplateKey;
    label: string;
    template: string;
    scope: AuctionCommandEntryScope;
    enabled: boolean;
  }
  | {
    id: string;
    kind: 'custom';
    label: string;
    template: string;
    scope: AuctionCommandEntryScope;
    enabled: boolean;
  };

export type AuctionCommandModeProfile = {
  id: AuctionCommandModeId;
  title: string;
  orderMode: AuctionCommandOrderMode;
  entries: AuctionCommandProfileEntry[];
};

export type AuctionCommandProfile = {
  mode: AuctionCommandModeId;
  playerName: string;
  stateFilters: AuctionState[];
  modeOrder: AuctionCommandModeId[];
  modes: Record<AuctionCommandModeId, AuctionCommandModeProfile>;
};

export type AuctionPlannerState = {
  dayFolders: AuctionDayFolder[];
  selectedDayFolderId: string;
  selectedAuctionId: string;
  workflowMode: AuctionWorkflowMode;
  uiMode: AuctionUiMode;
  commandStage: AuctionCommandStage;
  commandProfile?: AuctionCommandProfile;
  curve?: AuctionCurve;
  graphStartLocal?: string;
};

export type AuctionCurve = Record<AuctionCurrency, number[]>;

export type AuctionRenderItemIcon = (item: AuctionItemOption) => ReactNode;
