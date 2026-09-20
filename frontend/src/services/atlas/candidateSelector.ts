import type { AtlasCandidate, AtlasLookupOptions } from './types';

const QUALITY_RANK: Record<AtlasCandidate['quality'], number> = {
  good: 4,
  question: 3,
  empty: 2,
  invalid: 0
};

const SOURCE_RANK: Record<AtlasCandidate['source'], number> = {
  primary: 4,
  zip: 3,
  additional: 2,
  fallback: 1
};

export interface ParsedAtlasRaw {
  key: string;
  meta: number | null;
  wildcardMeta: boolean;
}

export function parseAtlasRaw(raw: string): ParsedAtlasRaw | null {
  const match = raw.trim().match(/^<([a-zA-Z0-9_.-]+:[a-zA-Z0-9_./-]+)(?::([0-9*]+))?>(?:\.withTag\([\s\S]*\))?$/);
  if (!match) return null;
  const rawMeta = (match[2] ?? '').toLowerCase();
  if (rawMeta === '*') return { key: match[1].toLowerCase(), meta: null, wildcardMeta: true };
  if (!rawMeta) return { key: match[1].toLowerCase(), meta: 0, wildcardMeta: false };
  const meta = Number.parseInt(rawMeta, 10);
  return { key: match[1].toLowerCase(), meta: Number.isNaN(meta) ? 0 : meta, wildcardMeta: false };
}

function normalizeQuality(value: AtlasCandidate['quality'] | string | undefined): AtlasCandidate['quality'] {
  if (value === 'question' || value === 'missing_texture_icon') return 'question';
  if (value === 'empty' || value === 'transparent_icon' || value === 'empty_or_black_icon') return 'empty';
  if (value === 'invalid' || value === 'unsupported_icon' || value === 'no_icon_file') return 'invalid';
  return 'good';
}

function normalizeCandidate(candidate: AtlasCandidate): AtlasCandidate {
  return { ...candidate, key: candidate.key.toLowerCase(), quality: normalizeQuality(candidate.quality) };
}

function compareRevision(left: string, right: string): number {
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function compareCandidates(left: { candidate: AtlasCandidate; matchRank: number }, right: { candidate: AtlasCandidate; matchRank: number }, preferredSize: 32 | 256): number {
  const quality = QUALITY_RANK[right.candidate.quality] - QUALITY_RANK[left.candidate.quality];
  if (quality) return quality;
  const match = right.matchRank - left.matchRank;
  if (match) return match;
  const source = SOURCE_RANK[right.candidate.source] - SOURCE_RANK[left.candidate.source];
  if (source) return source;
  const leftSize = left.candidate.size === preferredSize ? 1 : 0;
  const rightSize = right.candidate.size === preferredSize ? 1 : 0;
  if (rightSize !== leftSize) return rightSize - leftSize;
  return compareRevision(right.candidate.revision, left.candidate.revision);
}

export function selectAtlasCandidate(candidates: AtlasCandidate[], options: AtlasLookupOptions = {}): AtlasCandidate | null {
  const preferredSize = options.preferredSize ?? 32;
  const usable = candidates
    .map(normalizeCandidate)
    .filter((candidate) => candidate.quality !== 'invalid');
  if (!usable.length) return null;

  const ordered = [...usable].sort((left, right) => compareCandidates(
    { candidate: left, matchRank: 0 },
    { candidate: right, matchRank: 0 },
    preferredSize
  ));
  const best = ordered[0];
  if (!best) return null;
  if (parseAtlasRaw(best.raw)?.wildcardMeta && options.wildcardTick) {
    const topQuality = QUALITY_RANK[best.quality];
    const sameQuality = ordered.filter((candidate) => QUALITY_RANK[candidate.quality] === topQuality);
    return sameQuality[options.wildcardTick % sameQuality.length] ?? best;
  }
  return best;
}

export function selectRankedAtlasCandidate(
  candidates: Array<{ candidate: AtlasCandidate; matchRank: number }>,
  options: AtlasLookupOptions = {}
): AtlasCandidate | null {
  const preferredSize = options.preferredSize ?? 32;
  const usable = candidates
    .map(({ candidate, matchRank }) => ({ candidate: normalizeCandidate(candidate), matchRank }))
    .filter(({ candidate }) => candidate.quality !== 'invalid');
  if (!usable.length) return null;
  usable.sort((left, right) => compareCandidates(left, right, preferredSize));
  const best = usable[0];
  if (!best) return null;

  if (parseAtlasRaw(best.candidate.raw)?.wildcardMeta && options.wildcardTick) {
    const sameRank = usable.filter((entry) => (
      QUALITY_RANK[entry.candidate.quality] === QUALITY_RANK[best.candidate.quality]
      && entry.matchRank === best.matchRank
    ));
    return sameRank[options.wildcardTick % sameRank.length]?.candidate ?? best.candidate;
  }
  return best.candidate;
}
