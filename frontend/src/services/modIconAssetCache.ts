import type { ModIconAtlasManifest } from '../types';

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

export async function readCachedModIconAtlas(scope: string): Promise<CachedModIconAtlas | null> {
  const cache = await openAssetCache();
  if (!cache) return null;

  try {
    const manifestResponse = await cache.match(modIconAssetCacheKey(scope, 'manifest'));
    if (!manifestResponse) return null;
    const cached = await manifestResponse.json() as Partial<CachedModIconManifest>;
    if (!cached.revision || !cached.manifest?.atlases || !cached.manifest.entries) return null;

    return {
      revision: cached.revision,
      manifest: cached.manifest
    };
  } catch {
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
      return { revision, manifest };
    }

    await cache.put(modIconAssetCacheKey(scope, 'manifest'), new Response(JSON.stringify({ revision, manifest }), {
      headers: { 'Content-Type': 'application/json' }
    }));

    if (previous?.revision && previous.revision !== revision && previous.manifest) {
      for (const imageUrl of atlasImageUrls(previous.manifest)) {
        await cache.delete(modIconAssetCacheKey(scope, 'atlas-image', previous.revision, imageUrl));
      }
    }
    return { revision, manifest };
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
  // Atlas page bytes are owned by the browser Cache Storage and are not
  // converted into per-render object URLs. Keep this compatibility function
  // for callers that release the previous eager-cache implementation.
  void manifest;
}

export function getModIconAtlasRevision(manifest: ModIconAtlasManifest | null | undefined): string | null {
  return manifest ? manifestRevision(manifest) : null;
}
