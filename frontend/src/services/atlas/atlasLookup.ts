import type { CSSProperties } from 'react';
import type { ItemPanelAtlas, ItemPanelAtlasEntry, ModIconAtlasEntry, ModIconAtlasManifest } from '../../types';
import { parseAtlasRaw, selectRankedAtlasCandidate } from './candidateSelector';
import { resolveAtlasPageUrl } from './atlasPageUrlResolver';
import type { AtlasCandidate, AtlasLookupInput, AtlasLookupOptions, AtlasResolvedIcon } from './types';

function revisionOf(value: string | undefined): string {
  return value ?? '';
}

function qualityOf(value: string | undefined): AtlasCandidate['quality'] {
  if (value === 'question' || value === 'missing_texture_icon') return 'question';
  if (value === 'empty' || value === 'transparent_icon' || value === 'empty_or_black_icon') return 'empty';
  if (value === 'invalid' || value === 'unsupported_icon' || value === 'no_icon_file') return 'invalid';
  return 'good';
}

function itemPanelCandidate(raw: string, entry: ItemPanelAtlasEntry, atlas: ItemPanelAtlas): AtlasCandidate {
  return {
    raw,
    key: entry.item_key.toLowerCase(),
    meta: entry.meta ?? 0,
    quality: qualityOf(entry.quality),
    source: entry.source === 'zip' ? 'zip' : 'primary',
    size: atlas.tile_size >= 128 ? 256 : 32,
    revision: revisionOf(atlas.revision),
    x: entry.x,
    y: entry.y,
    w: entry.w,
    h: entry.h,
    imageUrl: atlas.image_url,
    displayName: entry.display_name,
    columns: atlas.columns,
    rows: atlas.rows,
    tileSize: atlas.tile_size
  };
}

function modIconCandidate(raw: string, entry: ModIconAtlasEntry, manifest: ModIconAtlasManifest): AtlasCandidate {
  const atlas = manifest.atlases.find((page) => page.file === entry.atlasFile);
  const parsed = parseAtlasRaw(raw);
  return {
    raw,
    key: parsed?.key ?? entry.modid.toLowerCase(),
    meta: parsed?.meta ?? null,
    quality: qualityOf(entry.quality),
    source: 'zip',
    size: entry.size >= 128 ? 256 : 32,
    revision: revisionOf(manifest.revision),
    page: String(entry.page),
    x: entry.x,
    y: entry.y,
    w: entry.w,
    h: entry.h,
    imageUrl: entry.image_url,
    displayName: entry.iconName ?? entry.entryName,
    columns: atlas?.columns,
    rows: atlas?.rows,
    tileSize: atlas?.tileSize ?? entry.size,
    atlasFile: entry.atlasFile
  };
}

function fallbackCandidate(raw: string, imageUrl: string): AtlasCandidate {
  const parsed = parseAtlasRaw(raw);
  return {
    raw,
    key: parsed?.key ?? raw.toLowerCase(),
    meta: parsed?.meta ?? null,
    quality: 'good',
    source: 'fallback',
    size: 32,
    revision: '',
    imageUrl
  };
}

function candidateStyle(candidate: AtlasCandidate): CSSProperties | undefined {
  if (!candidate.imageUrl) return undefined;
  const imageUrl = resolveAtlasPageUrl(candidate.imageUrl);
  if (candidate.x === undefined || candidate.y === undefined || !candidate.columns || !candidate.rows || !candidate.w || !candidate.h) {
    return { backgroundImage: `url(${imageUrl})`, backgroundRepeat: 'no-repeat', backgroundSize: 'contain' };
  }
  const displaySize = 32 / Math.max(candidate.w, 1);
  return {
    backgroundImage: `url(${imageUrl})`,
    backgroundPosition: `-${candidate.x * displaySize}px -${candidate.y * displaySize}px`,
    backgroundSize: `${candidate.columns * candidate.w * displaySize}px ${candidate.rows * candidate.h * displaySize}px`,
    backgroundRepeat: 'no-repeat'
  };
}

export interface AtlasLookup {
  resolve(raw: string, options?: AtlasLookupOptions): AtlasResolvedIcon | null;
  getIconStyle(raw: string, options?: AtlasLookupOptions): CSSProperties | undefined;
  candidatesFor(raw: string): AtlasCandidate[];
}

export function createAtlasLookup(input: AtlasLookupInput): AtlasLookup {
  const byRaw = new Map<string, AtlasCandidate[]>();
  const byKeyMeta = new Map<string, AtlasCandidate[]>();
  const byKey = new Map<string, AtlasCandidate[]>();
  const register = (candidate: AtlasCandidate) => {
    const normalized = { ...candidate, key: candidate.key.toLowerCase() };
    const rawKey = normalized.raw.trim();
    byRaw.set(rawKey, [...(byRaw.get(rawKey) ?? []), normalized]);
    const keyMeta = `${normalized.key}:${normalized.meta ?? 0}`;
    byKeyMeta.set(keyMeta, [...(byKeyMeta.get(keyMeta) ?? []), normalized]);
    byKey.set(normalized.key, [...(byKey.get(normalized.key) ?? []), normalized]);
  };

  if (input.primaryAtlas) {
    Object.entries(input.primaryAtlas.entries).forEach(([raw, entry]) => register(itemPanelCandidate(raw, entry, input.primaryAtlas!)));
  }
  if (input.modIconManifest && input.modIconCandidatesByRaw) {
    input.modIconCandidatesByRaw.forEach((entries, raw) => entries.forEach((entry) => register(modIconCandidate(raw, entry, input.modIconManifest!))));
  }
  input.fallbackIconsByRaw?.forEach((imageUrl, raw) => {
    if (imageUrl) register(fallbackCandidate(raw, imageUrl));
  });

  function resolve(raw: string, options: AtlasLookupOptions = {}): AtlasResolvedIcon | null {
    const parsed = parseAtlasRaw(raw);
    const ranked: Array<{ candidate: AtlasCandidate; matchRank: number }> = [];
    const exact = byRaw.get(raw.trim()) ?? [];
    exact.forEach((candidate) => ranked.push({ candidate, matchRank: 3 }));
    if (parsed) {
      if (parsed.wildcardMeta) {
        (byKey.get(parsed.key) ?? []).forEach((candidate) => ranked.push({ candidate, matchRank: 1 }));
      } else {
        (byKeyMeta.get(`${parsed.key}:${parsed.meta ?? 0}`) ?? []).forEach((candidate) => ranked.push({ candidate, matchRank: 2 }));
        (byKeyMeta.get(`${parsed.key}:0`) ?? []).forEach((candidate) => ranked.push({ candidate, matchRank: 1 }));
        (byKey.get(parsed.key) ?? []).forEach((candidate) => ranked.push({ candidate, matchRank: 1 }));
      }
    }
    if (!ranked.length) return null;
    const candidate = selectRankedAtlasCandidate(ranked, options);
    return candidate ? { candidate, style: candidateStyle(candidate) } : null;
  }

  return {
    resolve,
    getIconStyle: (raw, options) => resolve(raw, options)?.style,
    candidatesFor: (raw) => {
      const parsed = parseAtlasRaw(raw);
      if (!parsed) return [...(byRaw.get(raw.trim()) ?? [])];
      return [
        ...(byRaw.get(raw.trim()) ?? []),
        ...(byKeyMeta.get(`${parsed.key}:${parsed.meta ?? 0}`) ?? []),
        ...(byKey.get(parsed.key) ?? [])
      ];
    }
  };
}
