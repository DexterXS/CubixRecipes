import type { NeiFavoritesProfile } from '../types';

const CACHE_SCHEMA_VERSION = 1;
const ITEM_CATALOG_CACHE_SCHEMA_VERSION = 2;
const DATABASE_NAME = 'cubixrecipes-bootstrap-v1';
const DATABASE_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';
const LOCAL_STORAGE_PREFIX = 'cubixrecipes:bootstrap-snapshot:v1:';
const FAVORITES_KIND = 'nei-favorites';
const ITEM_CATALOG_KIND = 'item-catalog';

export interface CachedItemPanelCatalog {
  entries: unknown[];
  summary: Record<string, unknown> | null;
}

interface CachedRecord<TValue, TKind extends string> {
  schemaVersion: number;
  scope: string;
  kind: TKind;
  savedAt: number;
  value: TValue;
}

type CachedFavoritesRecord = CachedRecord<NeiFavoritesProfile, typeof FAVORITES_KIND>;
type CachedItemCatalogRecord = CachedRecord<CachedItemPanelCatalog, typeof ITEM_CATALOG_KIND>;

export function buildBootstrapCacheScope(serverId: string | null | undefined, userEmail: string | null | undefined): string {
  const server = serverId?.trim() || 'default';
  const user = userEmail?.trim().toLowerCase() || 'anonymous';
  return `${server}::${user}`;
}

function localStorageKey(scope: string, kind: string): string {
  return `${LOCAL_STORAGE_PREFIX}${encodeURIComponent(scope)}:${kind}`;
}

function isFavoritesProfile(value: unknown): value is NeiFavoritesProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<NeiFavoritesProfile>;
  return typeof profile.activeTabId === 'string'
    && typeof profile.favoriteHotkey === 'string'
    && Array.isArray(profile.hiddenPatterns)
    && profile.hiddenPatterns.every((pattern) => typeof pattern === 'string')
    && Array.isArray(profile.tabs)
    && profile.tabs.every((tab) => (
      Boolean(tab)
      && typeof tab.id === 'string'
      && typeof tab.name === 'string'
      && Array.isArray(tab.items)
      && tab.items.every((item) => Boolean(item) && typeof item.raw === 'string' && typeof item.addedAt === 'number')
    ));
}

function isItemPanelCatalog(value: unknown): value is CachedItemPanelCatalog {
  if (!value || typeof value !== 'object') return false;
  const catalog = value as Partial<CachedItemPanelCatalog>;
  const summary = catalog.summary;
  return Array.isArray(catalog.entries)
    && catalog.entries.every((entry) => Boolean(entry) && typeof entry === 'object')
    && (summary === null || (Boolean(summary) && typeof summary === 'object'));
}

function parseRecord<TValue, TKind extends string>(
  value: unknown,
  scope: string,
  kind: TKind,
  isValue: (candidate: unknown) => candidate is TValue,
  expectedSchemaVersion = CACHE_SCHEMA_VERSION
): CachedRecord<TValue, TKind> | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<CachedRecord<TValue, TKind>>;
  if (record.schemaVersion !== expectedSchemaVersion || record.scope !== scope || record.kind !== kind) {
    return null;
  }
  if (typeof record.savedAt !== 'number' || !Number.isFinite(record.savedAt) || !isValue(record.value)) {
    return null;
  }
  return record as CachedRecord<TValue, TKind>;
}

function readLocalRecord<TValue, TKind extends string>(
  scope: string,
  kind: TKind,
  isValue: (candidate: unknown) => candidate is TValue,
  expectedSchemaVersion = CACHE_SCHEMA_VERSION
): CachedRecord<TValue, TKind> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(localStorageKey(scope, kind));
    return raw ? parseRecord(JSON.parse(raw), scope, kind, isValue, expectedSchemaVersion) : null;
  } catch {
    return null;
  }
}

function writeLocalRecord<TValue, TKind extends string>(record: CachedRecord<TValue, TKind>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(localStorageKey(record.scope, record.kind), JSON.stringify(record));
  } catch {
    // Local persistence is best-effort; the live API remains authoritative.
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(SNAPSHOT_STORE)) {
          request.result.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function indexedDbKey(scope: string, kind: string): string {
  return `${scope}:${kind}`;
}

async function readIndexedRecord<TValue, TKind extends string>(
  scope: string,
  kind: TKind,
  isValue: (candidate: unknown) => candidate is TValue,
  expectedSchemaVersion = CACHE_SCHEMA_VERSION
): Promise<CachedRecord<TValue, TKind> | null> {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(SNAPSHOT_STORE, 'readonly');
      const request = transaction.objectStore(SNAPSHOT_STORE).get(indexedDbKey(scope, kind));
      request.onsuccess = () => resolve(parseRecord(request.result?.value, scope, kind, isValue, expectedSchemaVersion));
      request.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeIndexedRecord<TValue, TKind extends string>(record: CachedRecord<TValue, TKind>): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = database.transaction(SNAPSHOT_STORE, 'readwrite');
      transaction.objectStore(SNAPSHOT_STORE).put({ key: indexedDbKey(record.scope, record.kind), value: record });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function readCachedNeiFavorites(scope: string): NeiFavoritesProfile | null {
  return readLocalRecord(scope, FAVORITES_KIND, isFavoritesProfile)?.value ?? null;
}

export async function hydrateCachedNeiFavorites(scope: string): Promise<NeiFavoritesProfile | null> {
  const localRecord = readLocalRecord(scope, FAVORITES_KIND, isFavoritesProfile);
  const indexedRecord = await readIndexedRecord(scope, FAVORITES_KIND, isFavoritesProfile);
  const newest = indexedRecord && (!localRecord || indexedRecord.savedAt > localRecord.savedAt)
    ? indexedRecord
    : localRecord;
  if (newest && (!localRecord || newest.savedAt !== localRecord.savedAt)) {
    writeLocalRecord(newest);
  }
  return newest?.value ?? null;
}

export function writeCachedNeiFavorites(scope: string, value: NeiFavoritesProfile): void {
  const record: CachedFavoritesRecord = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    scope,
    kind: FAVORITES_KIND,
    savedAt: Date.now(),
    value
  };
  writeLocalRecord(record);
  void writeIndexedRecord(record);
}

export function readCachedItemPanelCatalog(scope: string): CachedItemPanelCatalog | null {
  return readLocalRecord(scope, ITEM_CATALOG_KIND, isItemPanelCatalog, ITEM_CATALOG_CACHE_SCHEMA_VERSION)?.value ?? null;
}

export async function hydrateCachedItemPanelCatalog(scope: string): Promise<CachedItemPanelCatalog | null> {
  const localRecord = readLocalRecord(scope, ITEM_CATALOG_KIND, isItemPanelCatalog, ITEM_CATALOG_CACHE_SCHEMA_VERSION);
  const indexedRecord = await readIndexedRecord(scope, ITEM_CATALOG_KIND, isItemPanelCatalog, ITEM_CATALOG_CACHE_SCHEMA_VERSION);
  const newest = indexedRecord && (!localRecord || indexedRecord.savedAt > localRecord.savedAt)
    ? indexedRecord
    : localRecord;
  if (newest && (!localRecord || newest.savedAt !== localRecord.savedAt)) {
    writeLocalRecord(newest);
  }
  return newest?.value ?? null;
}

export function writeCachedItemPanelCatalog(
  scope: string,
  entries: unknown[],
  summary: Record<string, unknown> | null
): void {
  const record: CachedItemCatalogRecord = {
    schemaVersion: ITEM_CATALOG_CACHE_SCHEMA_VERSION,
    scope,
    kind: ITEM_CATALOG_KIND,
    savedAt: Date.now(),
    value: { entries, summary }
  };
  writeLocalRecord(record);
  void writeIndexedRecord(record);
}
