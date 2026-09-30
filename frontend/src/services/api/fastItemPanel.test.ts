import { beforeEach, expect, test, vi } from 'vitest';

import { getFastItemPanelPage } from './fastItemPanel';

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => payload
  } as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

test('requests a fast item panel page with ordered query parameters and server header', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/debug/log') return Promise.resolve(jsonResponse({ ok: true }));
    return Promise.resolve(jsonResponse({ items: [], page: 3, limit: 48, total: 0 }));
  });
  globalThis.fetch = fetchMock;

  await getFastItemPanelPage({ page: 3, limit: 48, q: 'iron ingot', serverId: 'hitech' });

  const request = fetchMock.mock.calls.find(([input]) => String(input).startsWith('/api/fast-itempanel/page'));
  expect(request?.[0]).toBe('/api/fast-itempanel/page?page=3&limit=48&q=iron+ingot');
  expect(request?.[1]).toEqual(expect.objectContaining({
    cache: 'no-store',
    credentials: 'include',
    headers: { 'X-Server-Id': 'hitech' }
  }));
});
