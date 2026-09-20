import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ModIconAtlasManifest } from '../types';
import {
  buildItemAssetCacheScope
} from './itemAssetCache';
import {
  modIconAssetCacheKey,
  readCachedModIconAtlas,
  writeCachedModIconAtlas
} from './modIconAssetCache';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('mod icon asset cache', () => {
  test('restores the manifest without reading x32/x256 pages eagerly', async () => {
    const scope = buildItemAssetCacheScope('hitech', 'user@example.com');
    const manifest: ModIconAtlasManifest = {
      revision: 'revision-1',
      maxAtlasSize: 4096,
      fallbackAtlasUrl: '/api/itempanel/atlas.png',
      archives: [],
      atlases: [
        {
          size: 32,
          page: 1,
          image_url: '/api/mod-icons/atlases/mod-icons-x32-1.png?v=revision-1',
          file: 'mod-icons-x32-1.png',
          columns: 1,
          rows: 1,
          tileSize: 32,
          entries: {
            first: {
              key: 'mod:first',
              modid: 'mod',
              iconName: 'first',
              size: 32,
              page: 1,
              atlasFile: 'mod-icons-x32-1.png',
              image_url: '/api/mod-icons/atlases/mod-icons-x32-1.png?v=revision-1',
              x: 0,
              y: 0,
              w: 32,
              h: 32
            }
          }
        },
        {
          size: 256,
          page: 2,
          image_url: '/api/mod-icons/atlases/mod-icons-x256-2.png?v=revision-1',
          file: 'mod-icons-x256-2.png',
          columns: 1,
          rows: 1,
          tileSize: 256,
          entries: {
            second: {
              key: 'mod:second',
              modid: 'mod',
              iconName: 'second',
              size: 256,
              page: 2,
              atlasFile: 'mod-icons-x256-2.png',
              image_url: '/api/mod-icons/atlases/mod-icons-x256-2.png?v=revision-1',
              x: 0,
              y: 0,
              w: 256,
              h: 256
            }
          }
        }
      ],
      entries: {
        x32: {},
        x256: {}
      },
      duplicates: [],
      rejected: [],
      totalMods: 1,
      totalIcons: 2
    };
    const responses = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (key: RequestInfo | URL) => responses.get(String(key)) ?? undefined),
      put: vi.fn(),
      delete: vi.fn()
    } as unknown as Cache;
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });

    responses.set(modIconAssetCacheKey(scope, 'manifest'), new Response(JSON.stringify({ revision: 'revision-1', manifest })));
    for (const atlas of manifest.atlases) {
      responses.set(modIconAssetCacheKey(scope, 'atlas-image', 'revision-1', atlas.image_url), new Response(new Blob(['png'])));
    }

    const cached = await readCachedModIconAtlas(scope);

    expect(cached?.revision).toBe('revision-1');
    expect(cached?.manifest.atlases).toHaveLength(2);
    expect(cached?.manifest.atlases[0].image_url).toContain('mod-icons-x32-1.png');
    expect(cached?.manifest.atlases[1].image_url).toContain('mod-icons-x256-2.png');
    expect(cache.match).toHaveBeenCalledTimes(1);
  });

  test('stores only the manifest and does not download atlas pages during refresh', async () => {
    const scope = buildItemAssetCacheScope('hitech', 'user@example.com');
    const manifest = {
      revision: 'revision-2',
      maxAtlasSize: 4096,
      fallbackAtlasUrl: '/api/itempanel/atlas.png',
      archives: [],
      atlases: [
        {
          size: 32,
          page: 1,
          image_url: '/api/mod-icons/atlases/mod-icons-x32-1.png?v=revision-2',
          file: 'mod-icons-x32-1.png',
          columns: 1,
          rows: 1,
          tileSize: 32,
          entries: {}
        }
      ],
      entries: { x32: {}, x256: {} },
      duplicates: [],
      rejected: [],
      totalMods: 0,
      totalIcons: 0
    } satisfies ModIconAtlasManifest;
    const cache = {
      match: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined)
    } as unknown as Cache;
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
    vi.stubGlobal('fetch', vi.fn());

    const result = await writeCachedModIconAtlas(scope, manifest, 'hitech');

    expect(result?.manifest).toBe(manifest);
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(String((cache.put as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('kind=manifest');
    expect(fetch).not.toHaveBeenCalled();
  });
});
