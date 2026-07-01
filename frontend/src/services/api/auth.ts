import { AccessControlSettings, AuthMeResponse, AuthUser, UserRole } from '../../types';
import { apiPath, request } from './client';

export async function getCurrentUser(): Promise<AuthMeResponse> {
  return request<AuthMeResponse>(apiPath('/auth/me'));
}

export function getGoogleLoginUrl(): string {
  return apiPath('/auth/google/start');
}

export async function logoutCurrentUser(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(apiPath('/auth/logout'), { method: 'POST' });
}

export async function listUsers(): Promise<{ users: AuthUser[] }> {
  return request<{ users: AuthUser[] }>(apiPath('/admin/users'));
}

export async function updateUserRole(userId: number, role: UserRole): Promise<{ ok: boolean; user: AuthUser }> {
  return request<{ ok: boolean; user: AuthUser }>(apiPath(`/admin/users/${userId}/role`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role })
  });
}

export async function getAccessControlSettings(): Promise<AccessControlSettings> {
  return request<AccessControlSettings>(apiPath('/admin/access'));
}

export async function updateAccessControlSettings(payload: AccessControlSettings): Promise<{ ok: boolean } & AccessControlSettings> {
  return request<{ ok: boolean } & AccessControlSettings>(apiPath('/admin/access'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
