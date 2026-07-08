import { describe, expect, test } from 'vitest';
import { createDefaultAuctionCurve } from './auctionCommands';
import { createAuctionDayFolder } from './auctionDayFolders';
import { buildAuctionGraphPoints, moveAuctionGraphPointFolders } from './auctionGraphModel';

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

  test('moves only editable regular auctions by day while preserving time', () => {
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
    expect(moved[0].auctions[0].startLocal).toBe('2026-07-12T10:00');
    expect(moved[1].dateLocal).toBe('2026-07-09');
    expect(moved[1].auctions[0].startLocal).toBe('2026-07-09T10:00');
  });
});
