import { ItemCatalogResponse, ItemPanelAtlas, ItemPanelAtlasEntry, ModIconAtlasEntry } from '../../types';
import { apiPath, buildRequestHeaders, readErrorMessage, request } from './client';
import { getModIconAtlasManifest } from './modIcons';

let mergedAtlasPromise: Promise<ItemPanelAtlas> | null = null;
let mergedAtlasObjectUrl: string | null = null;

function normalizeIconName(value: string): string {
  return (value || '')
    .replace(/§./g, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '');
}

function entryModId(entry: ItemPanelAtlasEntry): string {
  return (entry.item_key.split(':', 1)[0] || '').toLowerCase();
}

function generatedCandidates(entry: ItemPanelAtlasEntry): string[] {
  const itemPath = entry.item_key.includes(':') ? entry.item_key.slice(entry.item_key.indexOf(':') + 1) : entry.item_key;
  const basename = itemPath.split('/').pop() || itemPath;
  return [entry.display_name, itemPath, basename]
    .map(normalizeIconName)
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
}

function catalogCandidates(entry: ItemCatalogResponse['entries'][number]): string[] {
  const itemPath = entry.key.includes(':') ? entry.key.slice(entry.key.indexOf(':') + 1) : entry.key;
  const basename = itemPath.split('/').pop() || itemPath;
  return [entry.display_ru, entry.display_en, itemPath, basename]
    .map(normalizeIconName)
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
}

function findGeneratedEntry(entry: ItemPanelAtlasEntry, generatedByMod: Map<string, Map<string, ModIconAtlasEntry>>): ModIconAtlasEntry | undefined {
  const modEntries = generatedByMod.get(entryModId(entry));
  if (!modEntries) return undefined;
  for (const candidate of generatedCandidates(entry)) {
    const exact = modEntries.get(candidate);
    if (exact) return exact;
  }
  return undefined;
}

function findGeneratedCatalogEntry(entry: ItemCatalogResponse['entries'][number], generatedByMod: Map<string, Map<string, ModIconAtlasEntry>>): ModIconAtlasEntry | undefined {
  const modid = (entry.key.split(':', 1)[0] || '').toLowerCase();
  const modEntries = generatedByMod.get(modid);
  if (!modEntries) return undefined;
  for (const candidate of catalogCandidates(entry)) {
    const exact = modEntries.get(candidate);
    if (exact) return exact;
  }
  return undefined;
}

function backendAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/api/')) return apiPath(url.slice(4));
  return url;
}

async function fetchImage(url: string): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  const resolvedUrl = backendAssetUrl(url);
  const response = await fetch(resolvedUrl, {
    credentials: 'include',
    headers: buildRequestHeaders()
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${resolvedUrl}`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const image = new Image();
  image.src = objectUrl;
  await image.decode();
  return { image, objectUrl };
}

async function mergeGeneratedModIcons(baseAtlas: ItemPanelAtlas): Promise<ItemPanelAtlas> {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || !baseAtlas.image_url) return baseAtlas;

  let manifest;
  let catalog: ItemCatalogResponse | null = null;
  try {
    [manifest, catalog] = await Promise.all([
      getModIconAtlasManifest(),
      getItemCatalog().catch(() => null)
    ]);
  } catch {
    return baseAtlas;
  }
  const generatedEntries = Object.values(manifest?.entries?.x32 ?? {});
  if (!manifest || generatedEntries.length === 0) return baseAtlas;

  const generatedByMod = new Map<string, Map<string, ModIconAtlasEntry>>();
  generatedEntries.forEach((entry) => {
    const modid = (entry.modid || '').toLowerCase();
    if (!modid) return;
    const byName = generatedByMod.get(modid) ?? new Map<string, ModIconAtlasEntry>();
    const names = [entry.iconName ?? '', entry.key?.split('/').slice(1).join('/') ?? ''];
    names.forEach((name) => {
      const normalized = normalizeIconName(name);
      if (normalized && !byName.has(normalized)) byName.set(normalized, entry);
    });
    generatedByMod.set(modid, byName);
  });

  const replacements = Object.values(baseAtlas.entries ?? {})
    .map((entry) => ({ base: entry, generated: findGeneratedEntry(entry, generatedByMod) }))
    .filter((pair): pair is { base: ItemPanelAtlasEntry; generated: ModIconAtlasEntry } => Boolean(pair.generated));

  const nextEntries: Record<string, ItemPanelAtlasEntry> = { ...(baseAtlas.entries ?? {}) };
  const baseEntryKeys = new Set<string>();
  Object.values(nextEntries).forEach((entry) => baseEntryKeys.add(`${entry.item_key.toLowerCase()}:${entry.meta ?? 0}`));

  const additions = (catalog?.entries ?? [])
    .map((item) => ({ item, generated: findGeneratedCatalogEntry(item, generatedByMod) }))
    .filter((pair): pair is { item: ItemCatalogResponse['entries'][number]; generated: ModIconAtlasEntry } => {
      if (!pair.generated) return false;
      return !baseEntryKeys.has(`${pair.item.key.toLowerCase()}:${pair.item.meta ?? 0}`);
    });

  if (replacements.length === 0 && additions.length === 0) return baseAtlas;

  const columns = baseAtlas.columns;
  const tileSize = baseAtlas.tile_size;
  const baseRows = baseAtlas.rows;
  const width = columns * tileSize;
  if (!width || !baseRows || !tileSize) return baseAtlas;

  const firstExtraSlot = baseRows * columns;
  additions.forEach(({ item }, index) => {
    const slot = firstExtraSlot + index;
    const x = (slot % columns) * tileSize;
    const y = Math.floor(slot / columns) * tileSize;
    nextEntries[item.raw] = {
      x,
      y,
      w: tileSize,
      h: tileSize,
      display_name: item.display_ru || item.display_en || item.raw,
      item_key: item.key,
      meta: item.meta
    };
  });

  const rows = Math.max(baseRows, Math.ceil((firstExtraSlot + additions.length) / columns));
  const height = rows * tileSize;
  const baseHeight = baseRows * tileSize;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return baseAtlas;
  context.imageSmoothingEnabled = false;

  const disposableUrls: string[] = [];
  try {
    const baseImage = await fetchImage(baseAtlas.image_url);
    disposableUrls.push(baseImage.objectUrl);
    context.drawImage(baseImage.image, 0, 0, width, baseHeight);

    const atlasImages = new Map<string, HTMLImageElement>();
    const loadGeneratedImage = async (generated: ModIconAtlasEntry) => {
      const cacheKey = generated.image_url;
      let source = atlasImages.get(cacheKey);
      if (!source) {
        const loaded = await fetchImage(generated.image_url);
        disposableUrls.push(loaded.objectUrl);
        source = loaded.image;
        atlasImages.set(cacheKey, source);
      }
      return source;
    };

    for (const { base, generated } of replacements) {
      const source = await loadGeneratedImage(generated);
      context.clearRect(base.x, base.y, base.w, base.h);
      context.drawImage(source, generated.x, generated.y, generated.w, generated.h, base.x, base.y, base.w, base.h);
    }

    for (let index = 0; index < additions.length; index += 1) {
      const { item, generated } = additions[index];
      const target = nextEntries[item.raw];
      const source = await loadGeneratedImage(generated);
      context.drawImage(source, generated.x, generated.y, generated.w, generated.h, target.x, target.y, target.w, target.h);
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return baseAtlas;
    if (mergedAtlasObjectUrl) URL.revokeObjectURL(mergedAtlasObjectUrl);
    mergedAtlasObjectUrl = URL.createObjectURL(blob);
    return { ...baseAtlas, image_url: mergedAtlasObjectUrl, rows, entries: nextEntries };
  } catch {
    return baseAtlas;
  } finally {
    disposableUrls.forEach((url) => URL.revokeObjectURL(url));
  }
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

export async function getItemPanelAtlas(): Promise<ItemPanelAtlas> {
  if (!mergedAtlasPromise) {
    mergedAtlasPromise = loadBaseItemPanelAtlas().then(mergeGeneratedModIcons);
  }
  return mergedAtlasPromise;
}

export async function getItemCatalog(): Promise<ItemCatalogResponse> {
  return request<ItemCatalogResponse>(apiPath('/itempanel/catalog'));
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
