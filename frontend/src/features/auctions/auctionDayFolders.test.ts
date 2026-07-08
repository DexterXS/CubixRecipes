import { describe, expect, test } from 'vitest';

import { createDefaultAuctionCurve } from './auctionCommands';
import {
  applyDayDefaultsToAuctions,
  cloneAuctionDayFolder,
  createAuctionDayFolder,
  createAuctionDraft,
  getDayServerIdStatus,
  nextDayLocal,
  summarizeAuctionDayFolder
} from './auctionDayFolders';

describe('auction day folders', () => {
  test('creates a day folder around existing auction drafts without changing the draft shape', () => {
    const auction = createAuctionDraft(1, '2026-07-12T10:00');
    const folder = createAuctionDayFolder({
      id: 'day-12',
      dateLocal: '2026-07-12',
      timezoneOffsetMinutes: 180,
      auctions: [auction]
    });

    expect(folder.title).toBe('12 июля');
    expect(folder.auctions[0]).toMatchObject({
      id: '1',
      serverIds: {},
      startLocal: '2026-07-12T10:00'
    });
  });

  test('copies a day with auctions and items but clears server ids', () => {
    const folder = createAuctionDayFolder({
      id: 'day-12',
      dateLocal: '2026-07-12',
      auctions: [
        createAuctionDraft(1, '2026-07-12T12:30', {
          serverIds: { 0: '27' },
          items: [
            { uid: 'stone', raw: '<minecraft:stone:1>', title: 'Stone', legacyId: 1, meta: 1, hasNbt: false, quantity: 2, basePrice: 100 }
          ]
        })
      ]
    });

    const copy = cloneAuctionDayFolder(folder, { id: 'day-13', dateLocal: '2026-07-13' });

    expect(copy.id).toBe('day-13');
    expect(copy.title).toBe('13 июля');
    expect(copy.auctions[0].serverIds).toEqual({});
    expect(copy.auctions[0].startLocal).toBe('2026-07-13T12:30');
    expect(copy.auctions[0].items[0]).toMatchObject({ uid: 'stone', basePrice: 100 });
  });

  test('summarizes prices, nbt warnings, and missing server ids for a folder', () => {
    const curve = createDefaultAuctionCurve();
    curve.DONATE[0] = 1.5;
    const folder = createAuctionDayFolder({
      id: 'day-12',
      dateLocal: '2026-07-12',
      auctions: [
        createAuctionDraft(1, '2026-07-12T10:00', {
          items: [
            { uid: 'stone', raw: '<minecraft:stone:1>', title: 'Stone', legacyId: 1, meta: 1, hasNbt: false, quantity: 2, basePrice: 100 },
            { uid: 'chest', raw: '<minecraft:chest>.withTag({tag:1})', title: 'NBT Chest', legacyId: 54, meta: 0, hasNbt: true, quantity: 1, basePrice: 5000 }
          ]
        })
      ]
    });

    const summary = summarizeAuctionDayFolder({ folder, curve, graphStartLocal: '2026-07-12T00:00' });

    expect(summary).toMatchObject({
      auctionCount: 1,
      itemCount: 2,
      nonNbtItemCount: 1,
      nbtItemCount: 1,
      missingServerIdCount: 1,
      hasMissingServerIds: true,
      hasNbtWarnings: true,
      minStartPrice: 150,
      maxStartPrice: 150
    });
  });

  test('reports server id lifecycle states', () => {
    const waiting = createAuctionDayFolder({
      id: 'day-12',
      dateLocal: '2026-07-12',
      auctions: [createAuctionDraft(1, '2026-07-12T10:00')]
    });
    const complete = createAuctionDayFolder({
      id: 'day-13',
      dateLocal: '2026-07-13',
      auctions: [createAuctionDraft(1, '2026-07-13T10:00', { serverIds: { 0: '31' } })]
    });

    expect(getDayServerIdStatus(waiting, 'create')).toBe('not-needed-yet');
    expect(getDayServerIdStatus(waiting, 'ids')).toBe('waiting');
    expect(getDayServerIdStatus(complete, 'items')).toBe('complete');
  });

  test('applies day defaults to every auction in the folder', () => {
    const folder = createAuctionDayFolder({
      id: 'day-12',
      dateLocal: '2026-07-12',
      auctions: [createAuctionDraft(1, '2026-07-12T10:00')]
    });

    const updated = applyDayDefaultsToAuctions({
      ...folder,
      currency: 'BONUS',
      defaultDurationMinutes: 60,
      defaultStepPrice: 25,
      repeatEnabled: true,
      repeatCount: 3
    });

    expect(updated.auctions[0]).toMatchObject({
      currency: 'BONUS',
      durationMinutes: 60,
      baseStepPrice: 25,
      repeatEnabled: true,
      repeatCount: 3
    });
  });

  test('calculates the next local day without relying on the browser timezone', () => {
    expect(nextDayLocal('2026-07-12')).toBe('2026-07-13');
  });
});
