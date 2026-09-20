import { ItemCatalogResponse, ItemPanelAtlas } from '../../types';
import { apiPath, buildRequestHeaders, readErrorMessage, request } from './client';

const baseAtlasPromises = new Map<string, Promise<ItemPanelAtlas>>();

async function loadBaseItemPanelAtlas(serverId?: string): Promise<ItemPanelAtlas> {
  try {
    const backendAtlas = await request<ItemPanelAtlas>(apiPath('/itempanel/atlas'), {
      cache: 'no-store',
      headers: serverId ? { 'X-Server-Id': serverId } : undefined
    });
    if (Object.keys(backendAtlas.entries ?? {}).length > 0) {
      return backendAtlas;
    }
  } catch {
    // Fall back to the bundled static atlas for offline/dev snapshots.
  }
  const response = await fetch('/itempanel-atlas.json');
  if (response.ok) {
    return await response.json() as ItemPanelAtlas;
  }
  return {
    image_url: '/itempanel-atlas.png',
    tile_size: 32,
    columns: 0,
    rows: 0,
    entries: {}
  };
}

export async function getItemPanelAtlas(serverId?: string): Promise<ItemPanelAtlas> {
  const cacheKey = serverId || 'default';
  const existing = baseAtlasPromises.get(cacheKey);
  if (existing) return existing;
  const promise = loadBaseItemPanelAtlas(serverId);
  baseAtlasPromises.set(cacheKey, promise);
  return promise;
}

export async function getItemCatalog(serverId?: string): Promise<ItemCatalogResponse> {
  return request<ItemCatalogResponse>(apiPath('/itempanel/catalog'), {
    headers: serverId ? { 'X-Server-Id': serverId } : undefined
  });
}

export async function getItemCatalogVersion(serverId?: string): Promise<{ fingerprint: string }> {
  return request<{ fingerprint: string }>(apiPath('/itempanel/catalog/version'), {
    headers: serverId ? { 'X-Server-Id': serverId } : undefined
  });
}

async function uploadRawItemPanelFile(file: File, endpoint: string, contentType: string): Promise<Response> {
  const path = apiPath(`${endpoint}?filename=${encodeURIComponent(file.name)}`);
  const headers = buildRequestHeaders({ 'Content-Type': contentType });
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: file
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response;
}

export async function uploadItemPanelJson(file: File): Promise<{ ok: boolean; path: string; summary: Record<string, unknown> }> {
  const response = await uploadRawItemPanelFile(file, '/admin/itempanel/json', 'application/json');
  return await response.json() as { ok: boolean; path: string; summary: Record<string, unknown> };
}

export async function uploadItemPanelCsv(file: File): Promise<{ ok: boolean; path: string; scan: Record<string, unknown>; atlas: ItemPanelAtlas }> {
  const response = await uploadRawItemPanelFile(file, '/admin/itempanel/csv', 'text/csv');
  return await response.json() as { ok: boolean; path: string; scan: Record<string, unknown>; atlas: ItemPanelAtlas };
}

export async function mergeItemPanelFiles(): Promise<{ ok: boolean; path: string; summary: Record<string, unknown> }> {
  return request<{ ok: boolean; path: string; summary: Record<string, unknown> }>(apiPath('/admin/itempanel/merge'), { method: 'POST' });
}

export function getItemPanelMergedCsvUrl(): string {
  return apiPath('/admin/itempanel/merged');
}
