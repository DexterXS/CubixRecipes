import { ModIconAdminStatus, ModIconAtlasManifest } from '../../types';
import { ApiConflictError, apiPath, buildRequestHeaders, readErrorMessage, request } from './client';

export async function getModIconAdminStatus(): Promise<ModIconAdminStatus> {
  return request<ModIconAdminStatus>(apiPath('/admin/mod-icons'));
}

export async function getModIconAtlasManifest(serverId?: string): Promise<ModIconAtlasManifest | null> {
  const payload = await request<{ manifest: ModIconAtlasManifest | null }>(apiPath('/mod-icons/atlas'), {
    headers: serverId ? { 'X-Server-Id': serverId } : undefined
  });
  return payload.manifest;
}

export async function uploadModIconArchive(file: File, replace = false): Promise<ModIconAdminStatus> {
  const path = apiPath(`/admin/mod-icons/archive?filename=${encodeURIComponent(file.name)}&replace=${replace ? 'true' : 'false'}`);
  const headers = buildRequestHeaders({ 'Content-Type': 'application/zip' });
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: file
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 409) {
      throw new ApiConflictError(message);
    }
    throw new Error(message);
  }
  const payload = await response.json() as { status: ModIconAdminStatus };
  return payload.status;
}

export function getModIconArchiveDownloadUrl(filename: string): string {
  return apiPath(`/admin/mod-icons/archive?filename=${encodeURIComponent(filename)}`);
}

export async function deleteModIconArchive(filename: string): Promise<ModIconAdminStatus> {
  const payload = await request<{ ok: boolean; status: ModIconAdminStatus }>(
    apiPath(`/admin/mod-icons/archive?filename=${encodeURIComponent(filename)}`),
    { method: 'DELETE' }
  );
  return payload.status;
}

export async function cleanModIconArchive(filename: string): Promise<{ status: ModIconAdminStatus; cleanup: { name: string; size: number; kept: number; removed: number; removedEntries: string[] } }> {
  const payload = await request<{ ok: boolean; status: ModIconAdminStatus; cleanup: { name: string; size: number; kept: number; removed: number; removedEntries: string[] } }>(
    apiPath(`/admin/mod-icons/archive/clean?filename=${encodeURIComponent(filename)}`),
    { method: 'POST' }
  );
  return { status: payload.status, cleanup: payload.cleanup };
}

export interface ModIconAtlasGenerationStatus {
  jobId?: string | null;
  status: 'idle' | 'queued' | 'building' | 'ready' | 'error';
  startedAt?: string | null;
  finishedAt?: string | null;
  error?: string | null;
  summary?: { revision?: string; totalMods?: number; totalIcons?: number; atlasCount?: number };
}

export async function getModIconAtlasGenerationStatus(): Promise<ModIconAtlasGenerationStatus> {
  return request<ModIconAtlasGenerationStatus>(apiPath('/admin/mod-icons/generate/status'));
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function generateModIconAtlases(): Promise<ModIconAtlasManifest> {
  const payload = await request<{ ok: boolean; manifest?: ModIconAtlasManifest | null; job?: ModIconAtlasGenerationStatus }>(apiPath('/admin/mod-icons/generate'), { method: 'POST' });
  // Keep compatibility with older backends that still return a completed manifest.
  if (payload.manifest) return payload.manifest;
  let status = payload.job ?? await getModIconAtlasGenerationStatus();
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (status.status === 'ready') {
      const manifest = await getModIconAtlasManifest();
      if (manifest) return manifest;
      throw new Error('Генерация завершена, но manifest атласа не найден.');
    }
    if (status.status === 'error') {
      throw new Error(status.error || 'Не удалось сгенерировать ZIP-атласы.');
    }
    await wait(250);
    status = await getModIconAtlasGenerationStatus();
  }
  throw new Error('Генерация ZIP-атласов выполняется слишком долго. Проверьте статус позже.');
}
