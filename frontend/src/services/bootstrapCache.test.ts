import { beforeEach, describe, expect, test } from 'vitest';
import {
  buildBootstrapCacheScope,
  hydrateCachedNeiFavorites,
  readCachedNeiFavorites,
  writeCachedNeiFavorites
} from './bootstrapCache';

const favorites = {
  activeTabId: 'default',
  favoriteHotkey: 'A',
  hiddenPatterns: [],
  tabs: [{ id: 'default', name: 'Основное', items: [{ raw: '<minecraft:stone>', addedAt: 1 }] }]
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
});
