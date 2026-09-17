import { ItemCatalogResponse, ItemPanelAtlas, ItemPanelStaticPublication } from '../../types';
import { apiPath, buildRequestHeaders, readErrorMessage, request } from './client';

let baseAtlasPromise: Promise<ItemPanelAtlas> | null = null;
let baseAtlasServerId: string | null = null;

function getActiveServerId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('active_server_id');
}

export async function getStaticItemPanelAtlas(): Promise<ItemPanelAtlas> {
  try {
    const serverResponse = await fetch(apiPath('/itempanel/static/atlas.json'), {
      credentials: 'include',
      cache: 'no-store',
      headers: buildRequestHeaders()
    });
    if (serverResponse.ok) {
      return await serverResponse.json() as ItemPanelAtlas;
    }
  } catch {
    // Fall back to the bundled snapshot when the backend is unavailable.
  }
  const response = await fetch('/itempanel-atlas.json');
  if (response.ok) {
    return await response.json() as ItemPanelAtlas;
  }
  throw new Error(`Failed to load static itempanel atlas: HTTP ${response.status}`);
}

async function loadBaseItemPanelAtlas(): Promise<ItemPanelAtlas> {
  try {
    const backendAtlas = await request<ItemPanelAtlas>(apiPath('/itempanel/atlas'));
    if (Object.keys(backendAtlas.entries ?? {}).length > 0) {
      return backendAtlas;
    }
  } catch {
    // Fall back to the generated static atlas for offline/dev snapshots.
  }
  try {
    return await getStaticItemPanelAtlas();
  } catch {
    return {
      image_url: '/itempanel-atlas.png',
      tile_size: 32,
      columns: 0,
      rows: 0,
      entries: {}
    };
  }
}

export async function getItemPanelAtlas(): Promise<ItemPanelAtlas> {
  const activeServerId = getActiveServerId();
  if (!baseAtlasPromise || baseAtlasServerId !== activeServerId) {
    baseAtlasServerId = activeServerId;
    baseAtlasPromise = loadBaseItemPanelAtlas();
  }
  return baseAtlasPromise;
}

export async function getItemCatalog(): Promise<ItemCatalogResponse> {
  return request<ItemCatalogResponse>(apiPath('/itempanel/catalog'));
}

export async function getStaticItemPanelCatalog(): Promise<ItemCatalogResponse> {
  const response = await fetch(apiPath('/itempanel/static/catalog.json'), {
    credentials: 'include',
    cache: 'no-store',
    headers: buildRequestHeaders()
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return await response.json() as ItemCatalogResponse;
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

export async function generateItemPanelAtlas(): Promise<ItemPanelAtlas> {
  const payload = await request<{ ok: boolean; atlas: ItemPanelAtlas }>(apiPath('/admin/itempanel/atlas/generate'), { method: 'POST' });
  baseAtlasServerId = getActiveServerId();
  baseAtlasPromise = Promise.resolve(payload.atlas);
  return payload.atlas;
}

export async function refreshItemPanelStaticAssets(): Promise<{ ok: boolean; atlas: ItemPanelAtlas; static: ItemPanelStaticPublication }> {
  const payload = await request<{ ok: boolean; atlas: ItemPanelAtlas; static: ItemPanelStaticPublication }>(apiPath('/admin/itempanel/static/refresh'), { method: 'POST' });
  baseAtlasServerId = getActiveServerId();
  baseAtlasPromise = Promise.resolve(payload.atlas);
  return payload;
}

export async function mergeItemPanelFiles(): Promise<{ ok: boolean; path: string; summary: Record<string, unknown> }> {
  return request<{ ok: boolean; path: string; summary: Record<string, unknown> }>(apiPath('/admin/itempanel/merge'), { method: 'POST' });
}

export function getItemPanelMergedCsvUrl(): string {
  return apiPath('/admin/itempanel/merged');
}
