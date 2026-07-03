import type { AuctionCommandStage, AuctionCurve, AuctionCurrency, AuctionDraft, AuctionItemIdMode, AuctionWorkflowMode } from './auctionTypes';

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

export type AuctionCommandStages = Record<AuctionCommandStage, string> & {
  all: string;
  missingServerIds: string[];
};

function auctionRunLabel(auction: AuctionDraft, index: number) {
  const repeats = auction.repeatEnabled ? Math.max(1, auction.repeatCount) : 1;
  return repeats > 1 ? `${auction.name || auction.id} #${index + 1}` : auction.name || auction.id;
}

function getServerAuctionId(auction: AuctionDraft, index: number): string {
  return auction.serverIds[String(index)]?.trim() ?? '';
}

export function buildAuctionCommandStages(params: {
  auctions: AuctionDraft[];
  curve: AuctionCurve;
  idMode: AuctionItemIdMode;
  timezoneOffsetMinutes: number;
  commandPlayer: string;
  graphStartLocal: string;
  workflowMode: AuctionWorkflowMode;
}): AuctionCommandStages {
  const player = params.commandPlayer.trim() || '@p';
  const createLines: string[] = [];
  const idLines: string[] = [];
  const itemLines: string[] = [];
  const settingsLines: string[] = [];
  const missingServerIds: string[] = [];

  params.auctions.forEach((auction) => {
    const repeats = auction.repeatEnabled ? Math.max(1, auction.repeatCount) : 1;
    for (let index = 0; index < repeats; index += 1) {
      const label = auctionRunLabel(auction, index);
      const startLocal = index === 0 ? auction.startLocal : addDaysToLocalDateTime(auction.startLocal, auction.repeatEveryDays * index);
      const endLocal = addMinutesToLocalDateTime(startLocal, auction.durationMinutes);
      const dayIndex = dayIndexFromStart(startLocal, params.graphStartLocal);
      const multiplier = params.curve[auction.currency]?.[dayIndex] ?? 1;
      const startPrice = Math.max(1, Math.round(auction.baseStartPrice * multiplier));
      const stepPrice = Math.max(1, Math.round(auction.baseStepPrice * multiplier));
      const serverId = getServerAuctionId(auction, index);

      if (params.workflowMode === 'install') {
        createLines.push(`/aca create ${formatAuctionUtcDate(startLocal, params.timezoneOffsetMinutes)} ${formatAuctionUtcDate(endLocal, params.timezoneOffsetMinutes)} ${startPrice} ${stepPrice} ${auction.currency}`);
      }

      idLines.push(`${label} -> ${serverId || '<впиши ID с сервера>'}`);
      if (!serverId) {
        missingServerIds.push(label);
      }

      if (serverId) {
        settingsLines.push(`/aca setName ${serverId} ${auction.name || `auction_${serverId}`}`);
        if (auction.description.trim()) {
          settingsLines.push(`/aca setDescription ${serverId} ${auction.description.trim()}`);
        }
        settingsLines.push(`/aca setStartDate ${serverId} ${formatAuctionUtcDate(startLocal, params.timezoneOffsetMinutes)}`);
        settingsLines.push(`/aca setEndDate ${serverId} ${formatAuctionUtcDate(endLocal, params.timezoneOffsetMinutes)}`);
        settingsLines.push(`/aca setCurrency ${serverId} ${auction.currency}`);
        settingsLines.push(`/aca setStartPrice ${serverId} ${startPrice}`);
        settingsLines.push(`/aca setStepPrice ${serverId} ${stepPrice}`);
        settingsLines.push(`/aca setState ${serverId} ${auction.planned ? 'SETUP' : auction.state}`);
      }

      auction.items.filter((item) => !item.hasNbt).forEach((item) => {
        if (!serverId) return;
        const [itemId, itemMeta] = formatAuctionItemId(item.raw, item.legacyId, item.meta, params.idMode).split(' ');
        itemLines.push(`/clear ${player}`);
        itemLines.push(`/give ${player} ${itemId} ${Math.max(1, item.quantity)} ${itemMeta ?? item.meta}`);
        itemLines.push(`/aca addItem ${serverId}`);
      });

      if (serverId && auction.planned) {
        const rescheduleLocal = addMinutesToLocalDateTime(startLocal, -Math.max(0, auction.scheduleLeadMinutes));
        const intervalSec = Math.max(60, auction.repeatEveryDays * 86_400);
        const durationSec = Math.max(60, auction.durationMinutes * 60);
        settingsLines.push(`/aca scheduleCreate ${serverId} ${formatAuctionUtcDate(startLocal, params.timezoneOffsetMinutes)} ${formatAuctionUtcDate(rescheduleLocal, params.timezoneOffsetMinutes)} ${intervalSec} ${durationSec}`);
      }
      if (serverId) {
        itemLines.push('');
        settingsLines.push('');
      }
    }
  });

  const create = params.workflowMode === 'install'
    ? createLines.join('\n').trimEnd()
    : 'Для существующих аукционов шаг создания не нужен. Заполни серверные ID и скачай шаги 3-4.';
  const ids = idLines.join('\n').trimEnd();
  const items = itemLines.join('\n').trimEnd() || 'Нет команд предметов: сначала впиши серверные ID и добавь предметы без NBT.';
  const settings = settingsLines.join('\n').trimEnd() || 'Нет команд настроек: сначала впиши серверные ID.';
  const all = [
    params.workflowMode === 'install' ? `# Шаг 1. Создание пустых слотов\n${create}` : '',
    `# Шаг 2. Выпиши ID, которые сервер выдал после /aca create\n${ids}`,
    `# Шаг 3. Закинуть предметы в аукционы\n${items}`,
    `# Шаг 4. Настройка времени, цены, длительности и расписания\n${settings}`
  ].filter(Boolean).join('\n\n');

  return { create, ids, items, settings, all, missingServerIds };
}

export function buildAuctionCommands(params: Parameters<typeof buildAuctionCommandStages>[0]): string {
  return buildAuctionCommandStages(params).all;
}

export function sanitizeAuctionFilename(value: string): string {
  const cleaned = value.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\.[A-Za-z0-9]{1,8}$/g, '');
  return cleaned || 'auctions_commands';
}
