import type { CSSProperties } from 'react';
import type { ItemPanelAtlas, ModIconAtlasEntry, ModIconAtlasManifest } from '../../types';

export type AtlasCandidateQuality = 'good' | 'question' | 'empty' | 'invalid';
export type AtlasCandidateSource = 'primary' | 'zip' | 'additional' | 'fallback';
export type AtlasSurface = 'nei' | 'recipeGrid' | 'cubixCraftGrid' | 'craftOutput' | 'preview' | 'diagnostics';

export interface AtlasCandidate {
  raw: string;
  key: string;
  meta: number | null;
  quality: AtlasCandidateQuality;
  source: AtlasCandidateSource;
  size: 32 | 256;
  revision: string;
  page?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  imageUrl?: string;
  displayName?: string;
  columns?: number;
  rows?: number;
  tileSize?: number;
  atlasFile?: string;
}

export interface AtlasV2CandidateRecord {
  raw: string | null;
  key: string;
  meta: number | null;
  quality: AtlasCandidateQuality | string;
  source: AtlasCandidateSource | string;
  size: number;
  revision: string;
  page?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  imageUrl?: string;
  displayName?: string;
  columns?: number;
  rows?: number;
  tileSize?: number;
}

export interface AtlasV2Page {
  name: string;
  source: string;
  size?: number;
  columns?: number;
  rows?: number;
  tileSize?: number;
  url: string;
}

export interface AtlasV2RegistryStats {
  catalogEntries: number;
  zipIcons: number;
  mappedZipIcons: number;
  unmappedZipIcons: number;
  mappedCandidates: number;
}

export interface AtlasV2Index {
  schemaVersion: number;
  revision: string | null;
  candidates: AtlasV2CandidateRecord[];
  pages: AtlasV2Page[];
  registry?: AtlasV2RegistryStats;
}

export interface AtlasLookupOptions {
  surface?: AtlasSurface;
  preferredSize?: 32 | 256;
  wildcardTick?: number;
}

export interface AtlasResolvedIcon {
  candidate: AtlasCandidate;
  style?: CSSProperties;
}

export interface AtlasLookupInput {
  primaryAtlas?: ItemPanelAtlas | null;
  atlasV2Index?: AtlasV2Index | null;
  modIconManifest?: ModIconAtlasManifest | null;
  modIconCandidatesByRaw?: Map<string, ModIconAtlasEntry[]>;
  fallbackIconsByRaw?: Map<string, string | null | undefined>;
}
