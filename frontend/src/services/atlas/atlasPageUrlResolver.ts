import { apiPath } from '../../config/runtime';

export function resolveAtlasPageUrl(imageUrl: string, serverId?: string | null): string {
  let url = imageUrl.replace('/api/admin/mod-icons/atlases/', '/api/mod-icons/atlases/');
  if (url.startsWith('/api/')) url = apiPath(url.slice(4));
  const activeServerId = serverId ?? (typeof window !== 'undefined' ? window.localStorage.getItem('active_server_id') : null);
  if (activeServerId && (url.startsWith('http') || url.startsWith('/')) && !/[?&]server=/.test(url)) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}server=${encodeURIComponent(activeServerId)}`;
  }
  return url;
}
