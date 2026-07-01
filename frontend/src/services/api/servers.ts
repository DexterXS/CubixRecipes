import { apiPath, request } from './client';

export interface ServerInfo {
  id: string;
  name: string;
}

export async function listServers(): Promise<{ servers: ServerInfo[] }> {
  return request<{ servers: ServerInfo[] }>(apiPath('/servers'));
}

export async function createServer(name: string): Promise<{ ok: boolean; servers: ServerInfo[] }> {
  return request<{ ok: boolean; servers: ServerInfo[] }>(apiPath('/servers'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
}

export async function renameServer(serverId: string, name: string): Promise<{ ok: boolean; servers: ServerInfo[] }> {
  return request<{ ok: boolean; servers: ServerInfo[] }>(apiPath(`/servers/${serverId}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
}

export async function deleteServer(serverId: string): Promise<{ ok: boolean; servers: ServerInfo[] }> {
  return request<{ ok: boolean; servers: ServerInfo[] }>(apiPath(`/servers/${serverId}`), {
    method: 'DELETE'
  });
}
