import { describe, expect, test } from 'vitest';

import { buildAuctionCommandStages, buildAuctionRunPricePreviews, createDefaultAuctionCurve, formatAuctionUtcDate, sanitizeAuctionFilename } from './auctionCommands';
import type { AuctionDraft } from './auctionTypes';

const baseAuction: AuctionDraft = {
  id: 'local-1',
  serverIds: { 0: '27' },
  name: 'Test auction',
  description: 'rare item',
  startLocal: '2026-03-31T23:10',
  durationMinutes: 10,
  currency: 'DONATE',
  baseStepPrice: 10,
  state: 'ACTIVE',
  planned: true,
  repeatEnabled: false,
  repeatEveryDays: 7,
  repeatCount: 1,
  scheduleLeadMinutes: 1,
  items: [
    { uid: 'a', raw: '<minecraft:stone:1>', title: 'Stone', legacyId: 1, meta: 1, hasNbt: false, quantity: 2, basePrice: 100 },
    { uid: 'b', raw: '<minecraft:chest>.withTag({tag:1})', title: 'NBT Chest', legacyId: 54, meta: 0, hasNbt: true, quantity: 1, basePrice: 5000 }
  ]
};

describe('auction command generation', () => {
  test('formats selected timezone into UTC+0 aca date', () => {
    expect(formatAuctionUtcDate('2026-03-31T23:10', 180)).toBe('31.03.2026_20:10');
  });

  test('generates staged auction commands and skips NBT items', () => {
    const stages = buildAuctionCommandStages({
      auctions: [baseAuction],
      curve: createDefaultAuctionCurve(),
      idMode: 'legacy',
      timezoneOffsetMinutes: 180,
      commandPlayer: '@p',
      graphStartLocal: '2026-03-01T00:00',
      workflowMode: 'install'
    });

    expect(stages.create).toBe('/aca create 31.03.2026_20:10 31.03.2026_20:20 100 10 DONATE');
    expect(stages.ids).toContain('Test auction -> 27');
    expect(stages.items).toContain('/give @p 1 2 1');
    expect(stages.items).toContain('/aca addItem 27');
    expect(stages.settings).toContain('/aca setStartDate 27 31.03.2026_20:10');
    expect(stages.settings).toContain('/aca scheduleCreate 27 31.03.2026_20:10 31.03.2026_20:09 604800 600');
    expect(stages.all).not.toContain('chest');
  });

  test('does not generate item or setting commands without server ids', () => {
    const stages = buildAuctionCommandStages({
      auctions: [{ ...baseAuction, serverIds: {} }],
      curve: createDefaultAuctionCurve(),
      idMode: 'legacy',
      timezoneOffsetMinutes: 180,
      commandPlayer: '@p',
      graphStartLocal: '2026-03-01T00:00',
      workflowMode: 'install'
    });

    expect(stages.create).toContain('/aca create');
    expect(stages.ids).toContain('<впиши ID с сервера>');
    expect(stages.items).toContain('сначала впиши серверные ID');
    expect(stages.settings).toContain('сначала впиши серверные ID');
  });

  test('uses the graph multiplier on item prices for the auction date', () => {
    const curve = createDefaultAuctionCurve();
    curve.DONATE[30] = 1.25;
    const stages = buildAuctionCommandStages({
      auctions: [baseAuction],
      curve,
      idMode: 'legacy',
      timezoneOffsetMinutes: 180,
      commandPlayer: '@p',
      graphStartLocal: '2026-03-01T00:00',
      workflowMode: 'install'
    });

    expect(stages.create).toContain('125 13 DONATE');
    expect(stages.create).not.toContain('6375');
  });

  test('keeps repeated auction prices locked to the first graph day', () => {
    const curve = createDefaultAuctionCurve();
    curve.DONATE[30] = 1.25;
    curve.DONATE[40] = 1.5;
    curve.DONATE[50] = 0.5;

    const previews = buildAuctionRunPricePreviews({
      auctions: [{
        ...baseAuction,
        serverIds: { 0: '27', 1: '28', 2: '29' },
        repeatEnabled: true,
        repeatCount: 3,
        repeatEveryDays: 10
      }],
      curve,
      graphStartLocal: '2026-03-01T00:00'
    });

    expect(previews.map((preview) => preview.dayIndex)).toEqual([30, 40, 50]);
    expect(previews.map((preview) => preview.priceDayIndex)).toEqual([30, 30, 30]);
    expect(previews.map((preview) => preview.label)).toEqual(['Test auction #1', 'Test auction #2', 'Test auction #3']);
    expect(previews.map((preview) => preview.startPrice)).toEqual([125, 125, 125]);
    expect(previews.map((preview) => preview.stepPrice)).toEqual([13, 13, 13]);
  });

  test('strips file extensions from generated filenames', () => {
    expect(sanitizeAuctionFilename('auction_pack.txt')).toBe('auction_pack');
  });
});
