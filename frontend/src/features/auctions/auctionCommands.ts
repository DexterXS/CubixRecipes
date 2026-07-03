import type { AuctionCurve, AuctionCurrency, AuctionDraft, AuctionItemIdMode } from './auctionTypes';

export const auctionCurrencies: AuctionCurrency[] = ['VAULT', 'DONATE', 'BONUS'];

export const auctionCurrencyLabels: Record<AuctionCurrency, string> = {
  VAULT: 'Кубиксы',
  DONATE: 'Кристаллы',
  BONUS: 'Бонусы'
};

export function createDefaultAuctionCurve(): AuctionCurve {
  return {
    VAULT: Array.from({ length: 90 }, () => 1),
    DONATE: Array.from({ length: 90 }, () => 1),
    BONUS: Array.from({ length: 90 }, () => 1)
  };
}

export function parseLocalDateTime(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
}

export function localDateTimeInputFromUtcMs(utcMs: number, timezoneOffsetMinutes: number): string {
  const localMs = utcMs + timezoneOffsetMinutes * 60_000;
  const date = new Date(localMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join('-') + `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function formatAuctionUtcDate(localValue: string, timezoneOffsetMinutes: number): string {
  const localMs = parseLocalDateTime(localValue);
  if (localMs === null) return '01.01.1970_00:00';
  const utcMs = localMs - timezoneOffsetMinutes * 60_000;
  const date = new Date(utcMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}_${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function addMinutesToLocalDateTime(value: string, minutes: number): string {
  const localMs = parseLocalDateTime(value);
  if (localMs === null) return value;
  return localDateTimeInputFromUtcMs(localMs + minutes * 60_000, 0);
}

export function addDaysToLocalDateTime(value: string, days: number): string {
  return addMinutesToLocalDateTime(value, days * 24 * 60);
}

export function dayIndexFromStart(value: string, startValue: string): number {
  const valueMs = parseLocalDateTime(value);
  const startMs = parseLocalDateTime(startValue);
  if (valueMs === null || startMs === null) return 0;
  return Math.max(0, Math.min(89, Math.floor((valueMs - startMs) / 86_400_000)));
}

export function formatAuctionItemId(raw: string, legacyId: number | null | undefined, meta: number, mode: AuctionItemIdMode): string {
  if (mode === 'legacy' && legacyId != null) {
    return `${legacyId} ${meta}`;
  }
  const cleaned = raw.replace(/^<|>$/g, '').replace(/:\*$/, ':0');
  const parts = cleaned.split(':');
  if (parts.length >= 3) {
    const itemMeta = Number(parts[parts.length - 1]);
    const itemKey = parts.slice(0, -1).join(':');
    return `${itemKey} ${Number.isFinite(itemMeta) ? itemMeta : meta}`;
  }
  return `${cleaned} ${meta}`;
}

export function buildAuctionCommands(params: {
  auctions: AuctionDraft[];
  curve: AuctionCurve;
  idMode: AuctionItemIdMode;
  timezoneOffsetMinutes: number;
  commandPlayer: string;
  graphStartLocal: string;
}): string {
  const player = params.commandPlayer.trim() || '@p';
  const lines: string[] = [];

  params.auctions.forEach((auction) => {
    const repeats = auction.repeatEnabled ? Math.max(1, auction.repeatCount) : 1;
    for (let index = 0; index < repeats; index += 1) {
      const startLocal = index === 0 ? auction.startLocal : addDaysToLocalDateTime(auction.startLocal, auction.repeatEveryDays * index);
      const endLocal = addMinutesToLocalDateTime(startLocal, auction.durationMinutes);
      const dayIndex = dayIndexFromStart(startLocal, params.graphStartLocal);
      const multiplier = params.curve[auction.currency]?.[dayIndex] ?? 1;
      const startPrice = Math.max(1, Math.round(auction.baseStartPrice * multiplier));
      const stepPrice = Math.max(1, Math.round(auction.baseStepPrice * multiplier));
      const auctionId = repeats > 1 ? `${auction.id}_${index + 1}` : auction.id;

      lines.push(`/aca create ${formatAuctionUtcDate(startLocal, params.timezoneOffsetMinutes)} ${formatAuctionUtcDate(endLocal, params.timezoneOffsetMinutes)} ${startPrice} ${stepPrice} ${auction.currency}`);
      lines.push(`/aca setName ${auctionId} ${auction.name || `auction_${auctionId}`}`);
      if (auction.description.trim()) {
        lines.push(`/aca setDescription ${auctionId} ${auction.description.trim()}`);
      }
      lines.push(`/aca setState ${auctionId} ${auction.planned ? 'SETUP' : auction.state}`);

      auction.items.filter((item) => !item.hasNbt).forEach((item) => {
        const [itemId, itemMeta] = formatAuctionItemId(item.raw, item.legacyId, item.meta, params.idMode).split(' ');
        lines.push(`/clear ${player}`);
        lines.push(`/give ${player} ${itemId} ${Math.max(1, item.quantity)} ${itemMeta ?? item.meta}`);
        lines.push(`/aca addItem ${auctionId}`);
      });

      if (auction.planned) {
        const rescheduleLocal = addMinutesToLocalDateTime(startLocal, -Math.max(0, auction.scheduleLeadMinutes));
        const intervalSec = Math.max(60, auction.repeatEveryDays * 86_400);
        const durationSec = Math.max(60, auction.durationMinutes * 60);
        lines.push(`/aca scheduleCreate ${auctionId} ${formatAuctionUtcDate(startLocal, params.timezoneOffsetMinutes)} ${formatAuctionUtcDate(rescheduleLocal, params.timezoneOffsetMinutes)} ${intervalSec} ${durationSec}`);
      }
      lines.push('');
    }
  });

  return lines.join('\n').trimEnd();
}

export function sanitizeAuctionFilename(value: string): string {
  const cleaned = value.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\.[A-Za-z0-9]{1,8}$/g, '');
  return cleaned || 'auctions_commands';
}
