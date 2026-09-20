import type { ModIconAtlasEntry, ModIconAtlasManifest } from '../../types';

export interface AtlasLabelEntry {
  key: string;
  meta: number;
  displayRu?: string | null;
  displayEn?: string | null;
  raw?: string;
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[_-]+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function baseLabel(iconName: string): string {
  const leaf = iconName.split('/').pop() ?? iconName;
  return normalizeLabel(leaf.replace(/_\d+$/, ''));
}

function duplicateOrder(iconName: string): number {
  const match = (iconName.split('/').pop() ?? iconName).match(/_(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : 1;
}

function iconIdentity(icon: ModIconAtlasEntry): string {
  return icon.key ?? `${icon.modid}/${icon.iconName ?? icon.entryName ?? ''}`;
}

function iconEntries(manifest: ModIconAtlasManifest): ModIconAtlasEntry[] {
  const seen = new Set<string>();
  return [...Object.values(manifest.entries.x32 ?? {}), ...Object.values(manifest.entries.x256 ?? {})].filter((icon) => {
    const identity = `${icon.size}|${iconIdentity(icon)}|${icon.atlasFile}|${icon.page}|${icon.x}|${icon.y}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function buildModIconCandidates(
  manifest: ModIconAtlasManifest | null | undefined,
  entries: AtlasLabelEntry[]
): Map<string, ModIconAtlasEntry[]> {
  const result = new Map<string, ModIconAtlasEntry[]>();
  if (!manifest) return result;

  const identitiesByLabel = new Map<string, Map<string, ModIconAtlasEntry[]>>();
  iconEntries(manifest)
    .sort((left, right) => left.size - right.size || duplicateOrder(left.iconName ?? '') - duplicateOrder(right.iconName ?? '') || (left.iconName ?? '').localeCompare(right.iconName ?? '', 'ru', { numeric: true }))
    .forEach((icon) => {
      const label = baseLabel(icon.iconName ?? icon.key ?? icon.modid);
      if (!label) return;
      const labelKey = `${icon.modid.toLowerCase()}|${label}`;
      const groups = identitiesByLabel.get(labelKey) ?? new Map<string, ModIconAtlasEntry[]>();
      const group = groups.get(iconIdentity(icon)) ?? [];
      group.push(icon);
      groups.set(iconIdentity(icon), group);
      identitiesByLabel.set(labelKey, groups);
    });

  const occurrenceByLabel = new Map<string, number>();
  entries.forEach((entry) => {
    const [modid, itemPath = ''] = entry.key.split(':');
    if (!modid) return;
    const labels = [entry.displayRu, entry.displayEn, itemPath.split('/').pop() ?? itemPath, itemPath]
      .filter((value): value is string => Boolean(value))
      .map(normalizeLabel)
      .filter(Boolean);
    let selected: ModIconAtlasEntry[] | undefined;
    for (const label of labels) {
      const labelKey = `${modid.toLowerCase()}|${label}`;
      const groups = identitiesByLabel.get(labelKey);
      if (!groups?.size) continue;
      const groupIndex = occurrenceByLabel.get(labelKey) ?? 0;
      const identity = [...groups.keys()][Math.min(groupIndex, groups.size - 1)];
      selected = identity ? groups.get(identity) : undefined;
      occurrenceByLabel.set(labelKey, groupIndex + 1);
      break;
    }
    if (!selected?.length) return;
    const raw = entry.raw ?? `<${entry.key}${entry.meta > 0 ? `:${entry.meta}` : ''}>`;
    result.set(raw, [...selected].sort((left, right) => left.size - right.size));
    if (entry.meta === 0) result.set(`<${entry.key}:0>`, [...selected].sort((left, right) => left.size - right.size));
  });
  return result;
}
