import { apiPath, request } from './client';

export async function uploadOreDictFile(text: string): Promise<{ ok: boolean; groups: number; reverse_keys: number }> {
  return request<{ ok: boolean; groups: number; reverse_keys: number }>(apiPath('/admin/oredict/upload'), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: text,
  });
}

export async function getOreDictGroups(): Promise<{ groups: Record<string, string[]>; available: boolean }> {
  return request<{ groups: Record<string, string[]>; available: boolean }>(apiPath('/api/oredict/groups'));
}
