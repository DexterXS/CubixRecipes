import { apiPath, buildBackendUnavailableMessage } from '../config/runtime';
import { AuthMeResponse, AuthUser, ItemPanelAtlas, ProjectSettings, RecipeView, UiPreferences, UserRole } from '../types';
import { logFrontendEvent } from './debugLog';

interface ParseResponse {
  kind: string;
  recipe?: RecipeView;
  item?: { raw: string };
}

interface ResolveItemResponse {
  icon_url?: string | null;
  icon_asset_id?: string | null;
  display_name?: string | null;
  animated?: boolean;
}

interface CreateRecipePayload {
  templateType: string;
  output?: string;
  grid: number;
}

interface UpdateRecipePayload {
  recipeUid: string;
  recipeType: string;
  outputRaw: string;
  matrix: (string | null)[][];
  name?: string | null;
}

interface SaveAsPayload extends UpdateRecipePayload {
  targetPath: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
    response = await fetch(path, { credentials: 'include', ...init });
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
    let message = `HTTP ${response.status}`;
    let errorPayload: unknown = null;
    try {
      errorPayload = await response.json();
      if ((errorPayload as { detail?: string })?.detail) {
        message = (errorPayload as { detail: string }).detail;
      }
    } catch {
      // ignore invalid JSON bodies
    }
    logFrontendEvent({
      level: 'ERROR',
      category: 'API',
      message: `${init?.method ?? 'GET'} ${path} failed`,
      details: { status: response.status, durationMs, payload: payloadPreview, response: errorPayload }
    });
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

export async function parseText(text: string): Promise<ParseResponse> {
  return request<ParseResponse>(apiPath('/parse'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
}

export async function createRecipeTemplate(payload: CreateRecipePayload): Promise<RecipeView> {
  return request<RecipeView>(apiPath('/recipes/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function updateRecipe(payload: UpdateRecipePayload): Promise<{ ok: boolean; updatedRecipe: RecipeView }> {
  return request<{ ok: boolean; updatedRecipe: RecipeView }>(`${apiPath(`/recipes/${payload.recipeUid}`)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipe_type: payload.recipeType,
      output_raw: payload.outputRaw,
      matrix: payload.matrix,
      name: payload.name ?? null
    })
  });
}

export async function searchRecipesByOutput(outputItemRaw: string): Promise<{ matches: RecipeView[] }> {
  return request<{ matches: RecipeView[] }>(apiPath('/recipes/search'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ output_item_raw: outputItemRaw })
  });
}

export async function saveRecipeAs(payload: SaveAsPayload): Promise<{ ok: boolean; new_uid: string; recipe: RecipeView }> {
  return request<{ ok: boolean; new_uid: string; recipe: RecipeView }>(apiPath('/recipes/save-as'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipe_uid: payload.recipeUid,
      recipe_type: payload.recipeType,
      output_raw: payload.outputRaw,
      matrix: payload.matrix,
      name: payload.name ?? null,
      target_path: payload.targetPath
    })
  });
}

export async function getProjectSettings(): Promise<ProjectSettings> {
  return request<ProjectSettings>(apiPath('/settings/project'));
}

export async function updateProjectUiPreferences(uiPreferences: UiPreferences): Promise<ProjectSettings> {
  return request<ProjectSettings>(apiPath('/settings/project/ui'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(uiPreferences)
  });
}

export async function resolveItemRaw(raw: string): Promise<ResolveItemResponse> {
  return request<ResolveItemResponse>(apiPath('/items/resolve'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_raw: raw, settings: {} })
  });
}

export async function getItemPanelAtlas(): Promise<ItemPanelAtlas> {
  try {
    const response = await fetch('/itempanel-atlas.json');
    if (response.ok) {
      return await response.json() as ItemPanelAtlas;
    }
  } catch {
    // Fall back to backend-generated atlas below.
  }
  return request<ItemPanelAtlas>(apiPath('/itempanel/atlas'));
}

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
