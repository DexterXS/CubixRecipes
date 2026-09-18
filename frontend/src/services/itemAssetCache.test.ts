import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  buildItemAssetCacheScope,
  itemAssetCacheKey,
  readCachedItemPanelAtlas,
} from './itemAssetCache';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('item asset cache', () => {
  test('isolates cached assets by server and user', () => {
    const firstScope = buildItemAssetCacheScope('hitech', 'User@example.com');
    const secondScope = buildItemAssetCacheScope('hitech', 'other@example.com');

    expect(firstScope).not.toBe(secondScope);
    expect(itemAssetCacheKey(firstScope, 'atlas-image', 'revision-1'))
      .not.toBe(itemAssetCacheKey(secondScope, 'atlas-image', 'revision-1'));
  });

  test('restores a cached atlas as a browser object URL', async () => {
    const scope = buildItemAssetCacheScope('hitech', 'user@example.com');
    const responses = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (key: RequestInfo | URL) => responses.get(String(key)) ?? undefined),
      put: vi.fn(),
      delete: vi.fn()
    } as unknown as Cache;
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:cached-atlas')
    });

    responses.set(itemAssetCacheKey(scope, 'atlas-manifest'), new Response(JSON.stringify({
      revision: 'revision-1',
      atlas: { image_url: '/api/itempanel/atlas.png', tile_size: 32, columns: 1, rows: 1, entries: {} }
    })));
    responses.set(itemAssetCacheKey(scope, 'atlas-image', 'revision-1'), new Response(new Blob(['png'])));

    const atlas = await readCachedItemPanelAtlas(scope);

    expect(atlas?.image_url).toBe('blob:cached-atlas');
    expect(atlas?.tile_size).toBe(32);
  });
});
