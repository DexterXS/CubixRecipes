import {
  addMinutesToLocalDateTime,
  buildAuctionRunPricePreviews,
  formatAuctionItemId,
  formatAuctionUtcDate
} from './auctionCommands';
import type {
  AuctionCommandEntryScope,
  AuctionCommandModeProfile,
  AuctionCommandOrderMode,
  AuctionCommandProfile,
  AuctionCommandProfileEntry,
  AuctionCommandTemplateKey,
  AuctionCurve,
  AuctionDraft,
  AuctionItemIdMode,
  AuctionState
} from './auctionTypes';

import {
  auctionCommandTemplateLabels,
  commandDefinitions,
  createTemplateEntry,
  defaultModeProfile,
  defaultModeTitles
} from './auctionCommandDefinitions';

export {
  auctionCommandOrderModeLabels,
  auctionCommandScopeLabels,
  auctionStateFilterLabels
} from './auctionCommandDefinitions';

const auctionStates: AuctionState[] = ['SETUP', 'ACTIVE', 'PAUSED', 'CLOSED', 'ENDED'];

export function createDefaultAuctionCommandProfile(): AuctionCommandProfile {
  return {
    mode: 'install',
    playerName: '@p',
    stateFilters: ['ACTIVE'],
    modeOrder: ['install', 'existing'],
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

function normalizeOrderMode(value: unknown): AuctionCommandOrderMode {
  return value === 'perLot' ? 'perLot' : 'grouped';
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
    if (entry.block === 'items') {
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

function normalizeEntries(entries: unknown, mode: string): AuctionCommandProfileEntry[] {
  const defaults = defaultModeProfile(mode).entries;
  const hasEntries = Array.isArray(entries);
  const source = hasEntries ? entries : defaults;
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
  if (!hasEntries) {
    defaults.forEach((entry) => {
      if (entry.kind === 'template' && !seenTemplates.has(entry.command)) {
        normalized.push(entry);
      }
    });
  }
  return normalized.slice(0, 80);
}

function normalizeModeProfile(value: unknown, mode: string, legacyEntries: AuctionCommandProfileEntry[]): AuctionCommandModeProfile {
  const title = safeText(isRecord(value) ? value.title : undefined, defaultModeTitles[mode as keyof typeof defaultModeTitles] ?? 'Новый режим', 80).trim() || 'Новый режим';
  const orderMode = normalizeOrderMode(isRecord(value) ? value.orderMode : undefined);
  if (legacyEntries.length) {
    return { id: mode, title, orderMode, entries: normalizeEntries(legacyEntries, mode) };
  }
  const entries = isRecord(value) ? value.entries : undefined;
  return { id: mode, title, orderMode, entries: normalizeEntries(entries, mode) };
}

export function normalizeAuctionCommandProfile(value: unknown): AuctionCommandProfile {
  const fallback = createDefaultAuctionCommandProfile();
  if (!isRecord(value)) return fallback;
  const legacyEntries = legacyEntriesToTemplateEntries(value.entries);
  const modesSource = isRecord(value.modes) ? value.modes : {};
  const modes: AuctionCommandProfile['modes'] = {};
  const modeOrderSource = Array.isArray(value.modeOrder)
    ? value.modeOrder.filter((item): item is string => typeof item === 'string')
    : Object.keys(modesSource);
  let modeOrder = Array.from(new Set(modeOrderSource)).filter((modeId) => isRecord(modesSource[modeId]));
  if (!modeOrder.length && !isRecord(value.modes) && !Array.isArray(value.modeOrder)) {
    modeOrder = ['install', 'existing'];
  }
  modeOrder.forEach((modeId) => {
    modes[modeId] = normalizeModeProfile(modesSource[modeId], modeId, legacyEntries && value.mode === modeId ? legacyEntries : []);
  });
  const requestedMode = typeof value.mode === 'string' ? value.mode : '';
  const mode = requestedMode && modes[requestedMode] ? requestedMode : modeOrder[0] ?? '';
  return {
    mode,
    playerName: safeText(value.playerName, '@p', 80).trim() || '@p',
    stateFilters: normalizeStateFilters(value.stateFilters),
    modeOrder,
    modes
  };
}

export function getAuctionCommandModeEntries(profile: AuctionCommandProfile): AuctionCommandProfileEntry[] {
  const normalized = normalizeAuctionCommandProfile(profile);
  return normalized.modes[normalized.mode]?.entries ?? [];
}

export function setAuctionCommandModeEntries(
  profile: AuctionCommandProfile,
  mode: string,
  entries: AuctionCommandProfileEntry[]
): AuctionCommandProfile {
  const normalized = normalizeAuctionCommandProfile(profile);
  const targetMode = normalized.modes[mode];
  if (!targetMode) return normalized;
  return {
    ...normalized,
    modes: {
      ...normalized.modes,
      [mode]: { ...targetMode, entries: normalizeEntries(entries, mode) }
    }
  };
}

export function createAuctionCommandMode(profile: AuctionCommandProfile): AuctionCommandProfile {
  const normalized = normalizeAuctionCommandProfile(profile);
  const id = `mode-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    ...normalized,
    mode: id,
    modeOrder: [...normalized.modeOrder, id],
    modes: {
      ...normalized.modes,
      [id]: {
        id,
        title: `Режим ${normalized.modeOrder.length + 1}`,
        orderMode: 'grouped',
        entries: []
      }
    }
  };
}

export function renameAuctionCommandMode(profile: AuctionCommandProfile, mode: string, title: string): AuctionCommandProfile {
  const normalized = normalizeAuctionCommandProfile(profile);
  const targetMode = normalized.modes[mode];
  if (!targetMode) return normalized;
  return {
    ...normalized,
    modes: {
      ...normalized.modes,
      [mode]: { ...targetMode, title: title.slice(0, 80) }
    }
  };
}

export function setAuctionCommandModeOrder(
  profile: AuctionCommandProfile,
  mode: string,
  orderMode: AuctionCommandOrderMode
): AuctionCommandProfile {
  const normalized = normalizeAuctionCommandProfile(profile);
  const targetMode = normalized.modes[mode];
  if (!targetMode) return normalized;
  return {
    ...normalized,
    modes: {
      ...normalized.modes,
      [mode]: { ...targetMode, orderMode: normalizeOrderMode(orderMode) }
    }
  };
}

export function deleteAuctionCommandMode(profile: AuctionCommandProfile, mode: string): AuctionCommandProfile {
  const normalized = normalizeAuctionCommandProfile(profile);
  const nextModes = { ...normalized.modes };
  delete nextModes[mode];
  const nextOrder = normalized.modeOrder.filter((modeId) => modeId !== mode);
  return {
    ...normalized,
    mode: normalized.mode === mode ? nextOrder[0] ?? '' : normalized.mode,
    modeOrder: nextOrder,
    modes: nextModes
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
  if (entry.command === 'addItem' && auction.addItemsToAuction === false) return true;
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
  const currentMode = profile.modes[profile.mode];

  const renderFileEntry = (entry: AuctionCommandProfileEntry) => {
    const template = entry.template.trim();
    if (!template) return;
    const rendered = renderTemplate(template, {
      player: profile.playerName,
      mode: profile.mode,
      modeTitle: currentMode?.title ?? profile.mode,
      statusFilters: profile.stateFilters.join(',')
    }).trim();
    if (rendered) lines.push(rendered);
  };

  const renderAuctionEntry = (
    entry: AuctionCommandProfileEntry,
    auction: AuctionDraft,
    preview: ReturnType<typeof buildAuctionRunPricePreviews>[number]
  ) => {
    const template = entry.template.trim();
    if (!template || shouldSkipTemplate(entry, auction, preview.serverId)) return;
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
  };

  if (currentMode?.orderMode === 'perLot') {
    const renderedFileEntries = new Set<string>();
    const renderFileOnce = (entry: AuctionCommandProfileEntry) => {
      if (renderedFileEntries.has(entry.id)) return;
      renderedFileEntries.add(entry.id);
      renderFileEntry(entry);
    };
    if (!previews.length) {
      entries.forEach((entry) => {
        if (entry.scope === 'file') renderFileOnce(entry);
      });
    } else {
      previews.forEach((preview) => {
        const auction = byAuction.get(preview.auctionId);
        if (!auction) return;
        entries.forEach((entry) => {
          if (entry.scope === 'file') {
            renderFileOnce(entry);
            return;
          }
          renderAuctionEntry(entry, auction, preview);
        });
      });
    }
  } else {
    entries.forEach((entry) => {
      if (entry.scope === 'file') {
        renderFileEntry(entry);
        return;
      }
      previews.forEach((preview) => {
        const auction = byAuction.get(preview.auctionId);
        if (auction) renderAuctionEntry(entry, auction, preview);
      });
    });
  }

  return lines.join('\n').trim();
}
