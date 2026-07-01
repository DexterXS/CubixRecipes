import { RecipeTask, RecipeTaskBoard, RecipeTaskBoardMode, RecipeTaskPriority, RecipeTaskStatus } from '../../types';
import { apiPath, request } from './client';

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
