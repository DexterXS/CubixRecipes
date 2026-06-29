import { ZsCloudBackup, ZsCloudFile } from '../../types';
import { apiPath, request, requestBlob } from './client';

export async function listZsCloudFiles(): Promise<{ files: ZsCloudFile[] }> {
  return request<{ files: ZsCloudFile[] }>(apiPath('/admin/zs-cloud/files'));
}

export async function downloadZsCloudFile(path: string): Promise<{ blob: Blob; filename: string }> {
  return requestBlob(apiPath(`/admin/zs-cloud/files/download?path=${encodeURIComponent(path)}`));
}

export async function uploadZsCloudFile(filename: string, text: string, mode: 'fail' | 'overwrite' | 'append' = 'fail'): Promise<{ ok: boolean; path: string; files: ZsCloudFile[] }> {
  return request<{ ok: boolean; path: string; files: ZsCloudFile[] }>(apiPath('/admin/zs-cloud/files/upload'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, text, mode })
  });
}

export async function deleteZsCloudFile(path: string): Promise<{ ok: boolean; files: ZsCloudFile[] }> {
  return request<{ ok: boolean; files: ZsCloudFile[] }>(apiPath('/admin/zs-cloud/files'), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
}

export async function renameZsCloudFile(path: string, newName: string): Promise<{ ok: boolean; files: ZsCloudFile[] }> {
  return request<{ ok: boolean; files: ZsCloudFile[] }>(apiPath('/admin/zs-cloud/files/rename'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, new_name: newName })
  });
}

export async function listZsCloudBackups(): Promise<{ backups: ZsCloudBackup[] }> {
  return request<{ backups: ZsCloudBackup[] }>(apiPath('/admin/zs-cloud/backups'));
}

export async function downloadZsCloudBackup(backupId: string): Promise<{ blob: Blob; filename: string }> {
  return requestBlob(apiPath(`/admin/zs-cloud/backups/${encodeURIComponent(backupId)}/download`));
}
