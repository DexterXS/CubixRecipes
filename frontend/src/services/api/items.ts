import { CustomItem, RecipeDraftTemplate, RecipeView } from '../../types';
import { apiPath, request } from './client';

interface ResolveItemResponse {
  icon_url?: string | null;
  icon_asset_id?: string | null;
  display_name?: string | null;
  animated?: boolean;
}

interface CustomItemPayload {
  id?: number | null;
  scope: 'global' | 'user';
  source_raw: string;
  item_raw: string;
  display_name: string;
  nbt_raw?: string | null;
  comment?: string;
}

interface RecipeDraftTemplatePayload {
  outputRaw: string;
  recipe: RecipeView;
  sourceText: string;
  name: string;
}

export async function resolveItemRaw(raw: string): Promise<ResolveItemResponse> {
  return request<ResolveItemResponse>(apiPath('/items/resolve'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_raw: raw, settings: {} })
  });
}

export async function listCustomItems(): Promise<{ items: CustomItem[] }> {
  return request<{ items: CustomItem[] }>(apiPath('/items/custom'));
}

export async function saveCustomItem(payload: CustomItemPayload): Promise<{ ok: boolean; item: CustomItem }> {
  return request<{ ok: boolean; item: CustomItem }>(apiPath('/items/custom'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function deleteCustomItem(itemId: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(apiPath(`/items/custom/${itemId}`), { method: 'DELETE' });
}

export async function listRecipeDraftTemplates(): Promise<{ templates: RecipeDraftTemplate[] }> {
  return request<{ templates: RecipeDraftTemplate[] }>(apiPath('/recipe-drafts/templates'));
}

export async function saveRecipeDraftTemplate(payload: RecipeDraftTemplatePayload): Promise<{ ok: boolean; template: RecipeDraftTemplate }> {
  return request<{ ok: boolean; template: RecipeDraftTemplate }>(apiPath('/recipe-drafts/templates'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function deleteRecipeDraftTemplate(templateId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(apiPath(`/recipe-drafts/templates/${encodeURIComponent(templateId)}`), { method: 'DELETE' });
}
