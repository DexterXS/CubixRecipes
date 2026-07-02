import type { UiLanguage } from '../types';

export type WorkspaceTab = 'editor' | 'recipe' | 'tasks' | 'technical' | 'cloud';

export type WorkspaceNavigationPermissions = {
  canCreateTemplates: boolean;
  canEditRecipes: boolean;
  canManageCloudFiles: boolean;
  canManageTasks: boolean;
  canUseTechnicalPanel: boolean;
};

export type WorkspaceNavigationItem = {
  id: WorkspaceTab;
  label: string;
  area: 'recipes' | 'files' | 'tasks' | 'diagnostics';
  description: string;
};

type WorkspaceNavigationCandidate = WorkspaceNavigationItem & {
  visible: boolean;
};

const labels = {
  ru: {
    recipes: 'Крафты',
    drafts: 'Черновики',
    tasks: 'Задачи',
    technical: 'Техраздел',
    cloud: 'Файлы',
    recipesDescription: 'Редактор и NEI',
    draftsDescription: 'Шаблоны и заготовки',
    tasksDescription: 'Рабочая доска',
    technicalDescription: 'Диагностика и админ-панели',
    cloudDescription: 'Облако .zs'
  },
  en: {
    recipes: 'Recipes',
    drafts: 'Drafts',
    tasks: 'Tasks',
    technical: 'Tech',
    cloud: 'Files',
    recipesDescription: 'Editor and NEI',
    draftsDescription: 'Templates and drafts',
    tasksDescription: 'Work board',
    technicalDescription: 'Diagnostics and admin panels',
    cloudDescription: 'Cloud .zs'
  }
} as const;

export function buildWorkspaceNavigation(
  language: UiLanguage,
  permissions: WorkspaceNavigationPermissions
): WorkspaceNavigationItem[] {
  const text = language === 'ru' ? labels.ru : labels.en;
  const candidates: WorkspaceNavigationCandidate[] = [
    {
      id: 'editor',
      label: text.recipes,
      area: 'recipes',
      description: text.recipesDescription,
      visible: true
    },
    {
      id: 'recipe',
      label: text.drafts,
      area: 'recipes',
      description: text.draftsDescription,
      visible: permissions.canCreateTemplates || permissions.canEditRecipes
    },
    {
      id: 'tasks',
      label: text.tasks,
      area: 'tasks',
      description: text.tasksDescription,
      visible: permissions.canManageTasks
    },
    {
      id: 'cloud',
      label: text.cloud,
      area: 'files',
      description: text.cloudDescription,
      visible: permissions.canManageCloudFiles
    },
    {
      id: 'technical',
      label: text.technical,
      area: 'diagnostics',
      description: text.technicalDescription,
      visible: permissions.canUseTechnicalPanel
    }
  ];

  return candidates
    .filter((item) => item.visible)
    .map(({ visible: _visible, ...item }) => item);
}
