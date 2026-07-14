import { describe, expect, test } from 'vitest';

import { createAuctionDayFolder, createAuctionDraft } from './auctionDayFolders';
import {
  addAuctionLotRecordToFolder,
  buildAuctionLotLibraryEntries,
  createDetachedAuctionLotRecord,
  mergeAuctionLotLibrary,
  removeAuctionLotLibraryRecord
} from './auctionLotLibrary';

describe('auction lot library', () => {
  test('deduplicates identical lots across folders and keeps detached records', () => {
    const auction = createAuctionDraft(1, '2026-07-14T09:00', { name: 'Quantum generator' });
    const folders = [
      createAuctionDayFolder({ id: 'day-1', dateLocal: '2026-07-14', auctions: [auction] }),
      createAuctionDayFolder({ id: 'day-2', dateLocal: '2026-07-15', auctions: [{ ...auction, id: 'copy', startLocal: '2026-07-15T09:00' }] })
    ];
    const detached = createDetachedAuctionLotRecord(1);

    const library = mergeAuctionLotLibrary([detached], folders);
    const entries = buildAuctionLotLibraryEntries(library, folders);

    expect(library).toHaveLength(2);
    expect(entries.find((entry) => entry.record.id === detached.id)?.refs).toEqual([]);
    expect(entries.find((entry) => entry.record.auction.name === 'Quantum generator')?.refs).toHaveLength(2);
  });

  test('adds a detached lot to a target folder without removing it from the database', () => {
    const folder = createAuctionDayFolder({ id: 'day-1', dateLocal: '2026-07-14', auctions: [] });
    const record = createDetachedAuctionLotRecord(1);
    const result = addAuctionLotRecordToFolder([folder], [record], record.id, folder.id);

    expect(result.folders[0].auctions).toHaveLength(1);
    expect(result.folders[0].auctions[0].name).toBe(record.auction.name);
    expect(result.folders[0].auctions[0].startLocal.startsWith('2026-07-14T')).toBe(true);
    expect(record.auction.name).toBeTruthy();
  });

  test('updates an existing folder lot record by auction id instead of duplicating on description edits', () => {
    const auction = createAuctionDraft(1, '2026-07-14T09:00', {
      id: 'auction-1',
      name: 'Sword',
      description: 'first'
    });
    const folder = createAuctionDayFolder({ id: 'day-1', dateLocal: '2026-07-14', auctions: [auction] });
    const library = mergeAuctionLotLibrary([], [folder]);
    const updatedFolder = {
      ...folder,
      auctions: [{ ...auction, description: 'first plus one typed letter' }]
    };

    const updatedLibrary = mergeAuctionLotLibrary(library, [updatedFolder]);

    expect(updatedLibrary).toHaveLength(1);
    expect(updatedLibrary[0].auction.description).toBe('first plus one typed letter');
  });

  test('removes a selected lot record from the database list', () => {
    const first = createDetachedAuctionLotRecord(1);
    const second = createDetachedAuctionLotRecord(2);

    expect(removeAuctionLotLibraryRecord([first, second], first.id)).toEqual([second]);
  });
});
