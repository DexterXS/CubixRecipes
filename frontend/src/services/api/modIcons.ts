import { ModIconAdminStatus, ModIconAtlasManifest } from '../../types';
import { ApiConflictError, apiPath, buildRequestHeaders, readErrorMessage, request } from './client';

export async function getModIconAdminStatus(): Promise<ModIconAdminStatus> {
  return request<ModIconAdminStatus>(apiPath('/admin/mod-icons'));
}

export async function getModIconAtlasManifest(): Promise<ModIconAtlasManifest | null> {
  const payload = await request<{ manifest: ModIconAtlasManifest | null }>(apiPath('/mod-icons/atlas'));
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

export async function generateModIconAtlases(): Promise<ModIconAtlasManifest> {
  const payload = await request<{ ok: boolean; manifest: ModIconAtlasManifest }>(apiPath('/admin/mod-icons/generate'), { method: 'POST' });
  return payload.manifest;
}
