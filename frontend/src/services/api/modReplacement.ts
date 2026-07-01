import { apiPath, request } from './client';

export interface ModReplacementScanResponse {
  ok: boolean;
  items: Array<{
    raw: string;
    display_name: string | null;
    icon_url: string | null;
    animated: boolean;
  }>;
}

export async function scanModReplacement(modid: string): Promise<ModReplacementScanResponse> {
  return request<ModReplacementScanResponse>(`${apiPath('/admin/mod-replacement/scan')}?modid=${encodeURIComponent(modid)}`);
}

export async function replaceModItems(modid: string, replacements: Record<string, string>): Promise<{ ok: boolean; count: number; files: string[] }> {
  return request<{ ok: boolean; count: number; files: string[] }>(apiPath('/admin/mod-replacement/replace'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modid, replacements })
  });
}
