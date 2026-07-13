import type { AuctionCommandStages } from './auctionCommands';
import type { AuctionCommandBuiltInBlock, AuctionCommandProfile, AuctionCommandProfileEntry } from './auctionTypes';

export const auctionCommandBlockLabels: Record<AuctionCommandBuiltInBlock, string> = {
  create: 'Создать пустые слоты',
  ids: 'Список ID',
  items: 'Предметы',
  settings: 'Настройки'
};

const builtInBlocks: AuctionCommandBuiltInBlock[] = ['create', 'ids', 'items', 'settings'];

export function createDefaultAuctionCommandProfile(): AuctionCommandProfile {
  return {
    mode: 'install',
    entries: builtInBlocks.map((block) => ({
      id: block,
      kind: 'builtin',
      block,
      enabled: block !== 'ids'
    }))
  };
}

function normalizeEntry(entry: AuctionCommandProfileEntry | undefined): AuctionCommandProfileEntry | null {
  if (!entry) return null;
  if (entry.kind === 'builtin' && builtInBlocks.includes(entry.block)) {
    return {
      id: entry.block,
      kind: 'builtin',
      block: entry.block,
      enabled: entry.enabled !== false
    };
  }
  if (entry.kind === 'custom') {
    return {
      id: entry.id || `custom-${Date.now()}`,
      kind: 'custom',
      label: entry.label || 'Кастомная команда',
      command: entry.command || '',
      enabled: entry.enabled !== false
    };
  }
  return null;
}

export function normalizeAuctionCommandProfile(value: AuctionCommandProfile | undefined): AuctionCommandProfile {
  const fallback = createDefaultAuctionCommandProfile();
  if (!value) return fallback;
  const seenBuiltIns = new Set<AuctionCommandBuiltInBlock>();
  const normalizedEntries = (Array.isArray(value.entries) ? value.entries : [])
    .map((entry) => normalizeEntry(entry))
    .filter((entry): entry is AuctionCommandProfileEntry => Boolean(entry))
    .filter((entry) => {
      if (entry.kind === 'custom') return true;
      if (seenBuiltIns.has(entry.block)) return false;
      seenBuiltIns.add(entry.block);
      return true;
    });
  const missingBuiltIns = builtInBlocks
    .filter((block) => !seenBuiltIns.has(block))
    .map((block) => fallback.entries.find((entry) => entry.kind === 'builtin' && entry.block === block))
    .filter((entry): entry is AuctionCommandProfileEntry => Boolean(entry));
  return {
    mode: value.mode === 'existing' ? 'existing' : 'install',
    entries: [...normalizedEntries, ...missingBuiltIns]
  };
}

export function buildAuctionCommandsFromProfile(stages: AuctionCommandStages, profile: AuctionCommandProfile): string {
  const normalized = normalizeAuctionCommandProfile(profile);
  const blocks = normalized.entries
    .filter((entry) => entry.enabled)
    .map((entry) => {
      if (entry.kind === 'builtin') return stages[entry.block].trim();
      return entry.command.trim();
    })
    .filter(Boolean);
  return blocks.join('\n').trim();
}
