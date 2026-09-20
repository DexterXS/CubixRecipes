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
  modIconManifest?: ModIconAtlasManifest | null;
  modIconCandidatesByRaw?: Map<string, ModIconAtlasEntry[]>;
  fallbackIconsByRaw?: Map<string, string | null | undefined>;
}
