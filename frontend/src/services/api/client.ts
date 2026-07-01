import { apiPath, buildBackendUnavailableMessage } from '../../config/runtime';
import { logFrontendEvent } from '../debugLog';

export { apiPath };

export class ApiConflictError extends Error {}

export async function readErrorMessage(response: Response): Promise<string> {
  let message = `HTTP ${response.status}`;
  try {
    const payload = await response.json();
    if ((payload as { detail?: string })?.detail) {
      message = (payload as { detail: string }).detail;
    }
  } catch {
    // ignore invalid JSON bodies
  }
  return message;
}

export function buildRequestHeaders(customHeaders?: HeadersInit): Record<string, string> {
  const headers: Record<string, string> = {};
  if (customHeaders) {
    if (customHeaders instanceof Headers) {
      customHeaders.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(customHeaders)) {
      customHeaders.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, customHeaders);
    }
  }
  const activeServerId = window.localStorage.getItem('active_server_id');
  if (activeServerId) {
    headers['X-Server-Id'] = activeServerId;
  }
  return headers;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const startedAt = performance.now();
  const payloadPreview = typeof init?.body === 'string' ? init.body.slice(0, 600) : undefined;
  logFrontendEvent({
    level: 'INFO',
    category: 'API',
    message: `${init?.method ?? 'GET'} ${path} request`,
    details: { payload: payloadPreview },
    verbose_only: true
  });

  let response: Response;
  try {
    const headers = buildRequestHeaders(init?.headers);
    response = await fetch(path, { credentials: 'include', ...init, headers });
  } catch (error) {
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    const message = buildBackendUnavailableMessage(path);
    logFrontendEvent({
      level: 'ERROR',
      category: 'API',
      message: `${init?.method ?? 'GET'} ${path} network failure`,
      details: { durationMs, payload: payloadPreview, error: error instanceof Error ? error.message : String(error) }
    });
    throw new Error(message);
  }
  const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;

  if (!response.ok) {
    const message = await readErrorMessage(response);
    logFrontendEvent({
      level: 'ERROR',
      category: 'API',
      message: `${init?.method ?? 'GET'} ${path} failed`,
      details: { status: response.status, durationMs, payload: payloadPreview }
    });
    if (response.status === 409) {
      throw new ApiConflictError(message);
    }
    throw new Error(message);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const preview = (await response.text()).slice(0, 120);
    const message = `API returned non-JSON response for ${path}. Check VITE_API_BASE and backend /api routing. Preview: ${preview}`;
    logFrontendEvent({
      level: 'ERROR',
      category: 'API',
      message,
      details: { status: response.status, durationMs, payload: payloadPreview, contentType }
    });
    throw new Error(message);
  }

  const data = await response.json() as T;
  logFrontendEvent({
    level: 'INFO',
    category: 'API',
    message: `${init?.method ?? 'GET'} ${path} succeeded`,
    details: { durationMs, status: response.status, response: data },
    verbose_only: true
  });
  return data;
}

export async function requestBlob(path: string, init?: RequestInit): Promise<{ blob: Blob; filename: string }> {
  const headers = buildRequestHeaders(init?.headers);
  const response = await fetch(path, { credentials: 'include', ...init, headers });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  const filename = encodedMatch
    ? decodeURIComponent(encodedMatch[1])
    : plainMatch?.[1] ?? 'download.zs';
  return { blob: await response.blob(), filename };
}
