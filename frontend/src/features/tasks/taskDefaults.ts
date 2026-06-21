import { RecipeTaskPriority, RecipeTaskStatus } from '../../types';

export interface RecipeTaskDefaultTemplate {
  enabled: boolean;
  titleTemplate: string;
  descriptionTemplate: string;
  status: RecipeTaskStatus;
  priority: RecipeTaskPriority;
  deadlineDays: number;
  assigneeEmail: string;
  helperEmailsText: string;
}

export const TASK_DEFAULT_TEMPLATE_STORAGE_KEY = 'cubixrecipes:task-default-template:v1';

export const defaultTaskTemplate: RecipeTaskDefaultTemplate = {
  enabled: false,
  titleTemplate: '{item}',
  descriptionTemplate: '',
  status: 'planned',
  priority: 'normal',
  deadlineDays: 1,
  assigneeEmail: '',
  helperEmailsText: ''
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function coerceStatus(value: unknown): RecipeTaskStatus {
  return value === 'in_progress' || value === 'review' || value === 'done' ? value : 'planned';
}

function coercePriority(value: unknown): RecipeTaskPriority {
  return value === 'low' || value === 'high' || value === 'urgent' ? value : 'normal';
}

export function normalizeTaskDefaultTemplate(value: unknown): RecipeTaskDefaultTemplate {
  if (!isRecord(value)) return defaultTaskTemplate;
  return {
    enabled: value.enabled === true,
    titleTemplate: typeof value.titleTemplate === 'string' && value.titleTemplate.trim() ? value.titleTemplate : defaultTaskTemplate.titleTemplate,
    descriptionTemplate: typeof value.descriptionTemplate === 'string' ? value.descriptionTemplate : '',
    status: coerceStatus(value.status),
    priority: coercePriority(value.priority),
    deadlineDays: Math.max(1, Math.min(365, Math.floor(Number(value.deadlineDays) || defaultTaskTemplate.deadlineDays))),
    assigneeEmail: typeof value.assigneeEmail === 'string' ? value.assigneeEmail.trim().toLowerCase() : '',
    helperEmailsText: typeof value.helperEmailsText === 'string' ? value.helperEmailsText : ''
  };
}

export function loadTaskDefaultTemplate(): RecipeTaskDefaultTemplate {
  try {
    return normalizeTaskDefaultTemplate(JSON.parse(window.localStorage.getItem(TASK_DEFAULT_TEMPLATE_STORAGE_KEY) ?? 'null'));
  } catch {
    return defaultTaskTemplate;
  }
}

export function saveTaskDefaultTemplate(template: RecipeTaskDefaultTemplate): RecipeTaskDefaultTemplate {
  const normalized = normalizeTaskDefaultTemplate(template);
  window.localStorage.setItem(TASK_DEFAULT_TEMPLATE_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function taskTemplateEmails(value: string): string[] {
  const seen = new Set<string>();
  return value
    .replace(/,/g, '\n')
    .split('\n')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

export function taskTemplateDateInputValue(deadlineDays: number, date = new Date()): string {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + Math.max(0, Math.min(364, Math.floor(deadlineDays) - 1)));
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function applyTaskTextTemplate(template: string, itemTitle: string, itemRaw: string): string {
  const modid = itemRaw.match(/^<([^:>]+):/)?.[1] ?? '';
  return template
    .replace(/\{item\}/g, itemTitle || itemRaw)
    .replace(/\{raw\}/g, itemRaw)
    .replace(/\{mod\}/g, modid)
    .trim();
}
