import { describe, expect, test } from 'vitest';
import { createDefaultAuctionCurve } from './auctionCommands';
import { createAuctionDayFolder } from './auctionDayFolders';
import { buildAuctionGraphPoints, duplicateAuctionGraphFolder, moveAuctionGraphFolder, moveAuctionGraphPointFolders } from './auctionGraphModel';

describe('auction graph model', () => {
  test('shows regular folders as editable points and planned folders as static points', () => {
    const curve = createDefaultAuctionCurve();
    curve.DONATE[1] = 1.2;
    const regular = createAuctionDayFolder({ id: 'day-1', dateLocal: '2026-07-09' });
    const planned = createAuctionDayFolder({ id: 'day-2', dateLocal: '2026-07-10', category: 'planned' });

    const points = buildAuctionGraphPoints({
      folders: [regular, planned],
      curve,
      graphStartLocal: '2026-07-08T00:00',
      currency: 'DONATE'
    });

    expect(points.map((point) => [point.day, point.editable, point.value])).toEqual([
      [1, true, 1.2],
      [2, false, 1]
    ]);
  });

  test('carries a folder tag into graph points', () => {
    const curve = createDefaultAuctionCurve();
    const folder = { ...createAuctionDayFolder({ id: 'day-1', dateLocal: '2026-07-09' }), tag: 'green' as const };

    const points = buildAuctionGraphPoints({
      folders: [folder],
      curve,
      graphStartLocal: '2026-07-08T00:00',
      currency: 'DONATE'
    });

    expect(points[0].tag).toBe('green');
    expect(points[0].auctions[0].folderTag).toBe('green');
  });

  test('moves editable regular folders by day while preserving auction times', () => {
    const regular = createAuctionDayFolder({ id: 'day-1', dateLocal: '2026-07-09' });
    const planned = createAuctionDayFolder({ id: 'day-2', dateLocal: '2026-07-09', category: 'planned' });

    const moved = moveAuctionGraphPointFolders({
      folders: [regular, planned],
      currency: 'DONATE',
      sourceDay: 1,
      targetDay: 4,
      graphStartLocal: '2026-07-08T00:00'
    });

    expect(moved[0].dateLocal).toBe('2026-07-12');
    expect(moved[0].title).toBe('12 июля');
    expect(moved[0].auctions[0].startLocal).toBe('2026-07-12T10:00');
    expect(moved[1].dateLocal).toBe('2026-07-09');
    expect(moved[1].auctions[0].startLocal).toBe('2026-07-09T10:00');
  });

  test('moves a whole folder out of a merged point and renames it to the graph day', () => {
    const folder = createAuctionDayFolder({
      id: 'day-1',
      dateLocal: '2026-07-09',
      title: '9 июля',
      auctions: [
        { ...createAuctionDayFolder({ id: 'a', dateLocal: '2026-07-09' }).auctions[0], id: '1' },
        { ...createAuctionDayFolder({ id: 'b', dateLocal: '2026-07-09' }).auctions[0], id: '2' }
      ]
    });

    const moved = moveAuctionGraphFolder({
      folders: [folder],
      folderId: 'day-1',
      targetDay: 4,
      graphStartLocal: '2026-07-08T00:00'
    });

    expect(moved[0].dateLocal).toBe('2026-07-12');
    expect(moved[0].title).toBe('12 июля');
    expect(moved[0].auctions[0].startLocal).toBe('2026-07-12T10:00');
    expect(moved[0].auctions[1].startLocal).toBe('2026-07-12T10:00');
  });

  test('duplicates one auction into a new day folder from the graph menu', () => {
    const folder = createAuctionDayFolder({
      id: 'day-1',
      dateLocal: '2026-07-09',
      auctions: [
        { ...createAuctionDayFolder({ id: 'a', dateLocal: '2026-07-09' }).auctions[0], id: '1', serverIds: { 0: '101' } },
        { ...createAuctionDayFolder({ id: 'b', dateLocal: '2026-07-09' }).auctions[0], id: '2' }
      ]
    });

    const result = duplicateAuctionGraphFolder({ folders: [folder], folderId: 'day-1', auctionId: '1' });

    expect(result.folderId).toBe('day-2');
    expect(result.auctionId).toBe('day-2-auction-1');
    expect(result.folders[1].auctions).toHaveLength(1);
    expect(result.folders[1].dateLocal).toBe('2026-07-10');
    expect(result.folders[1].auctions[0].serverIds).toEqual({});
  });
});
