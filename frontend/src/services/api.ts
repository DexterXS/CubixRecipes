import { RecipeView } from '../types';
import { logFrontendEvent } from './debugLog';

interface ParseResponse {
  kind: string;
  recipe?: RecipeView;
  item?: { raw: string };
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

  const response = await fetch(path, init);
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
  return request<ParseResponse>('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
}

export async function createRecipeTemplate(payload: CreateRecipePayload): Promise<RecipeView> {
  return request<RecipeView>('/api/recipes/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function updateRecipe(payload: UpdateRecipePayload): Promise<{ ok: boolean; updatedRecipe: RecipeView }> {
  return request<{ ok: boolean; updatedRecipe: RecipeView }>(`/api/recipes/${payload.recipeUid}`, {
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

export async function saveRecipeAs(payload: SaveAsPayload): Promise<{ ok: boolean; new_uid: string; recipe: RecipeView }> {
  return request<{ ok: boolean; new_uid: string; recipe: RecipeView }>('/api/recipes/save-as', {
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
