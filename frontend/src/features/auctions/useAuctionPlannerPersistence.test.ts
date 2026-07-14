import { describe, expect, test } from 'vitest';

import { createDefaultAuctionCurve } from './auctionCommands';
import { createDefaultAuctionCommandProfile } from './auctionCommandProfile';
import { normalizePlannerState } from './useAuctionPlannerPersistence';
import type { AuctionPlannerState } from './auctionTypes';

function createLocalState(): AuctionPlannerState {
  return {
    dayFolders: [
      {
        id: 'day-1',
        dateLocal: '2026-07-14',
        title: '14 июля',
        category: 'regular',
        tag: null,
        currency: 'DONATE',
        defaultDurationMinutes: 60,
        defaultStartPrice: 100,
        defaultStepPrice: 10,
        state: 'ACTIVE',
        timezoneOffsetMinutes: 180,
        priceMode: 'graph',
        graphMode: 'linear',
        planned: false,
        repeatEnabled: false,
        repeatEveryDays: 7,
        repeatCount: 1,
        scheduleLeadMinutes: 1,
        auctions: []
      }
    ],
    selectedDayFolderId: 'day-1',
    selectedAuctionId: '',
    workflowMode: 'install',
    uiMode: 'normal',
    commandStage: 'create',
    commandProfile: createDefaultAuctionCommandProfile(),
    curve: createDefaultAuctionCurve(),
    graphStartLocal: '2026-07-14T00:00'
  };
}

describe('auction planner persistence normalization', () => {
  test('keeps a saved command profile even when remote day folders are empty', () => {
    const nextState = normalizePlannerState({
      state: {
        dayFolders: [],
        commandProfile: {
          mode: 'custom',
          playerName: '@p',
          stateFilters: ['ACTIVE'],
          modeOrder: ['custom'],
          modes: {
            custom: {
              id: 'custom',
              title: 'Deploy safe',
              orderMode: 'grouped',
              entries: [
                { id: 'create', kind: 'template', command: 'create', label: 'Create', template: '/aca create {startDate}', scope: 'auction', enabled: false }
              ]
            }
          }
        }
      }
    }, createLocalState());

    expect(nextState?.dayFolders).toHaveLength(1);
    expect(nextState?.commandProfile?.mode).toBe('custom');
    expect(nextState?.commandProfile?.modes.custom.title).toBe('Deploy safe');
    expect(nextState?.commandProfile?.modes.custom.entries[0].enabled).toBe(false);
  });
});
