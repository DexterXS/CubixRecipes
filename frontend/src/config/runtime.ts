const DEFAULT_API_BASE = '/api';
const DEFAULT_BACKEND_TARGET = 'http://127.0.0.1:8000';
const DEFAULT_ITEMPANEL_FALLBACK_TO_FIRST_META = false;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function getApiBase(): string {
  const configured = import.meta.env.VITE_API_BASE?.trim();
  if (!configured) {
    return DEFAULT_API_BASE;
  }
  if (isAbsoluteHttpUrl(configured)) {
    return trimTrailingSlash(configured);
  }
  return configured.startsWith('/') ? trimTrailingSlash(configured) : `/${trimTrailingSlash(configured)}`;
}

export function apiPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBase()}${normalized}`;
}

export function getBackendTargetHint(): string {
  return trimTrailingSlash(import.meta.env.VITE_BACKEND_TARGET?.trim() || DEFAULT_BACKEND_TARGET);
}

export function getFrontendOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:5173';
}

export function buildBackendUnavailableMessage(path: string): string {
  return [
    `Backend unavailable for ${path}.`,
    `Frontend: ${getFrontendOrigin()}.`,
    `API: ${apiPath('')}.`,
    `Dev proxy target: ${getBackendTargetHint()}.`,
    'Start backend and try again.',
  ].join(' ');
}

export function getItemPanelFallbackToFirstMetaEnabled(): boolean {
  const raw = String(import.meta.env.VITE_ITEMPANEL_FALLBACK_TO_FIRST_META ?? '').trim().toLowerCase();
  if (!raw) {
    return DEFAULT_ITEMPANEL_FALLBACK_TO_FIRST_META;
  }
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}
