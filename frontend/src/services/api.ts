import { apiPath, buildBackendUnavailableMessage } from '../config/runtime';
import { AccessControlSettings, AuthMeResponse, AuthUser, CustomItem, ItemCaseAliasReport, ItemCatalogResponse, ItemPanelAtlas, ModIconAdminStatus, ModIconAtlasManifest, NeiFavoritesProfile, ProjectSettings, RecipeDraftTemplate, RecipeTask, RecipeTaskBoard, RecipeTaskBoardMode, RecipeTaskPriority, RecipeTaskStatus, RecipeView, UiPreferences, UserRole, ZsCloudBackup, ZsCloudFile } from '../types';
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

export interface RecipeTaskPayload {
  itemRaw: string;
  itemTitle: string;
  title: string;
  description: string;
  status: RecipeTaskStatus;
  priority: RecipeTaskPriority;
  estimatedDays: number;
  deadlineDate: string;
  assigneeEmail: string;
  helperEmails: string[];
  sortOrder?: number;
}

type RecipeTaskPatchPayload = Partial<RecipeTaskPayload>;

export class ApiConflictError extends Error {}

async function readErrorMessage(response: Response): Promise<string> {
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

async function requestBlob(path: string, init?: RequestInit): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(path, { credentials: 'include', ...init });
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

export async function getProjectSettings(): Promise<ProjectSettings> {
  return request<ProjectSettings>(apiPath('/settings/project'));
}

export async function updateProjectSettings(settings: ProjectSettings): Promise<ProjectSettings> {
  return request<ProjectSettings>(apiPath('/settings/project'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scripts_dir: settings.scripts_dir,
      mods_dir: settings.mods_dir || '',
      assets_dir: settings.assets_dir || '',
      recipe_db_path: settings.recipe_db_path || '',
      extra_icon_sources: settings.extra_icon_sources || [],
      extra_recipe_sources: settings.extra_recipe_sources || [],
      verbose_debug_logging: Boolean(settings.verbose_debug_logging)
    })
  });
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

export async function getItemPanelAtlas(): Promise<ItemPanelAtlas> {
  try {
    const backendAtlas = await request<ItemPanelAtlas>(apiPath('/itempanel/atlas'));
    if (Object.keys(backendAtlas.entries ?? {}).length > 0) {
      return backendAtlas;
    }
  } catch {
    // Fall back to the generated static atlas for offline/dev snapshots.
  }
  const response = await fetch('/itempanel-atlas.json');
  if (response.ok) {
    return await response.json() as ItemPanelAtlas;
  }
  return {
    image_url: '/itempanel-atlas.png',
    tile_size: 32,
    columns: 0,
    rows: 0,
    entries: {}
  };
}

export async function getItemCatalog(): Promise<ItemCatalogResponse> {
  return request<ItemCatalogResponse>(apiPath('/itempanel/catalog'));
}

async function uploadRawItemPanelFile(file: File, endpoint: string, contentType: string): Promise<Response> {
  const path = apiPath(`${endpoint}?filename=${encodeURIComponent(file.name)}`);
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': contentType },
    body: file
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response;
}

export async function uploadItemPanelJson(file: File): Promise<{ ok: boolean; path: string; summary: Record<string, unknown> }> {
  const response = await uploadRawItemPanelFile(file, '/admin/itempanel/json', 'application/json');
  return await response.json() as { ok: boolean; path: string; summary: Record<string, unknown> };
}

export async function mergeItemPanelFiles(): Promise<{ ok: boolean; path: string; summary: Record<string, unknown> }> {
  return request<{ ok: boolean; path: string; summary: Record<string, unknown> }>(apiPath('/admin/itempanel/merge'), { method: 'POST' });
}

export function getItemPanelMergedCsvUrl(): string {
  return apiPath('/admin/itempanel/merged');
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

export async function getAccessControlSettings(): Promise<AccessControlSettings> {
  return request<AccessControlSettings>(apiPath('/admin/access'));
}

export async function updateAccessControlSettings(payload: AccessControlSettings): Promise<{ ok: boolean } & AccessControlSettings> {
  return request<{ ok: boolean } & AccessControlSettings>(apiPath('/admin/access'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function listRecipeTasks(): Promise<RecipeTaskBoard> {
  return request<RecipeTaskBoard>(apiPath('/admin/tasks'));
}

export async function createRecipeTask(payload: RecipeTaskPayload): Promise<{ ok: boolean; task: RecipeTask }> {
  return request<{ ok: boolean; task: RecipeTask }>(apiPath('/admin/tasks'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function updateRecipeTask(taskId: string, payload: RecipeTaskPatchPayload): Promise<{ ok: boolean; task: RecipeTask }> {
  return request<{ ok: boolean; task: RecipeTask }>(apiPath(`/admin/tasks/${encodeURIComponent(taskId)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function reorderRecipeTasks(tasks: Array<{ id: string; status: RecipeTaskStatus; sortOrder: number }>): Promise<{ ok: boolean; tasks: RecipeTask[] }> {
  return request<{ ok: boolean; tasks: RecipeTask[] }>(apiPath('/admin/tasks/order'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks })
  });
}

export async function updateRecipeTaskBoardMode(boardMode: RecipeTaskBoardMode): Promise<{ ok: boolean } & RecipeTaskBoard> {
  return request<{ ok: boolean } & RecipeTaskBoard>(apiPath('/admin/tasks/board'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boardMode })
  });
}

export async function deleteRecipeTask(taskId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(apiPath(`/admin/tasks/${encodeURIComponent(taskId)}`), { method: 'DELETE' });
}

export async function getNeiFavorites(): Promise<NeiFavoritesProfile> {
  return request<NeiFavoritesProfile>(apiPath('/nei/favorites'));
}

export async function saveNeiFavorites(profile: NeiFavoritesProfile): Promise<{ ok: boolean } & NeiFavoritesProfile> {
  return request<{ ok: boolean } & NeiFavoritesProfile>(apiPath('/nei/favorites'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile)
  });
}

export async function getModIconAdminStatus(): Promise<ModIconAdminStatus> {
  return request<ModIconAdminStatus>(apiPath('/admin/mod-icons'));
}

export async function getModIconAtlasManifest(): Promise<ModIconAtlasManifest | null> {
  const payload = await request<{ manifest: ModIconAtlasManifest | null }>(apiPath('/mod-icons/atlas'));
  return payload.manifest;
}

export async function uploadModIconArchive(file: File, replace = false): Promise<ModIconAdminStatus> {
  const path = apiPath(`/admin/mod-icons/archive?filename=${encodeURIComponent(file.name)}&replace=${replace ? 'true' : 'false'}`);
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/zip' },
    body: file
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 409) {
      throw new ApiConflictError(message);
    }
    throw new Error(message);
  }
  const payload = await response.json() as { status: ModIconAdminStatus };
  return payload.status;
}

export function getModIconArchiveDownloadUrl(filename: string): string {
  return apiPath(`/admin/mod-icons/archive?filename=${encodeURIComponent(filename)}`);
}

export async function deleteModIconArchive(filename: string): Promise<ModIconAdminStatus> {
  const payload = await request<{ ok: boolean; status: ModIconAdminStatus }>(
    apiPath(`/admin/mod-icons/archive?filename=${encodeURIComponent(filename)}`),
    { method: 'DELETE' }
  );
  return payload.status;
}

export async function cleanModIconArchive(filename: string): Promise<{ status: ModIconAdminStatus; cleanup: { name: string; size: number; kept: number; removed: number; removedEntries: string[] } }> {
  const payload = await request<{ ok: boolean; status: ModIconAdminStatus; cleanup: { name: string; size: number; kept: number; removed: number; removedEntries: string[] } }>(
    apiPath(`/admin/mod-icons/archive/clean?filename=${encodeURIComponent(filename)}`),
    { method: 'POST' }
  );
  return { status: payload.status, cleanup: payload.cleanup };
}

export async function uploadItemPanelCsv(file: File): Promise<{ ok: boolean; path: string; scan: Record<string, unknown>; atlas: ItemPanelAtlas }> {
  const response = await uploadRawItemPanelFile(file, '/admin/itempanel/csv', 'text/csv');
  return await response.json() as { ok: boolean; path: string; scan: Record<string, unknown>; atlas: ItemPanelAtlas };
}

export async function generateModIconAtlases(): Promise<ModIconAtlasManifest> {
  const payload = await request<{ ok: boolean; manifest: ModIconAtlasManifest }>(apiPath('/admin/mod-icons/generate'), { method: 'POST' });
  return payload.manifest;
}

export async function getItemCaseAliasReport(): Promise<ItemCaseAliasReport | null> {
  const payload = await request<{ ok: boolean; report: ItemCaseAliasReport | null }>(apiPath('/item-case-aliases'));
  return payload.report;
}

export async function generateItemCaseAliasReport(): Promise<ItemCaseAliasReport> {
  const payload = await request<{ ok: boolean; report: ItemCaseAliasReport }>(apiPath('/admin/item-case-aliases/generate'), { method: 'POST' });
  return payload.report;
}

export async function saveManualItemCaseAlias(lowerKey: string, original: string): Promise<ItemCaseAliasReport> {
  const payload = await request<{ ok: boolean; report: ItemCaseAliasReport }>(apiPath('/admin/item-case-aliases/manual'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lower_key: lowerKey, original })
  });
  return payload.report;
}

export async function uploadItemCaseAliasFmlLog(file: File): Promise<ItemCaseAliasReport> {
  const path = apiPath(`/admin/item-case-aliases/fml-log?filename=${encodeURIComponent(file.name)}`);
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'text/plain' },
    body: file
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const payload = await response.json() as { ok: boolean; report: ItemCaseAliasReport };
  return payload.report;
}

export async function listZsCloudFiles(): Promise<{ files: ZsCloudFile[] }> {
  return request<{ files: ZsCloudFile[] }>(apiPath('/admin/zs-cloud/files'));
}

export async function downloadZsCloudFile(path: string): Promise<{ blob: Blob; filename: string }> {
  return requestBlob(apiPath(`/admin/zs-cloud/files/download?path=${encodeURIComponent(path)}`));
}

export async function uploadZsCloudFile(filename: string, text: string, mode: 'fail' | 'overwrite' | 'append' = 'fail'): Promise<{ ok: boolean; path: string; files: ZsCloudFile[] }> {
  return request<{ ok: boolean; path: string; files: ZsCloudFile[] }>(apiPath('/admin/zs-cloud/files/upload'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, text, mode })
  });
}

export async function deleteZsCloudFile(path: string): Promise<{ ok: boolean; files: ZsCloudFile[] }> {
  return request<{ ok: boolean; files: ZsCloudFile[] }>(apiPath('/admin/zs-cloud/files'), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
}

export async function renameZsCloudFile(path: string, newName: string): Promise<{ ok: boolean; files: ZsCloudFile[] }> {
  return request<{ ok: boolean; files: ZsCloudFile[] }>(apiPath('/admin/zs-cloud/files/rename'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, new_name: newName })
  });
}

export async function listZsCloudBackups(): Promise<{ backups: ZsCloudBackup[] }> {
  return request<{ backups: ZsCloudBackup[] }>(apiPath('/admin/zs-cloud/backups'));
}

export async function downloadZsCloudBackup(backupId: string): Promise<{ blob: Blob; filename: string }> {
  return requestBlob(apiPath(`/admin/zs-cloud/backups/${encodeURIComponent(backupId)}/download`));
}
