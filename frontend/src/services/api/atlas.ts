import type { AtlasV2Index } from '../atlas/types';
import { apiPath, request } from './client';

export async function getAtlasV2Index(serverId?: string): Promise<AtlasV2Index | null> {
  const payload = await request<AtlasV2Index>(apiPath('/atlas/v2/index'), {
    cache: 'no-store',
    headers: serverId ? { 'X-Server-Id': serverId } : undefined
  });
  if (!payload || !Array.isArray(payload.candidates) || !Array.isArray(payload.pages)) {
    return null;
  }
  return payload;
}
