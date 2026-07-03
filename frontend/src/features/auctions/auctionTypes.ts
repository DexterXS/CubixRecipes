import type { ReactNode } from 'react';

export type AuctionCurrency = 'VAULT' | 'DONATE' | 'BONUS';
export type AuctionBuilderMode = 'config' | 'items';
export type AuctionItemIdMode = 'raw' | 'legacy';
export type AuctionState = 'SETUP' | 'ACTIVE' | 'PAUSED';

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
};

export type AuctionDraft = {
  id: string;
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

export type AuctionCurve = Record<AuctionCurrency, number[]>;

export type AuctionRenderItemIcon = (item: AuctionItemOption) => ReactNode;
