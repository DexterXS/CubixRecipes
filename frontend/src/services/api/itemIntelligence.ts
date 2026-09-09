import { apiPath, request } from './client';

export type ItemIntelligenceSummary = {
  items_total: number;
  items_ready: number;
  items_needs_review: number;
  sources_total: number;
  evidence_total: number;
  mods_total: number;
  average_completion: number;
};

export type ItemIntelligenceRecord = {
  id: number;
  server_id: string;
  registry_key: string;
  meta: number;
  nbt_hash: string;
  raw?: string | null;
  mod_id?: string | null;
  display_ru?: string | null;
  display_en?: string | null;
  icon_url?: string | null;
  description?: string | null;
  category?: string | null;
  tier?: string | null;
  rarity?: string | null;
  status: string;
  completion_percent: number;
  confidence?: number | null;
  updated_at?: string | null;
  indexed_at?: string | null;
};

export type ItemIntelligenceBootstrapItem = {
  key: string;
  meta: number;
  legacy_id?: number | null;
  raw?: string | null;
  display_ru?: string | null;
  display_en?: string | null;
  icon_url?: string | null;
  ore_groups?: string[];
  sources?: string[];
  nbt_raw?: string | null;
};

export async function getItemIntelligenceSummary(): Promise<ItemIntelligenceSummary> {
  return request<ItemIntelligenceSummary>(apiPath('/item-intelligence/summary'));
}

export async function listItemIntelligence(): Promise<{ items: ItemIntelligenceRecord[] }> {
  return request<{ items: ItemIntelligenceRecord[] }>(apiPath('/item-intelligence/items'));
}

export async function bootstrapItemIntelligence(
  items: ItemIntelligenceBootstrapItem[],
  serverId: string
): Promise<{ processed: number; created: number; updated: number; evidence_created: number; server_id: string }> {
  return request(apiPath('/item-intelligence/bootstrap-catalog'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, server_id: serverId })
  });
}
