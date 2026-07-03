import { describe, expect, test } from 'vitest';

import { buildAuctionCommands, createDefaultAuctionCurve, formatAuctionUtcDate, sanitizeAuctionFilename } from './auctionCommands';
import type { AuctionDraft } from './auctionTypes';

const baseAuction: AuctionDraft = {
  id: '27',
  name: 'Test auction',
  description: 'rare item',
  startLocal: '2026-03-31T23:10',
  durationMinutes: 10,
  currency: 'DONATE',
  baseStartPrice: 100,
  baseStepPrice: 10,
  state: 'ACTIVE',
  planned: true,
  repeatEnabled: false,
  repeatEveryDays: 7,
  repeatCount: 1,
  scheduleLeadMinutes: 1,
  items: [
    { uid: 'a', raw: '<minecraft:stone:1>', title: 'Stone', legacyId: 1, meta: 1, hasNbt: false, quantity: 2 },
    { uid: 'b', raw: '<minecraft:chest>.withTag({tag:1})', title: 'NBT Chest', legacyId: 54, meta: 0, hasNbt: true, quantity: 1 }
  ]
};

describe('auction command generation', () => {
  test('formats selected timezone into UTC+0 aca date', () => {
    expect(formatAuctionUtcDate('2026-03-31T23:10', 180)).toBe('31.03.2026_20:10');
  });

  test('generates auction commands and skips NBT items', () => {
    const commands = buildAuctionCommands({
      auctions: [baseAuction],
      curve: createDefaultAuctionCurve(),
      idMode: 'legacy',
      timezoneOffsetMinutes: 180,
      commandPlayer: '@p',
      graphStartLocal: '2026-03-01T00:00'
    });

    expect(commands).toContain('/aca create 31.03.2026_20:10 31.03.2026_20:20 100 10 DONATE');
    expect(commands).toContain('/give @p 1 2 1');
    expect(commands).toContain('/aca scheduleCreate 27 31.03.2026_20:10 31.03.2026_20:09 604800 600');
    expect(commands).not.toContain('chest');
  });

  test('strips file extensions from generated filenames', () => {
    expect(sanitizeAuctionFilename('auction_pack.txt')).toBe('auction_pack');
  });
});
