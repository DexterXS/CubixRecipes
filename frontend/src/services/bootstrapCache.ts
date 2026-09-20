import type { NeiFavoritesProfile } from '../types';

const CACHE_SCHEMA_VERSION = 1;
const DATABASE_NAME = 'cubixrecipes-bootstrap-v1';
const DATABASE_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';
const LOCAL_STORAGE_PREFIX = 'cubixrecipes:bootstrap-snapshot:v1:';
const FAVORITES_KIND = 'nei-favorites';

interface CachedFavoritesRecord {
  schemaVersion: number;
  scope: string;
  kind: typeof FAVORITES_KIND;
  savedAt: number;
  value: NeiFavoritesProfile;
}

export function buildBootstrapCacheScope(serverId: string | null | undefined, userEmail: string | null | undefined): string {
  const server = serverId?.trim() || 'default';
  const user = userEmail?.trim().toLowerCase() || 'anonymous';
  return `${server}::${user}`;
}

function localStorageKey(scope: string): string {
  return `${LOCAL_STORAGE_PREFIX}${encodeURIComponent(scope)}:${FAVORITES_KIND}`;
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

function parseRecord(value: unknown, scope: string): CachedFavoritesRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<CachedFavoritesRecord>;
  if (record.schemaVersion !== CACHE_SCHEMA_VERSION || record.scope !== scope || record.kind !== FAVORITES_KIND) {
    return null;
  }
  if (typeof record.savedAt !== 'number' || !Number.isFinite(record.savedAt) || !isFavoritesProfile(record.value)) {
    return null;
  }
  return record as CachedFavoritesRecord;
}

function readLocalRecord(scope: string): CachedFavoritesRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(localStorageKey(scope));
    return raw ? parseRecord(JSON.parse(raw), scope) : null;
  } catch {
    return null;
  }
}

function writeLocalRecord(record: CachedFavoritesRecord): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(localStorageKey(record.scope), JSON.stringify(record));
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

function indexedDbKey(scope: string): string {
  return `${scope}:${FAVORITES_KIND}`;
}

async function readIndexedRecord(scope: string): Promise<CachedFavoritesRecord | null> {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(SNAPSHOT_STORE, 'readonly');
      const request = transaction.objectStore(SNAPSHOT_STORE).get(indexedDbKey(scope));
      request.onsuccess = () => resolve(parseRecord(request.result?.value, scope));
      request.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeIndexedRecord(record: CachedFavoritesRecord): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = database.transaction(SNAPSHOT_STORE, 'readwrite');
      transaction.objectStore(SNAPSHOT_STORE).put({ key: indexedDbKey(record.scope), value: record });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function readCachedNeiFavorites(scope: string): NeiFavoritesProfile | null {
  return readLocalRecord(scope)?.value ?? null;
}

export async function hydrateCachedNeiFavorites(scope: string): Promise<NeiFavoritesProfile | null> {
  const localRecord = readLocalRecord(scope);
  const indexedRecord = await readIndexedRecord(scope);
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
