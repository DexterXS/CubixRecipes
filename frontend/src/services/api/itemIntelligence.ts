import { apiPath, request } from './client';

export type ItemIntelligenceSummary = {
  items_total: number; items_ready: number; items_needs_review: number;
  sources_total: number; evidence_total: number; mods_total: number; average_completion: number;
};

export type PassportField = [string, string, 'text' | 'textarea' | 'number' | 'list'];
export type PassportGroup = { key: string; label: string; fields: PassportField[] };

export type ItemIntelligenceRecord = {
  id: number; server_id: string; registry_key: string; meta: number; nbt_hash: string;
  raw?: string | null; mod_id?: string | null; display_ru?: string | null; display_en?: string | null;
  icon_url?: string | null; description?: string | null; category?: string | null; tier?: string | null;
  rarity?: string | null; status: string; completion_percent: number; confidence?: number | null;
  updated_at?: string | null; indexed_at?: string | null; passport?: Record<string, unknown>;
};

export type ItemIntelligenceBootstrapItem = {
  key: string; meta: number; legacy_id?: number | null; raw?: string | null;
  display_ru?: string | null; display_en?: string | null; icon_url?: string | null;
  ore_groups?: string[]; sources?: string[]; nbt_raw?: string | null;
};

export type PriceImportItem = {
  registry_data: string; metadata: number; nbt?: string | null; price: number; flags?: string[];
};
export type PriceImportHistory = {
  import_id: string; source_name: string; server_id: string; currency: string; status: string;
  total_rows: number; processed_rows: number; matched_rows: number; matched_items: number;
  restricted_rows: number; unmatched_rows: number; invalid_rows: number;
  normal_price_min?: number | null; normal_price_max?: number | null;
  created_at?: string | null; completed_at?: string | null;
};
export type PriceImportResult = {
  processed: number; matched_rows: number; matched_items: number; restricted_rows: number; unmatched_count: number;
  unmatched: Array<{ registryData: string; metadata: number; price: number }>;
  invalid: number; server_id: string; source_name: string; import_id: string; history?: PriceImportHistory;
};

export async function getItemIntelligenceSummary(): Promise<ItemIntelligenceSummary> {
  return request(apiPath('/item-intelligence/summary'));
}
export async function getItemIntelligenceSchema(): Promise<{ groups: PassportGroup[] }> {
  return request(apiPath('/item-intelligence/schema'));
}
export async function listItemIntelligence(): Promise<{ items: ItemIntelligenceRecord[] }> {
  return request(apiPath('/item-intelligence/items'));
}
export async function getItemIntelligenceItem(id: number): Promise<ItemIntelligenceRecord> {
  return request(apiPath(`/item-intelligence/items/${id}`));
}
export async function updateItemIntelligence(id: number, payload: Record<string, unknown>): Promise<ItemIntelligenceRecord> {
  return request(apiPath(`/item-intelligence/items/${id}`), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
}
export async function bootstrapItemIntelligence(items: ItemIntelligenceBootstrapItem[], serverId: string) {
  return request<{ processed: number; created: number; updated: number; evidence_created: number; server_id: string }>(apiPath('/item-intelligence/bootstrap-catalog'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, server_id: serverId })
  });
}
export async function importItemPrices(
  items: PriceImportItem[], sourceName: string, serverId = 'production', currency = 'server',
  options?: { importId?: string; totalRows?: number; finalize?: boolean }
) {
  return request<PriceImportResult>(apiPath('/item-intelligence/import-prices'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items, source_name: sourceName, server_id: serverId, currency,
      import_id: options?.importId, total_rows: options?.totalRows, finalize: options?.finalize ?? false
    })
  });
}
export async function getPriceImportHistory(limit = 10): Promise<{ imports: PriceImportHistory[] }> {
  return request(apiPath(`/item-intelligence/price-imports?limit=${encodeURIComponent(limit)}`));
}
