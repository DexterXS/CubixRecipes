import { buildAuctionRunPricePreviews, createDefaultAuctionCurve, localDateTimeInputFromUtcMs, parseLocalDateTime } from './auctionCommands';
import type { AuctionCurrency, AuctionCurve, AuctionDayFolder, AuctionDraft, AuctionFolderCategory, AuctionState } from './auctionTypes';

export type AuctionDayFolderSummary = {
  auctionCount: number;
  itemCount: number;
  nonNbtItemCount: number;
  nbtItemCount: number;
  currencies: AuctionCurrency[];
  isMixedCurrency: boolean;
  currencyLabel: string;
  missingServerIdCount: number;
  hasMissingServerIds: boolean;
  hasNbtWarnings: boolean;
  minStartPrice: number | null;
  maxStartPrice: number | null;
  priceRangeLabel: string;
};

export type AuctionDayServerIdStatus = 'not-needed-yet' | 'waiting' | 'complete' | 'missing';

const currencyOrder: AuctionCurrency[] = ['DONATE', 'VAULT', 'BONUS'];

export function defaultTimezoneOffset() {
  return -new Date().getTimezoneOffset();
}

export function dateInputFromLocalDateTime(value: string): string {
  return value.slice(0, 10);
}

export function localDateTimeForDay(dateLocal: string, timeLocal = '10:00'): string {
  return `${dateLocal}T${timeLocal}`;
}

export function formatAuctionDayTitle(dateLocal: string): string {
  const match = dateLocal.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateLocal;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date);
}

export function categoryTitle(category: AuctionFolderCategory, dateLocal: string): string {
  return category === 'planned' ? 'Планируемая папка' : formatAuctionDayTitle(dateLocal);
}

export function createAuctionDraft(index: number, startLocal: string, patch: Partial<AuctionDraft> = {}): AuctionDraft {
  return {
    id: String(index),
    serverIds: {},
    name: `Аукцион ${index}`,
    description: '',
    startLocal,
    durationMinutes: 10,
    currency: 'DONATE',
    baseStartPrice: 100,
    baseStepPrice: 10,
    state: 'ACTIVE',
    planned: true,
    repeatEnabled: false,
    repeatEveryDays: 7,
    repeatCount: 1,
    scheduleLeadMinutes: 1,
    items: [],
    ...patch
  };
}

export function createAuctionDayFolder(params: {
  id: string;
  dateLocal: string;
  category?: AuctionFolderCategory;
  timezoneOffsetMinutes?: number;
  auctions?: AuctionDraft[];
  title?: string;
  defaultDurationMinutes?: number;
  defaultStartPrice?: number;
  defaultStepPrice?: number;
  state?: AuctionState;
}): AuctionDayFolder {
  const timezoneOffsetMinutes = params.timezoneOffsetMinutes ?? defaultTimezoneOffset();
  const defaultDurationMinutes = params.defaultDurationMinutes ?? 10;
  const defaultStartPrice = params.defaultStartPrice ?? params.auctions?.[0]?.baseStartPrice ?? 100;
  const defaultStepPrice = params.defaultStepPrice ?? 10;
  const state = params.state ?? params.auctions?.[0]?.state ?? 'ACTIVE';
  const category = params.category ?? 'regular';
  const auctions = params.auctions ?? [
    createAuctionDraft(1, localDateTimeForDay(params.dateLocal), {
      durationMinutes: defaultDurationMinutes,
      baseStartPrice: defaultStartPrice,
      baseStepPrice: defaultStepPrice,
      state,
      repeatEnabled: category === 'planned'
    })
  ];

  return {
    id: params.id,
    dateLocal: params.dateLocal,
    title: params.title ?? categoryTitle(category, params.dateLocal),
    category,
    tag: null,
    currency: auctions[0]?.currency ?? 'DONATE',
    defaultDurationMinutes,
    defaultStartPrice,
    defaultStepPrice,
    state: auctions[0]?.state ?? state,
    timezoneOffsetMinutes,
    priceMode: category === 'planned' ? 'manual' : 'graph',
    graphMode: category === 'planned' ? 'fixed' : 'linear',
    planned: true,
    repeatEnabled: category === 'planned',
    repeatEveryDays: 7,
    repeatCount: 1,
    scheduleLeadMinutes: 1,
    auctions
  };
}

export function createInitialAuctionDayFolder(nowMs = Date.now(), timezoneOffsetMinutes = defaultTimezoneOffset()): AuctionDayFolder {
  const tomorrowLocal = localDateTimeInputFromUtcMs(nowMs + 86_400_000, timezoneOffsetMinutes);
  return createAuctionDayFolder({
    id: 'day-1',
    dateLocal: dateInputFromLocalDateTime(tomorrowLocal),
    timezoneOffsetMinutes,
    auctions: [createAuctionDraft(1, tomorrowLocal)]
  });
}

function timeFromLocalDateTime(value: string): string {
  return value.includes('T') ? value.slice(11, 16) : '10:00';
}

export function cloneAuctionDayFolder(source: AuctionDayFolder, params: { id: string; dateLocal: string; title?: string }): AuctionDayFolder {
  const title = params.title ?? categoryTitle(source.category, params.dateLocal);
  return {
    ...source,
    id: params.id,
    dateLocal: params.dateLocal,
    title,
    auctions: source.auctions.map((auction, index) => ({
      ...auction,
      id: `${params.id}-auction-${index + 1}`,
      serverIds: {},
      startLocal: localDateTimeForDay(params.dateLocal, timeFromLocalDateTime(auction.startLocal)),
      items: auction.items.map((item) => ({ ...item }))
    }))
  };
}

export function applyDayDefaultsToAuctions(folder: AuctionDayFolder): AuctionDayFolder {
  return {
    ...folder,
    auctions: folder.auctions.map((auction) => ({
      ...auction,
      currency: folder.currency,
      durationMinutes: folder.defaultDurationMinutes,
      baseStartPrice: folder.defaultStartPrice,
      baseStepPrice: folder.defaultStepPrice,
      state: folder.state,
      planned: folder.planned,
      repeatEnabled: folder.repeatEnabled,
      repeatEveryDays: folder.repeatEveryDays,
      repeatCount: folder.repeatCount,
      scheduleLeadMinutes: folder.scheduleLeadMinutes
    }))
  };
}

export function getAuctionFolderCurrencies(folder: AuctionDayFolder): AuctionCurrency[] {
  const currencies = new Set(folder.auctions.map((auction) => auction.currency));
  if (!currencies.size) currencies.add(folder.currency);
  return currencyOrder.filter((currency) => currencies.has(currency));
}

function formatCurrencySummary(currencies: AuctionCurrency[]) {
  return currencies.length > 1 ? `Смешанная: ${currencies.join(' · ')}` : currencies[0] ?? 'DONATE';
}

export function countExpectedServerIds(auction: AuctionDraft): number {
  return auction.repeatEnabled ? Math.max(1, auction.repeatCount) : 1;
}

export function countMissingServerIds(auctions: AuctionDraft[]): number {
  return auctions.reduce((total, auction) => {
    const expected = countExpectedServerIds(auction);
    let missing = 0;
    for (let index = 0; index < expected; index += 1) {
      if (!auction.serverIds[String(index)]?.trim()) {
        missing += 1;
      }
    }
    return total + missing;
  }, 0);
}

export function getDayServerIdStatus(folder: AuctionDayFolder, workflowStep: 'create' | 'ids' | 'items' | 'settings' = 'ids'): AuctionDayServerIdStatus {
  if (workflowStep === 'create') return 'not-needed-yet';
  const expected = folder.auctions.reduce((total, auction) => total + countExpectedServerIds(auction), 0);
  if (expected === 0) return 'not-needed-yet';
  const missing = countMissingServerIds(folder.auctions);
  if (missing === expected) return 'waiting';
  return missing > 0 ? 'missing' : 'complete';
}

function formatPrice(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

export function summarizeAuctionDayFolder(params: {
  folder: AuctionDayFolder;
  curve?: AuctionCurve;
  graphStartLocal?: string;
}): AuctionDayFolderSummary {
  const curve = params.folder.category === 'planned' ? createDefaultAuctionCurve() : (params.curve ?? createDefaultAuctionCurve());
  const graphStartLocal = params.graphStartLocal ?? localDateTimeForDay(params.folder.dateLocal, '00:00');
  const itemCount = params.folder.auctions.reduce((total, auction) => total + auction.items.length, 0);
  const nbtItemCount = params.folder.auctions.reduce((total, auction) => total + auction.items.filter((item) => item.hasNbt).length, 0);
  const currencies = getAuctionFolderCurrencies(params.folder);
  const previews = buildAuctionRunPricePreviews({
    auctions: params.folder.auctions,
    curve,
    graphStartLocal
  });
  const prices = previews.map((preview) => preview.startPrice).filter((value) => Number.isFinite(value) && value > 0);
  const minStartPrice = prices.length ? Math.min(...prices) : null;
  const maxStartPrice = prices.length ? Math.max(...prices) : null;
  const missingServerIdCount = countMissingServerIds(params.folder.auctions);

  return {
    auctionCount: params.folder.auctions.length,
    itemCount,
    nonNbtItemCount: itemCount - nbtItemCount,
    nbtItemCount,
    currencies,
    isMixedCurrency: currencies.length > 1,
    currencyLabel: formatCurrencySummary(currencies),
    missingServerIdCount,
    hasMissingServerIds: missingServerIdCount > 0,
    hasNbtWarnings: nbtItemCount > 0,
    minStartPrice,
    maxStartPrice,
    priceRangeLabel: minStartPrice === null || maxStartPrice === null ? 'нет цен' : `${formatPrice(minStartPrice)} - ${formatPrice(maxStartPrice)}`
  };
}

export function nextDayLocal(dateLocal: string): string {
  const startMs = parseLocalDateTime(localDateTimeForDay(dateLocal, '00:00'));
  if (startMs === null) return dateLocal;
  return dateInputFromLocalDateTime(localDateTimeInputFromUtcMs(startMs + 86_400_000, 0));
}
