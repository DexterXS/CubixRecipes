import { beforeEach, expect, test, vi } from 'vitest';

import { getItemPanelAtlas, getStaticItemPanelAtlas } from './api';

beforeEach(() => {
  vi.restoreAllMocks();
});

test('getItemPanelAtlas falls back to the static base atlas when backend atlas is empty', async () => {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/debug/log') {
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true }),
      }) as Promise<Response>;
    }
    if (url === '/api/itempanel/atlas') {
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          image_url: '/api/itempanel/atlas.png',
          tile_size: 32,
          columns: 0,
          rows: 0,
          entries: {},
        }),
      }) as Promise<Response>;
    }
    if (url === '/itempanel-atlas.json') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          image_url: '/itempanel-atlas.png',
          tile_size: 32,
          columns: 1,
          rows: 1,
          entries: {
            '<minecraft:stone>': { x: 0, y: 0, w: 32, h: 32, display_name: 'Stone', item_key: 'minecraft:stone', meta: 0 },
          },
        }),
      }) as Promise<Response>;
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });

  const atlas = await getItemPanelAtlas();

  expect(atlas.image_url).toBe('/itempanel-atlas.png');
  expect(Object.keys(atlas.entries)).toEqual(['<minecraft:stone>']);
  expect(global.fetch).toHaveBeenCalledWith('/itempanel-atlas.json');
});

test('getStaticItemPanelAtlas prefers the last published server snapshot', async () => {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/itempanel/static/atlas.json') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          image_url: '/api/itempanel/static/atlas.png?v=published',
          tile_size: 32,
          columns: 1,
          rows: 1,
          entries: {
            '<minecraft:diamond>': { x: 0, y: 0, w: 32, h: 32, display_name: 'Diamond', item_key: 'minecraft:diamond', meta: 0 },
          },
        }),
      }) as Promise<Response>;
    }
    return Promise.reject(new Error(`unexpected fetch ${String(input)}`));
  });

  const atlas = await getStaticItemPanelAtlas();

  expect(atlas.image_url).toBe('/api/itempanel/static/atlas.png?v=published');
  expect(Object.keys(atlas.entries)).toEqual(['<minecraft:diamond>']);
  expect(global.fetch).toHaveBeenCalledWith('/api/itempanel/static/atlas.json', expect.objectContaining({ cache: 'no-store' }));
});
