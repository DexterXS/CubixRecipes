import type { ModIconAtlasManifest } from '../types';
import { apiPath, buildRequestHeaders } from './api/client';

const CACHE_NAME = 'cubixrecipes-mod-icon-assets-v1';
const CACHE_NAMESPACE = '/__cubixrecipes_mod_icon_cache__';
type CacheEntryKind = 'manifest' | 'atlas-image';

interface CachedModIconManifest {
  revision: string;
  manifest: ModIconAtlasManifest;
}

export interface CachedModIconAtlas {
  revision: string;
  manifest: ModIconAtlasManifest;
}

const cachedObjectUrls = new Set<string>();

export function modIconAssetCacheKey(scope: string, kind: CacheEntryKind, revision?: string, assetUrl?: string): string {
  const params = new URLSearchParams({ scope, kind });
  if (revision) params.set('revision', revision);
  if (assetUrl) params.set('asset', assetUrl);
  return `${CACHE_NAMESPACE}?${params.toString()}`;
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

function manifestRevision(manifest: ModIconAtlasManifest): string | null {
  const revision = manifest.revision?.trim() || manifest.updatedAt?.trim();
  return revision || null;
}

function atlasImageUrls(manifest: ModIconAtlasManifest): string[] {
  const urls = new Set<string>();
  manifest.atlases.forEach((atlas) => {
    if (atlas.image_url) urls.add(atlas.image_url);
    Object.values(atlas.entries ?? {}).forEach((entry) => {
      if (entry.image_url) urls.add(entry.image_url);
    });
  });
  Object.values(manifest.entries ?? {}).forEach((entries) => {
    Object.values(entries ?? {}).forEach((entry) => {
      if (entry.image_url) urls.add(entry.image_url);
    });
  });
  return [...urls];
}

function replaceImageUrls(manifest: ModIconAtlasManifest, imageUrls: Map<string, string>): ModIconAtlasManifest {
  const replace = (url: string) => imageUrls.get(url) ?? url;
  return {
    ...manifest,
    atlases: manifest.atlases.map((atlas) => ({
      ...atlas,
      image_url: replace(atlas.image_url),
      entries: Object.fromEntries(Object.entries(atlas.entries ?? {}).map(([key, entry]) => [key, {
        ...entry,
        image_url: replace(entry.image_url)
      }]))
    })),
    entries: Object.fromEntries(Object.entries(manifest.entries ?? {}).map(([size, entries]) => [size,
      Object.fromEntries(Object.entries(entries ?? {}).map(([key, entry]) => [key, {
        ...entry,
        image_url: replace(entry.image_url)
      }]))
    ]))
  };
}

export async function readCachedModIconAtlas(scope: string): Promise<CachedModIconAtlas | null> {
  const cache = await openAssetCache();
  if (!cache) return null;

  const objectUrls: string[] = [];
  try {
    const manifestResponse = await cache.match(modIconAssetCacheKey(scope, 'manifest'));
    if (!manifestResponse) return null;
    const cached = await manifestResponse.json() as Partial<CachedModIconManifest>;
    if (!cached.revision || !cached.manifest?.atlases || !cached.manifest.entries) return null;

    const imageUrls = new Map<string, string>();
    for (const imageUrl of atlasImageUrls(cached.manifest)) {
      const imageResponse = await cache.match(modIconAssetCacheKey(scope, 'atlas-image', cached.revision, imageUrl));
      if (!imageResponse) throw new Error(`Missing cached mod atlas page: ${imageUrl}`);
      const objectUrl = URL.createObjectURL(await imageResponse.blob());
      cachedObjectUrls.add(objectUrl);
      objectUrls.push(objectUrl);
      imageUrls.set(imageUrl, objectUrl);
    }

    return {
      revision: cached.revision,
      manifest: replaceImageUrls(cached.manifest, imageUrls)
    };
  } catch {
    objectUrls.forEach((url) => {
      URL.revokeObjectURL(url);
      cachedObjectUrls.delete(url);
    });
    return null;
  }
}

export async function writeCachedModIconAtlas(
  scope: string,
  manifest: ModIconAtlasManifest,
  serverId: string | null | undefined
): Promise<CachedModIconAtlas | null> {
  const revision = manifestRevision(manifest);
  const cache = await openAssetCache();
  if (!cache || !revision) return null;

  try {
    const previousManifestResponse = await cache.match(modIconAssetCacheKey(scope, 'manifest'));
    const previous = previousManifestResponse
      ? await previousManifestResponse.json() as Partial<CachedModIconManifest>
      : null;
    if (previous?.revision === revision) {
      const existing = await readCachedModIconAtlas(scope);
      if (existing) return existing;
    }

    for (const imageUrl of atlasImageUrls(manifest)) {
      const response = await fetch(resolveAssetUrl(imageUrl), {
        cache: 'force-cache',
        credentials: 'include',
        headers: buildRequestHeaders(serverId ? { 'X-Server-Id': serverId } : undefined)
      });
      if (!response.ok) return null;
      await cache.put(modIconAssetCacheKey(scope, 'atlas-image', revision, imageUrl), response.clone());
    }

    await cache.put(modIconAssetCacheKey(scope, 'manifest'), new Response(JSON.stringify({ revision, manifest }), {
      headers: { 'Content-Type': 'application/json' }
    }));

    if (previous?.revision && previous.revision !== revision && previous.manifest) {
      for (const imageUrl of atlasImageUrls(previous.manifest)) {
        await cache.delete(modIconAssetCacheKey(scope, 'atlas-image', previous.revision, imageUrl));
      }
    }
    return await readCachedModIconAtlas(scope);
  } catch {
    return null;
  }
}

export async function clearCachedModIconAtlas(scope: string): Promise<void> {
  const cache = await openAssetCache();
  if (!cache) return;
  try {
    const manifestResponse = await cache.match(modIconAssetCacheKey(scope, 'manifest'));
    if (manifestResponse) {
      const cached = await manifestResponse.json() as Partial<CachedModIconManifest>;
      if (cached.revision && cached.manifest) {
        for (const imageUrl of atlasImageUrls(cached.manifest)) {
          await cache.delete(modIconAssetCacheKey(scope, 'atlas-image', cached.revision, imageUrl));
        }
      }
    }
    await cache.delete(modIconAssetCacheKey(scope, 'manifest'));
  } catch {
    // Browser cache cleanup is best-effort.
  }
}

export function releaseCachedModIconAtlas(manifest: ModIconAtlasManifest | null | undefined): void {
  if (!manifest) return;
  atlasImageUrls(manifest).forEach((imageUrl) => {
    if (!cachedObjectUrls.has(imageUrl)) return;
    URL.revokeObjectURL(imageUrl);
    cachedObjectUrls.delete(imageUrl);
  });
}

export function getModIconAtlasRevision(manifest: ModIconAtlasManifest | null | undefined): string | null {
  return manifest ? manifestRevision(manifest) : null;
}
