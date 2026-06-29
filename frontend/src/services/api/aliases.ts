import { ItemCaseAliasReport } from '../../types';
import { apiPath, buildRequestHeaders, readErrorMessage, request } from './client';

export async function getItemCaseAliasReport(): Promise<ItemCaseAliasReport | null> {
  const payload = await request<{ ok: boolean; report: ItemCaseAliasReport | null }>(apiPath('/item-case-aliases'));
  return payload.report;
}

export async function generateItemCaseAliasReport(): Promise<ItemCaseAliasReport> {
  const payload = await request<{ ok: boolean; report: ItemCaseAliasReport }>(apiPath('/admin/item-case-aliases/generate'), { method: 'POST' });
  return payload.report;
}

export async function saveManualItemCaseAlias(lowerKey: string, original: string): Promise<ItemCaseAliasReport> {
  const payload = await request<{ ok: boolean; report: ItemCaseAliasReport }>(apiPath('/admin/item-case-aliases/manual'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lower_key: lowerKey, original })
  });
  return payload.report;
}

export async function uploadItemCaseAliasFmlLog(file: File): Promise<ItemCaseAliasReport> {
  const path = apiPath(`/admin/item-case-aliases/fml-log?filename=${encodeURIComponent(file.name)}`);
  const headers = buildRequestHeaders({ 'Content-Type': 'text/plain' });
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: file
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const payload = await response.json() as { ok: boolean; report: ItemCaseAliasReport };
  return payload.report;
}
