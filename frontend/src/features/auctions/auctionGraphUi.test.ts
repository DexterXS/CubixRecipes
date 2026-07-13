import { describe, expect, test } from 'vitest';
import { groupPointAuctionsByFolder } from './AuctionGraphPanel';
import { buildAuctionGraphsWorkspaceSummary } from './AuctionGraphsWorkspace';
import {
  calculateAuctionGraphDragValue,
  countAuctionGraphPointFolders,
  createAuctionGraphGrabOffset,
  type AuctionPriceGraphPointDetail
} from './AuctionPriceGraph';
import { createAuctionDayFolder, summarizeAuctionDayFolder } from './auctionDayFolders';
import type { AuctionGraphPointAuction } from './auctionGraphModel';

function detail(folderId: string): AuctionPriceGraphPointDetail {
  return {
    folderId,
    label: 'Auction',
    folderTitle: '9 июля',
    folderCategory: 'regular',
    folderTagLabel: null,
    folderTagColor: null,
    startPrice: 100,
    stepPrice: 10,
    multiplier: 1
  };
}

function auction(overrides: Partial<AuctionGraphPointAuction>): AuctionGraphPointAuction {
  return {
    folderId: 'day-1',
    folderTitle: '9 июля',
    folderCategory: 'regular',
    folderTag: null,
    auctionId: 'auction-1',
    auctionName: 'Auction 1',
    label: 'Auction 1',
    startLocal: '2026-07-09T10:00',
    startPrice: 100,
    stepPrice: 10,
    multiplier: 1,
    ...overrides
  };
}

describe('auction graph UI helpers', () => {
  test('counts unique folders for graph point labels instead of auctions', () => {
    expect(countAuctionGraphPointFolders({
      details: [
        detail('day-1'),
        detail('day-1'),
        detail('day-2')
      ]
    })).toBe(2);
  });

  test('groups point context-menu auctions by folder', () => {
    const groups = groupPointAuctionsByFolder([
      auction({ folderId: 'day-1', auctionId: 'auction-1' }),
      auction({ folderId: 'day-1', auctionId: 'auction-2' }),
      auction({ folderId: 'day-2', folderTitle: '10 июля', auctionId: 'auction-3' })
    ]);

    expect(groups.map((group) => [group.folderId, group.auctions.map((item) => item.auctionId)])).toEqual([
      ['day-1', ['auction-1', 'auction-2']],
      ['day-2', ['auction-3']]
    ]);
  });

  test('keeps graph percentage stable when the pointer starts away from point center', () => {
    const pointerY = 120;
    const initialValue = 1.8;
    const grabOffsetY = createAuctionGraphGrabOffset(pointerY, initialValue);

    expect(calculateAuctionGraphDragValue(pointerY, grabOffsetY)).toBe(initialValue);
    expect(calculateAuctionGraphDragValue(pointerY + 20, grabOffsetY)).toBeLessThan(initialValue);
    expect(calculateAuctionGraphDragValue(pointerY - 20, grabOffsetY)).toBeGreaterThan(initialValue);
  });

  test('summarizes the dedicated graph workspace across regular and planned folders', () => {
    const regular = createAuctionDayFolder({ id: 'day-1', dateLocal: '2026-07-09' });
    const planned = createAuctionDayFolder({ id: 'day-2', dateLocal: '2026-07-10', category: 'planned' });
    const folders = [regular, planned];
    const summaries = Object.fromEntries(folders.map((folder) => [folder.id, summarizeAuctionDayFolder({ folder })]));

    expect(buildAuctionGraphsWorkspaceSummary(folders, summaries)).toMatchObject({
      folderCount: 2,
      regularCount: 1,
      plannedCount: 1,
      auctionCount: 2
    });
  });
});
