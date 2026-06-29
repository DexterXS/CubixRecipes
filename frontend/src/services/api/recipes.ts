import { RecipeView } from '../../types';
import { apiPath, request } from './client';

interface ParseResponse {
  kind: string;
  recipe?: RecipeView;
  item?: { raw: string };
}

interface CreateRecipePayload {
  templateType: string;
  output?: string;
  grid: number;
  bindingMode?: 'soft' | 'strict';
}

interface UpdateRecipePayload {
  recipeUid: string;
  recipeType: string;
  outputRaw: string;
  matrix: (string | null)[][];
  name?: string | null;
  bindingMode?: 'soft' | 'strict';
  removeTemplate?: string | null;
}

interface SaveAsPayload extends UpdateRecipePayload {
  targetPath: string;
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
      name: payload.name ?? null,
      binding_mode: payload.bindingMode ?? 'soft',
      remove_template: payload.removeTemplate ?? null
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

export async function searchRecipesUsingItem(itemRaw: string): Promise<{ matches: RecipeView[] }> {
  return request<{ matches: RecipeView[] }>(apiPath('/recipes/uses'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_raw: itemRaw })
  });
}

export async function searchRecipesByOutputs(outputItemRaws: string[]): Promise<{ matches: Record<string, number> }> {
  return request<{ matches: Record<string, number> }>(apiPath('/recipes/search-batch'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ output_item_raws: outputItemRaws })
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
      target_path: payload.targetPath,
      binding_mode: payload.bindingMode ?? 'soft',
      remove_template: payload.removeTemplate ?? null
    })
  });
}
