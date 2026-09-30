import { apiPath, request } from './client';

export const FAST_ITEM_PANEL_LIMIT = 48;

export interface FastItemPanelIcon {
  mime: string;
  data: string;
}

export interface FastItemPanelItem {
  raw: string;
  display_name: string;
  icon: FastItemPanelIcon | null;
}

export interface FastItemPanelPage {
  items: FastItemPanelItem[];
  page: number;
  limit: number;
  total: number;
  total_pages?: number;
}

export interface GetFastItemPanelPageOptions {
  page?: number;
  limit?: number;
  q?: string;
  serverId?: string;
}

export async function getFastItemPanelPage({
  page = 1,
  limit = FAST_ITEM_PANEL_LIMIT,
  q = '',
  serverId
}: GetFastItemPanelPageOptions = {}): Promise<FastItemPanelPage> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    q
  });

  return request<FastItemPanelPage>(apiPath(`/fast-itempanel/page?${params.toString()}`), {
    cache: 'no-store',
    headers: serverId ? { 'X-Server-Id': serverId } : undefined
  });
}
