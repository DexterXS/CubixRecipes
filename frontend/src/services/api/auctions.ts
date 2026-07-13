import type { AuctionPlannerState } from '../../features/auctions/auctionTypes';
import { apiPath, request } from './client';

export type AuctionPlannerResponse = {
  schemaVersion: number;
  savedAt: number;
  state: AuctionPlannerState;
};

export async function getAuctionPlannerState(): Promise<AuctionPlannerResponse> {
  return request<AuctionPlannerResponse>(apiPath('/admin/auction-planner'));
}

export async function saveAuctionPlannerState(state: AuctionPlannerState): Promise<{ ok: boolean } & AuctionPlannerResponse> {
  return request<{ ok: boolean } & AuctionPlannerResponse>(apiPath('/admin/auction-planner'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state })
  });
}
