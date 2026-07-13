import {
  addMinutesToLocalDateTime,
  buildAuctionRunPricePreviews,
  formatAuctionItemId,
  formatAuctionUtcDate
} from './auctionCommands';
import type {
  AuctionCommandEntryScope,
  AuctionCommandModeProfile,
  AuctionCommandProfile,
  AuctionCommandProfileEntry,
  AuctionCommandTemplateKey,
  AuctionCurve,
  AuctionDraft,
  AuctionItemIdMode,
  AuctionState,
  AuctionWorkflowMode
} from './auctionTypes';

export const auctionWorkflowModeLabels: Record<AuctionWorkflowMode, string> = {
  install: 'Новые слоты',
  existing: 'По готовым ID'
};

export const auctionStateFilterLabels: Record<AuctionState, string> = {
  SETUP: 'Подготовка',
  ACTIVE: 'Активный',
  PAUSED: 'Пауза',
  CLOSED: 'Закрыт',
  ENDED: 'Завершен'
};

export const auctionCommandScopeLabels: Record<AuctionCommandEntryScope, string> = {
  file: 'Один раз',
  auction: 'На лот',
  item: 'На предмет'
};

export const auctionCommandTemplateLabels: Record<AuctionCommandTemplateKey, string> = {
  create: 'Создать слот',
  idList: 'Строка ID',
  clearPlayer: 'Очистить инвентарь',
  giveItem: 'Выдать предмет',
  addItem: 'Добавить предмет',
  setName: 'Название',
  setDescription: 'Описание',
  setStartDate: 'Старт',
  setEndDate: 'Конец',
  setCurrency: 'Валюта',
  setStartPrice: 'Стартовая цена',
  setStepPrice: 'Шаг ставки',
  setState: 'Статус',
  scheduleCreate: 'Расписание'
};

const workflowModes: AuctionWorkflowMode[] = ['install', 'existing'];
const auctionStates: AuctionState[] = ['SETUP', 'ACTIVE', 'PAUSED', 'CLOSED', 'ENDED'];

const commandDefinitions: Record<AuctionCommandTemplateKey, {
  scope: AuctionCommandEntryScope;
  template: string;
  requiresServerId?: boolean;
  skipWhenEmptyDescription?: boolean;
}> = {
  create: {
    scope: 'auction',
    template: '/aca create {startDate} {endDate} {startPrice} {stepPrice} {currency}'
  },
  idList: {
    scope: 'auction',
    template: '{auctionName} -> {serverId}'
  },
  clearPlayer: {
    scope: 'item',
    template: '/clear {player}',
    requiresServerId: true
  },
  giveItem: {
    scope: 'item',
    template: '/give {player} {itemId} {quantity} {meta}',
    requiresServerId: true
  },
  addItem: {
    scope: 'item',
    template: '/aca addItem {serverId}',
    requiresServerId: true
  },
  setName: {
    scope: 'auction',
    template: '/aca setName {serverId} {auctionName}',
    requiresServerId: true
  },
  setDescription: {
    scope: 'auction',
    template: '/aca setDescription {serverId} {description}',
    requiresServerId: true,
    skipWhenEmptyDescription: true
  },
  setStartDate: {
    scope: 'auction',
    template: '/aca setStartDate {serverId} {startDate}',
    requiresServerId: true
  },
  setEndDate: {
    scope: 'auction',
    template: '/aca setEndDate {serverId} {endDate}',
    requiresServerId: true
  },
  setCurrency: {
    scope: 'auction',
    template: '/aca setCurrency {serverId} {currency}',
    requiresServerId: true
  },
  setStartPrice: {
    scope: 'auction',
    template: '/aca setStartPrice {serverId} {startPrice}',
    requiresServerId: true
  },
  setStepPrice: {
    scope: 'auction',
    template: '/aca setStepPrice {serverId} {stepPrice}',
    requiresServerId: true
  },
  setState: {
    scope: 'auction',
    template: '/aca setState {serverId} {state}',
    requiresServerId: true
  },
  scheduleCreate: {
    scope: 'auction',
    template: '/aca scheduleCreate {serverId} {startDate} {scheduleLeadDate} {repeatIntervalSeconds} {durationSeconds}',
    requiresServerId: true
  }
};

const installCommandOrder: AuctionCommandTemplateKey[] = [
  'create',
  'idList',
  'clearPlayer',
  'giveItem',
  'addItem',
  'setName',
  'setDescription',
  'setStartDate',
  'setEndDate',
  'setCurrency',
  'setStartPrice',
  'setStepPrice',
  'setState',
  'scheduleCreate'
];

const existingCommandOrder: AuctionCommandTemplateKey[] = [
  'idList',
  'clearPlayer',
  'giveItem',
  'addItem',
  'setName',
  'setDescription',
  'setStartDate',
  'setEndDate',
  'setCurrency',
  'setStartPrice',
  'setStepPrice',
  'setState',
  'scheduleCreate',
  'create'
];

function createTemplateEntry(command: AuctionCommandTemplateKey, enabled: boolean): AuctionCommandProfileEntry {
  const definition = commandDefinitions[command];
  return {
    id: command,
    kind: 'template',
    command,
    label: auctionCommandTemplateLabels[command],
    template: definition.template,
    scope: definition.scope,
    enabled
  };
}

function defaultModeProfile(mode: AuctionWorkflowMode): AuctionCommandModeProfile {
  const enabledCommands = mode === 'install'
    ? new Set<AuctionCommandTemplateKey>(['create'])
    : new Set<AuctionCommandTemplateKey>([
      'clearPlayer',
      'giveItem',
      'addItem',
      'setName',
      'setDescription',
      'setStartDate',
      'setEndDate',
      'setCurrency',
      'setStartPrice',
      'setStepPrice',
      'setState',
      'scheduleCreate'
    ]);
  const order = mode === 'install' ? installCommandOrder : existingCommandOrder;
  return {
    entries: order.map((command) => createTemplateEntry(command, enabledCommands.has(command)))
  };
}

export function createDefaultAuctionCommandProfile(): AuctionCommandProfile {
  return {
    mode: 'install',
    playerName: '@p',
    stateFilters: ['ACTIVE'],
    modes: {
      install: defaultModeProfile('install'),
      existing: defaultModeProfile('existing')
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function safeText(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === 'string' ? value : fallback;
  return text.slice(0, maxLength);
}

function normalizeScope(value: unknown, fallback: AuctionCommandEntryScope): AuctionCommandEntryScope {
  return value === 'file' || value === 'auction' || value === 'item' ? value : fallback;
}

function normalizeStateFilters(value: unknown): AuctionState[] {
  if (!Array.isArray(value)) return ['ACTIVE'];
  const states = value.filter((state): state is AuctionState => auctionStates.includes(state as AuctionState));
  return states.length ? Array.from(new Set(states)) : ['ACTIVE'];
}

function normalizeTemplateEntry(entry: Record<string, unknown>): AuctionCommandProfileEntry | null {
  const command = entry.command;
  if (typeof command !== 'string' || !(command in commandDefinitions)) return null;
  const key = command as AuctionCommandTemplateKey;
  const definition = commandDefinitions[key];
  return {
    id: key,
    kind: 'template',
    command: key,
    label: safeText(entry.label, auctionCommandTemplateLabels[key], 120),
    template: safeText(entry.template, definition.template, 4000),
    scope: definition.scope,
    enabled: entry.enabled !== false
  };
}

function normalizeCustomEntry(entry: Record<string, unknown>, index: number): AuctionCommandProfileEntry {
  return {
    id: safeText(entry.id, `custom-${index + 1}`, 80),
    kind: 'custom',
    label: safeText(entry.label, 'Своя команда', 120),
    template: safeText(entry.template ?? entry.command, '', 4000),
    scope: normalizeScope(entry.scope, 'file'),
    enabled: entry.enabled !== false
  };
}

function legacyEntriesToTemplateEntries(entries: unknown): AuctionCommandProfileEntry[] {
  if (!Array.isArray(entries)) return [];
  const result: AuctionCommandProfileEntry[] = [];
  entries.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    if (entry.kind === 'custom') {
      result.push(normalizeCustomEntry(entry, index));
      return;
    }
    if (entry.kind !== 'builtin') return;
    const enabled = entry.enabled !== false;
    if (entry.block === 'create') result.push(createTemplateEntry('create', enabled));
    if (entry.block === 'ids') result.push(createTemplateEntry('idList', enabled));
    if (entry.block === 'items') {
      result.push(createTemplateEntry('clearPlayer', enabled));
      result.push(createTemplateEntry('giveItem', enabled));
      result.push(createTemplateEntry('addItem', enabled));
    }
    if (entry.block === 'settings') {
      result.push(createTemplateEntry('setName', enabled));
      result.push(createTemplateEntry('setDescription', enabled));
      result.push(createTemplateEntry('setStartDate', enabled));
      result.push(createTemplateEntry('setEndDate', enabled));
      result.push(createTemplateEntry('setCurrency', enabled));
      result.push(createTemplateEntry('setStartPrice', enabled));
      result.push(createTemplateEntry('setStepPrice', enabled));
      result.push(createTemplateEntry('setState', enabled));
      result.push(createTemplateEntry('scheduleCreate', enabled));
    }
  });
  return result;
}

function normalizeEntries(entries: unknown, mode: AuctionWorkflowMode): AuctionCommandProfileEntry[] {
  const defaults = defaultModeProfile(mode).entries;
  const source = Array.isArray(entries) ? entries : defaults;
  const normalized: AuctionCommandProfileEntry[] = [];
  const seenTemplates = new Set<AuctionCommandTemplateKey>();
  source.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const next = entry.kind === 'custom' ? normalizeCustomEntry(entry, index) : normalizeTemplateEntry(entry);
    if (!next) return;
    if (next.kind === 'template') {
      if (seenTemplates.has(next.command)) return;
      seenTemplates.add(next.command);
    }
    normalized.push(next);
  });
  defaults.forEach((entry) => {
    if (entry.kind === 'template' && !seenTemplates.has(entry.command)) {
      normalized.push(entry);
    }
  });
  return normalized.slice(0, 80);
}

function normalizeModeProfile(value: unknown, mode: AuctionWorkflowMode, legacyEntries: AuctionCommandProfileEntry[]): AuctionCommandModeProfile {
  if (legacyEntries.length) {
    return { entries: normalizeEntries(legacyEntries, mode) };
  }
  const entries = isRecord(value) ? value.entries : undefined;
  return { entries: normalizeEntries(entries, mode) };
}

export function normalizeAuctionCommandProfile(value: unknown): AuctionCommandProfile {
  const fallback = createDefaultAuctionCommandProfile();
  if (!isRecord(value)) return fallback;
  const mode: AuctionWorkflowMode = value.mode === 'existing' ? 'existing' : 'install';
  const legacyEntries = legacyEntriesToTemplateEntries(value.entries);
  const modesSource = isRecord(value.modes) ? value.modes : {};
  return {
    mode,
    playerName: safeText(value.playerName, '@p', 80).trim() || '@p',
    stateFilters: normalizeStateFilters(value.stateFilters),
    modes: {
      install: normalizeModeProfile(modesSource.install, 'install', mode === 'install' ? legacyEntries : []),
      existing: normalizeModeProfile(modesSource.existing, 'existing', mode === 'existing' ? legacyEntries : [])
    }
  };
}

export function getAuctionCommandModeEntries(profile: AuctionCommandProfile): AuctionCommandProfileEntry[] {
  const normalized = normalizeAuctionCommandProfile(profile);
  return normalized.modes[normalized.mode].entries;
}

export function setAuctionCommandModeEntries(
  profile: AuctionCommandProfile,
  mode: AuctionWorkflowMode,
  entries: AuctionCommandProfileEntry[]
): AuctionCommandProfile {
  const normalized = normalizeAuctionCommandProfile(profile);
  return {
    ...normalized,
    modes: {
      ...normalized.modes,
      [mode]: { entries: normalizeEntries(entries, mode) }
    }
  };
}

export function filterAuctionsForCommandProfile(auctions: AuctionDraft[], profile: AuctionCommandProfile): AuctionDraft[] {
  const normalized = normalizeAuctionCommandProfile(profile);
  const states = new Set(normalized.stateFilters);
  return auctions.filter((auction) => states.has(auction.state));
}

type AuctionCommandBuildContext = {
  auctions: AuctionDraft[];
  curve: AuctionCurve;
  idMode: AuctionItemIdMode;
  timezoneOffsetMinutes: number;
  graphStartLocal: string;
  profile: AuctionCommandProfile;
};

type RenderContext = Record<string, string>;

function renderTemplate(template: string, context: RenderContext): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key: string) => context[key] ?? '');
}

function contextForAuction(params: {
  auction: AuctionDraft;
  profile: AuctionCommandProfile;
  preview: ReturnType<typeof buildAuctionRunPricePreviews>[number];
  timezoneOffsetMinutes: number;
}): RenderContext {
  const { auction, profile, preview, timezoneOffsetMinutes } = params;
  const scheduleLeadLocal = addMinutesToLocalDateTime(preview.startLocal, -Math.max(0, auction.scheduleLeadMinutes));
  return {
    player: profile.playerName,
    auctionId: auction.id,
    auctionName: auction.name || auction.id,
    description: auction.description.trim(),
    runLabel: preview.label,
    runIndex: String(preview.runIndex + 1),
    serverId: preview.serverId,
    state: auction.state,
    currency: preview.currency,
    startDate: formatAuctionUtcDate(preview.startLocal, timezoneOffsetMinutes),
    endDate: formatAuctionUtcDate(preview.endLocal, timezoneOffsetMinutes),
    startPrice: String(preview.startPrice),
    stepPrice: String(preview.stepPrice),
    scheduleLeadDate: formatAuctionUtcDate(scheduleLeadLocal, timezoneOffsetMinutes),
    repeatIntervalSeconds: String(Math.max(60, auction.repeatEveryDays * 86_400)),
    durationSeconds: String(Math.max(60, auction.durationMinutes * 60))
  };
}

function contextForItem(params: {
  auction: AuctionDraft;
  idMode: AuctionItemIdMode;
  item: AuctionDraft['items'][number];
  profile: AuctionCommandProfile;
  preview: ReturnType<typeof buildAuctionRunPricePreviews>[number];
  timezoneOffsetMinutes: number;
}): RenderContext {
  const base = contextForAuction(params);
  const [itemId, meta] = formatAuctionItemId(params.item.raw, params.item.legacyId, params.item.meta, params.idMode).split(' ');
  return {
    ...base,
    itemId,
    meta: meta ?? String(params.item.meta),
    quantity: String(Math.max(1, params.item.quantity)),
    itemTitle: params.item.title,
    itemRaw: params.item.raw
  };
}

function shouldSkipTemplate(entry: AuctionCommandProfileEntry, auction: AuctionDraft, serverId: string): boolean {
  if (entry.kind !== 'template') return false;
  const definition = commandDefinitions[entry.command];
  if (definition.requiresServerId && !serverId) return true;
  if (definition.skipWhenEmptyDescription && !auction.description.trim()) return true;
  if (entry.command === 'scheduleCreate' && !auction.planned) return true;
  return false;
}

export function buildAuctionCommandsFromProfile(params: AuctionCommandBuildContext): string {
  const profile = normalizeAuctionCommandProfile(params.profile);
  const entries = getAuctionCommandModeEntries(profile).filter((entry) => entry.enabled);
  const auctions = filterAuctionsForCommandProfile(params.auctions, profile);
  const previews = buildAuctionRunPricePreviews({
    auctions,
    curve: params.curve,
    graphStartLocal: params.graphStartLocal
  });
  const byAuction = new Map(auctions.map((auction) => [auction.id, auction]));
  const lines: string[] = [];

  entries.forEach((entry) => {
    const template = entry.template.trim();
    if (!template) return;
    if (entry.scope === 'file') {
      const rendered = renderTemplate(template, {
        player: profile.playerName,
        mode: profile.mode,
        statusFilters: profile.stateFilters.join(',')
      }).trim();
      if (rendered) lines.push(rendered);
      return;
    }
    previews.forEach((preview) => {
      const auction = byAuction.get(preview.auctionId);
      if (!auction || shouldSkipTemplate(entry, auction, preview.serverId)) return;
      if (entry.scope === 'auction') {
        const rendered = renderTemplate(template, contextForAuction({
          auction,
          profile,
          preview,
          timezoneOffsetMinutes: params.timezoneOffsetMinutes
        })).trim();
        if (rendered) lines.push(rendered);
        return;
      }
      auction.items.filter((item) => !item.hasNbt).forEach((item) => {
        const rendered = renderTemplate(template, contextForItem({
          auction,
          idMode: params.idMode,
          item,
          profile,
          preview,
          timezoneOffsetMinutes: params.timezoneOffsetMinutes
        })).trim();
        if (rendered) lines.push(rendered);
      });
    });
  });

  return lines.join('\n').trim();
}
