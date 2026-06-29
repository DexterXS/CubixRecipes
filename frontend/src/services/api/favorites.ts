import { NeiFavoritesProfile } from '../../types';
import { apiPath, request } from './client';

export async function getNeiFavorites(): Promise<NeiFavoritesProfile> {
  return request<NeiFavoritesProfile>(apiPath('/nei/favorites'));
}

export async function saveNeiFavorites(profile: NeiFavoritesProfile): Promise<{ ok: boolean } & NeiFavoritesProfile> {
  return request<{ ok: boolean } & NeiFavoritesProfile>(apiPath('/nei/favorites'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile)
  });
}
