import { describe, expect, test } from 'vitest';

import { auctionNameFromItems, moveLotItem } from './auctionLotItems';
import type { AuctionLotItem } from './auctionTypes';

const items: AuctionLotItem[] = [
  { uid: 'stone', raw: '<minecraft:stone>', title: 'Stone', legacyId: 1, meta: 0, hasNbt: false, quantity: 1, basePrice: 100 },
  { uid: 'stick', raw: '<minecraft:stick>', title: 'Stick', legacyId: 280, meta: 0, hasNbt: false, quantity: 2, basePrice: 100 },
  { uid: 'diamond', raw: '<minecraft:diamond>', title: 'Diamond', legacyId: 264, meta: 0, hasNbt: false, quantity: 3, basePrice: 100 }
];

describe('auction lot item ordering', () => {
  test('uses only the first item as the auction name source', () => {
    expect(auctionNameFromItems(items, 'Auction 1')).toBe('Stone');
    expect(auctionNameFromItems([], 'Auction 1')).toBe('Auction 1');
  });

  test('moves lot items without changing unrelated rows', () => {
    const moved = moveLotItem(items, 'diamond', -1);

    expect(moved.map((item) => item.uid)).toEqual(['stone', 'diamond', 'stick']);
    expect(auctionNameFromItems(moved, 'Auction 1')).toBe('Stone');
    expect(moveLotItem(items, 'stone', -1)).toBe(items);
  });
});
