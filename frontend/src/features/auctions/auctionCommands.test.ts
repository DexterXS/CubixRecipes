import { describe, expect, test } from 'vitest';

import { buildAuctionCommandStages, buildAuctionRunPricePreviews, createDefaultAuctionCurve, dayIndexFromStart, formatAuctionUtcDate, sanitizeAuctionFilename } from './auctionCommands';
import {
  buildAuctionCommandsFromProfile,
  createDefaultAuctionCommandProfile,
  getAuctionCommandModeEntries,
  normalizeAuctionCommandProfile
} from './auctionCommandProfile';
import type { AuctionCommandProfile, AuctionDraft } from './auctionTypes';

const baseAuction: AuctionDraft = {
  id: 'local-1',
  serverIds: { 0: '27' },
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
  addItemsToAuction: true,
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
    expect(stages.items).toContain('/aca addItem 27');
    expect(stages.items).not.toContain('/give');
    expect(stages.items).not.toContain('/clear');
    expect(stages.settings).toContain('/aca setStartDate 27 31.03.2026_20:10');
    expect(stages.settings).toContain('/aca setState 27 ACTIVE');
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
    expect(stages.items).toBe('');
    expect(stages.settings).toBe('');
  });

  test('uses the graph multiplier on the lot start price for the auction date', () => {
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

  test('uses calendar days for graph indexes instead of graph start clock time', () => {
    expect(dayIndexFromStart('2026-07-12T10:00', '2026-07-08T13:46')).toBe(4);
  });

  test('does not treat item prices as the lot price', () => {
    const stages = buildAuctionCommandStages({
      auctions: [{
        ...baseAuction,
        baseStartPrice: 240,
        items: baseAuction.items.map((item) => ({ ...item, basePrice: 9999 }))
      }],
      curve: createDefaultAuctionCurve(),
      idMode: 'legacy',
      timezoneOffsetMinutes: 180,
      commandPlayer: '@p',
      graphStartLocal: '2026-03-01T00:00',
      workflowMode: 'install'
    });

    expect(stages.create).toContain('240 10 DONATE');
    expect(stages.create).not.toContain('9999');
  });

  test('skips addItem commands for lots that already have their items', () => {
    const stages = buildAuctionCommandStages({
      auctions: [{ ...baseAuction, addItemsToAuction: false }],
      curve: createDefaultAuctionCurve(),
      idMode: 'legacy',
      timezoneOffsetMinutes: 180,
      commandPlayer: '@p',
      graphStartLocal: '2026-03-01T00:00',
      workflowMode: 'existing'
    });

    expect(stages.items).not.toContain('/aca addItem 27');
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

  test('drops removed command templates and allows an empty mode list', () => {
    const defaults = createDefaultAuctionCommandProfile();
    const serializedDefaults = JSON.stringify(defaults);

    expect(serializedDefaults).not.toContain('clearPlayer');
    expect(serializedDefaults).not.toContain('idList');
    expect(serializedDefaults).not.toContain('giveItem');

    const emptyProfile = normalizeAuctionCommandProfile({
      mode: '',
      playerName: '@p',
      stateFilters: ['ACTIVE'],
      modeOrder: [],
      modes: {}
    });

    expect(emptyProfile.mode).toBe('');
    expect(emptyProfile.modeOrder).toEqual([]);
    expect(emptyProfile.modes).toEqual({});
    expect(getAuctionCommandModeEntries(emptyProfile)).toEqual([]);
  });

  test('keeps command checkbox states when a saved profile is normalized', () => {
    const profile = normalizeAuctionCommandProfile({
      mode: 'install',
      playerName: '@p',
      stateFilters: ['ACTIVE'],
      modeOrder: ['install'],
      modes: {
        install: {
          entries: [
            { id: 'create', kind: 'template', command: 'create', label: 'Create', template: '/aca create {startDate}', scope: 'auction', enabled: false },
            { id: 'addItem', kind: 'template', command: 'addItem', label: 'Add', template: '/aca addItem {serverId}', scope: 'item', enabled: 'false' },
            { id: 'setName', kind: 'template', command: 'setName', label: 'Name', template: '/aca setName {serverId} {auctionName}', scope: 'auction' }
          ]
        }
      }
    });

    const entriesByCommand = Object.fromEntries(
      getAuctionCommandModeEntries(profile)
        .filter((entry) => entry.kind === 'template')
        .map((entry) => [entry.command, entry])
    );

    expect(entriesByCommand.create.enabled).toBe(false);
    expect(entriesByCommand.addItem.enabled).toBe(false);
    expect(entriesByCommand.setName.enabled).toBe(false);
  });

  test('builds command output from editable templates, selected statuses, and saved order', () => {
    const profile: AuctionCommandProfile = normalizeAuctionCommandProfile({
      mode: 'install',
      playerName: 'DexterXS',
      stateFilters: ['ACTIVE'],
      modes: {
        install: {
          entries: [
            { id: 'custom-start', kind: 'custom', label: 'Старт', template: '/say {player}', scope: 'file', enabled: true },
            { id: 'create', kind: 'template', command: 'create', label: 'Создать', template: '/aca create {startDate} {endDate} {startPrice} {stepPrice} {currency}', scope: 'auction', enabled: true },
            { id: 'custom-give', kind: 'custom', label: 'Выдать', template: '/give {player} {itemId} {quantity} {meta}', scope: 'item', enabled: true },
            { id: 'setState', kind: 'template', command: 'setState', label: 'Статус', template: '/aca setState {serverId} {state}', scope: 'auction', enabled: true }
          ]
        },
        existing: { entries: [] }
      }
    });

    const output = buildAuctionCommandsFromProfile({
      auctions: [
        baseAuction,
        { ...baseAuction, id: 'paused', name: 'Paused auction', state: 'PAUSED', serverIds: { 0: '55' } }
      ],
      curve: createDefaultAuctionCurve(),
      idMode: 'legacy',
      timezoneOffsetMinutes: 180,
      graphStartLocal: '2026-03-01T00:00',
      profile
    });
    const lines = output.split('\n');

    expect(lines[0]).toBe('/say DexterXS');
    expect(lines.filter((line) => line.startsWith('/aca create'))).toHaveLength(1);
    expect(output).toContain('/give DexterXS 1 2 1');
    expect(output).toContain('/aca setState 27 ACTIVE');
    expect(output).not.toContain('Paused auction');
    expect(output).not.toContain('сначала');
  });

  test('can generate selected commands as a cycle per lot', () => {
    const profile: AuctionCommandProfile = normalizeAuctionCommandProfile({
      mode: 'cycle',
      playerName: '@p',
      stateFilters: ['ACTIVE'],
      modeOrder: ['cycle'],
      modes: {
        cycle: {
          id: 'cycle',
          title: 'Cycle',
          orderMode: 'perLot',
          entries: [
            { id: 'custom-give', kind: 'custom', label: 'Give', template: '/give {player} {itemId} {quantity} {meta}', scope: 'item', enabled: true },
            { id: 'addItem', kind: 'template', command: 'addItem', label: 'Add', template: '/aca addItem {serverId}', scope: 'item', enabled: true },
            { id: 'setName', kind: 'template', command: 'setName', label: 'Name', template: '/aca setName {serverId} {auctionName}', scope: 'auction', enabled: true }
          ]
        }
      }
    });

    const output = buildAuctionCommandsFromProfile({
      auctions: [
        baseAuction,
        { ...baseAuction, id: 'local-2', name: 'Second auction', serverIds: { 0: '28' } }
      ],
      curve: createDefaultAuctionCurve(),
      idMode: 'legacy',
      timezoneOffsetMinutes: 180,
      graphStartLocal: '2026-03-01T00:00',
      profile
    });

    expect(output.split('\n')).toEqual([
      '/give @p 1 2 1',
      '/aca addItem 27',
      '/aca setName 27 Test auction',
      '/give @p 1 2 1',
      '/aca addItem 28',
      '/aca setName 28 Second auction'
    ]);
  });

  test('profile command output respects the per-lot add item flag', () => {
    const profile: AuctionCommandProfile = normalizeAuctionCommandProfile({
      mode: 'existing',
      playerName: '@p',
      stateFilters: ['ACTIVE'],
      modeOrder: ['existing'],
      modes: {
        existing: {
          id: 'existing',
          title: 'Existing',
          orderMode: 'grouped',
          entries: [
            { id: 'addItem', kind: 'template', command: 'addItem', label: 'Add', template: '/aca addItem {serverId}', scope: 'item', enabled: true }
          ]
        }
      }
    });

    const output = buildAuctionCommandsFromProfile({
      auctions: [
        { ...baseAuction, id: 'ready', serverIds: { 0: '27' }, addItemsToAuction: false },
        { ...baseAuction, id: 'needs-item', serverIds: { 0: '28' }, addItemsToAuction: true }
      ],
      curve: createDefaultAuctionCurve(),
      idMode: 'legacy',
      timezoneOffsetMinutes: 180,
      graphStartLocal: '2026-03-01T00:00',
      profile
    });

    expect(output).not.toContain('/aca addItem 27');
    expect(output).toContain('/aca addItem 28');
  });
});
