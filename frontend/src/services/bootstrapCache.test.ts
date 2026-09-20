import { beforeEach, describe, expect, test } from 'vitest';
import {
  buildBootstrapCacheScope,
  hydrateCachedItemPanelCatalog,
  hydrateCachedNeiFavorites,
  readCachedItemPanelCatalog,
  readCachedNeiFavorites,
  writeCachedItemPanelCatalog,
  writeCachedNeiFavorites
} from './bootstrapCache';

const favorites = {
  activeTabId: 'default',
  favoriteHotkey: 'A',
  hiddenPatterns: [],
  tabs: [{ id: 'default', name: 'Основное', items: [{ raw: '<minecraft:stone>', addedAt: 1 }] }]
};

const itemCatalog = {
  entries: [{ key: 'examplemod:cached', legacyId: null, meta: 0, hasNbt: false, displayRu: 'Кешированный предмет', displayEn: 'Cached item' }],
  summary: { catalog_fingerprint: 'test-fingerprint' }
};

describe('bootstrap cache', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('isolates snapshots by server and user', () => {
    expect(buildBootstrapCacheScope('hitech', 'User@example.com'))
      .not.toBe(buildBootstrapCacheScope('hitech', 'other@example.com'));
    expect(buildBootstrapCacheScope('hitech', 'User@example.com'))
      .not.toBe(buildBootstrapCacheScope('sky', 'User@example.com'));
  });

  test('restores valid favorites synchronously after reload', () => {
    const scope = buildBootstrapCacheScope('hitech', 'user@example.com');
    writeCachedNeiFavorites(scope, favorites);

    expect(readCachedNeiFavorites(scope)).toEqual(favorites);
  });

  test('ignores malformed cached favorites', () => {
    const scope = buildBootstrapCacheScope('hitech', 'user@example.com');
    window.localStorage.setItem(`cubixrecipes:bootstrap-snapshot:v1:${encodeURIComponent(scope)}:nei-favorites`, '{"value":{}}');

    expect(readCachedNeiFavorites(scope)).toBeNull();
  });

  test('hydrates the browser cache without requiring IndexedDB', async () => {
    const scope = buildBootstrapCacheScope('hitech', 'user@example.com');
    writeCachedNeiFavorites(scope, favorites);

    await expect(hydrateCachedNeiFavorites(scope)).resolves.toEqual(favorites);
  });

  test('restores the item catalog snapshot synchronously', () => {
    const scope = buildBootstrapCacheScope('hitech', 'user@example.com');
    writeCachedItemPanelCatalog(scope, itemCatalog.entries, itemCatalog.summary);

    expect(readCachedItemPanelCatalog(scope)).toEqual(itemCatalog);
  });

  test('hydrates the item catalog snapshot without requiring IndexedDB', async () => {
    const scope = buildBootstrapCacheScope('hitech', 'user@example.com');
    writeCachedItemPanelCatalog(scope, itemCatalog.entries, itemCatalog.summary);

    await expect(hydrateCachedItemPanelCatalog(scope)).resolves.toEqual(itemCatalog);
  });
});
