import type { ReactNode } from 'react';

export type AuctionCurrency = 'VAULT' | 'DONATE' | 'BONUS';
export type AuctionBuilderMode = 'config' | 'items';
export type AuctionWorkflowMode = 'install' | 'existing';
export type AuctionCommandStage = 'create' | 'ids' | 'items' | 'settings';
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

export type AuctionPlannerState = {
  dayFolders: AuctionDayFolder[];
  selectedDayFolderId: string;
  selectedAuctionId: string;
  workflowMode: AuctionWorkflowMode;
  uiMode: AuctionUiMode;
  commandStage: AuctionCommandStage;
  curve?: AuctionCurve;
  graphStartLocal?: string;
};

export type AuctionCurve = Record<AuctionCurrency, number[]>;

export type AuctionRenderItemIcon = (item: AuctionItemOption) => ReactNode;
