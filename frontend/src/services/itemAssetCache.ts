import type { ItemPanelAtlas } from '../types';
import { apiPath, buildRequestHeaders } from './api/client';

const CACHE_NAME = 'cubixrecipes-item-assets-v1';
const CACHE_NAMESPACE = '/__cubixrecipes_asset_cache__';
type CacheEntryKind = 'atlas-manifest' | 'atlas-image';

interface CachedAtlasManifest {
  revision: string;
  atlas: ItemPanelAtlas;
}

const cachedObjectUrls = new Set<string>();

export function buildItemAssetCacheScope(serverId: string | null | undefined, userEmail: string | null | undefined): string {
  const server = serverId?.trim() || 'default';
  const user = userEmail?.trim().toLowerCase() || 'anonymous';
  return `${server}::${user}`;
}

export function itemAssetCacheKey(scope: string, kind: CacheEntryKind, revision?: string): string {
  const encodedScope = encodeURIComponent(scope);
  const encodedRevision = revision ? `&revision=${encodeURIComponent(revision)}` : '';
  return `${CACHE_NAMESPACE}?scope=${encodedScope}&kind=${kind}${encodedRevision}`;
}

async function openAssetCache(): Promise<Cache | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  try {
    return await window.caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

function resolveAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url) || url.startsWith('blob:')) return url;
  if (url.startsWith('/api/')) return apiPath(url.slice(4));
  return new URL(url, window.location.origin).toString();
}

function isAtlas(value: unknown): value is ItemPanelAtlas {
  if (!value || typeof value !== 'object') return false;
  const atlas = value as Partial<ItemPanelAtlas>;
  return typeof atlas.image_url === 'string'
    && typeof atlas.tile_size === 'number'
    && typeof atlas.columns === 'number'
    && typeof atlas.rows === 'number'
    && Boolean(atlas.entries && typeof atlas.entries === 'object');
}

export async function readCachedItemPanelAtlas(scope: string): Promise<ItemPanelAtlas | null> {
  const cache = await openAssetCache();
  if (!cache) return null;

  try {
    const manifestResponse = await cache.match(itemAssetCacheKey(scope, 'atlas-manifest'));
    if (!manifestResponse) return null;
    const cached = await manifestResponse.json() as Partial<CachedAtlasManifest>;
    if (!cached.revision || !isAtlas(cached.atlas)) return null;

    const imageResponse = await cache.match(itemAssetCacheKey(scope, 'atlas-image', cached.revision));
    if (!imageResponse) return null;
    const objectUrl = URL.createObjectURL(await imageResponse.blob());
    cachedObjectUrls.add(objectUrl);
    return { ...cached.atlas, image_url: objectUrl };
  } catch {
    return null;
  }
}

export async function writeCachedItemPanelAtlas(scope: string, atlas: ItemPanelAtlas, serverId: string | null | undefined): Promise<void> {
  if (!isAtlas(atlas)) return;
  const cache = await openAssetCache();
  if (!cache) return;

  try {
    const previousManifestResponse = await cache.match(itemAssetCacheKey(scope, 'atlas-manifest'));
    const previous = previousManifestResponse
      ? await previousManifestResponse.json() as Partial<CachedAtlasManifest>
      : null;
    const revision = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const imageResponse = await fetch(resolveAssetUrl(atlas.image_url), {
      cache: 'no-store',
      credentials: 'include',
      headers: buildRequestHeaders(serverId ? { 'X-Server-Id': serverId } : undefined)
    });
    if (!imageResponse.ok) return;

    await cache.put(itemAssetCacheKey(scope, 'atlas-image', revision), imageResponse);
    const storedAtlas: ItemPanelAtlas = { ...atlas, image_url: '/api/itempanel/atlas.png' };
    const manifest = new Response(JSON.stringify({ revision, atlas: storedAtlas }), {
      headers: { 'Content-Type': 'application/json' }
    });
    await cache.put(itemAssetCacheKey(scope, 'atlas-manifest'), manifest);

    if (previous?.revision && previous.revision !== revision) {
      await cache.delete(itemAssetCacheKey(scope, 'atlas-image', previous.revision));
    }
  } catch {
    // Persistent browser caches are optional and must never block the editor.
  }
}

export function releaseCachedItemPanelAtlas(atlas: ItemPanelAtlas | null | undefined): void {
  const imageUrl = atlas?.image_url;
  if (!imageUrl || !cachedObjectUrls.has(imageUrl)) return;
  URL.revokeObjectURL(imageUrl);
  cachedObjectUrls.delete(imageUrl);
}
