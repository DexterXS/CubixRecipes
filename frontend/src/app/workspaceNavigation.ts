import type { UiLanguage } from '../types';

export type WorkspaceTab = 'editor' | 'cubixcraft' | 'itemdb' | 'recipe' | 'auctions' | 'tasks' | 'technical' | 'cloud';

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
  area: 'recipes' | 'files' | 'tasks' | 'auctions' | 'diagnostics';
  description: string;
  hint: string;
  details: string;
};

type WorkspaceNavigationCandidate = WorkspaceNavigationItem & {
  visible: boolean;
};

const labels = {
  ru: {
    recipes: 'Крафты',
    cubixcraft: 'CubixCraft',
    itemdb: 'База предметов',
    drafts: 'Черновики',
    auctions: 'Аукционы',
    tasks: 'Задачи',
    technical: 'Техраздел',
    cloud: 'Файлы',
    recipesDescription: 'Редактор и NEI',
    recipesHint: 'Основное рабочее пространство',
    cubixcraftDescription: 'Крафт 9×9 с количеством',
    cubixcraftHint: 'Отдельный редактор CubixCraft',
    itemdbDescription: 'Паспорта и прогресс индексации',
    itemdbHint: 'Каталог и данные предметов',
    draftsDescription: 'Шаблоны и заготовки',
    draftsHint: 'Сохранённые шаблоны',
    auctionsDescription: 'План и команды',
    auctionsHint: 'Планировщик аукционов',
    tasksDescription: 'Рабочая доска',
    tasksHint: 'Рабочая доска команды',
    technicalDescription: 'Диагностика и админ-панели',
    technicalHint: 'Диагностика и администрирование',
    cloudDescription: 'Облако .zs',
    cloudHint: 'Файлы сервера',
    recipesDetails: 'Создавай и редактируй рецепты, проверяй ингредиенты через NEI.',
    cubixcraftDetails: 'Собирай рецепты CubixCraft в сетках 9×9 с количеством.',
    itemdbDetails: 'Ищи предметы, просматривай паспорта и контролируй индексацию.',
    draftsDetails: 'Просматривай черновики, выбирай главные рецепты и отправляй их в облако.',
    auctionsDetails: 'Планируй аукционные лоты, дни и команды для сервера.',
    tasksDetails: 'Создавай и веди задачи по рецептам и предметам.',
    technicalDetails: 'Проверяй индексацию, иконки, доступ и административные настройки.',
    cloudDetails: 'Загружай, скачивай и переименовывай файлы .zs в облачном хранилище.'
  },
  en: {
    recipes: 'Recipes',
    cubixcraft: 'CubixCraft',
    itemdb: 'Item Database',
    drafts: 'Drafts',
    auctions: 'Auctions',
    tasks: 'Tasks',
    technical: 'Tech',
    cloud: 'Files',
    recipesDescription: 'Editor and NEI',
    recipesHint: 'Main workspace',
    cubixcraftDescription: '9×9 crafting with amounts',
    cubixcraftHint: 'Dedicated CubixCraft editor',
    itemdbDescription: 'Item passports and indexing progress',
    itemdbHint: 'Item catalog and data',
    draftsDescription: 'Templates and drafts',
    draftsHint: 'Saved templates',
    auctionsDescription: 'Schedule and commands',
    auctionsHint: 'Auction planner',
    tasksDescription: 'Work board',
    tasksHint: 'Team work board',
    technicalDescription: 'Diagnostics and admin panels',
    technicalHint: 'Diagnostics and administration',
    cloudDescription: 'Cloud .zs',
    cloudHint: 'Server files',
    recipesDetails: 'Create and edit recipes, then check ingredients through NEI.',
    cubixcraftDetails: 'Build CubixCraft recipes in 9×9 grids with amounts.',
    itemdbDetails: 'Search items, inspect passports, and monitor indexing.',
    draftsDetails: 'Review drafts, choose primary recipes, and send them to the cloud.',
    auctionsDetails: 'Plan auction lots, days, and server commands.',
    tasksDetails: 'Create and manage recipe and item tasks.',
    technicalDetails: 'Check indexing, icons, access, and administration settings.',
    cloudDetails: 'Upload, download, and rename .zs files in cloud storage.'
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
      hint: text.recipesHint,
      details: text.recipesDetails,
      visible: true
    },
    {
      id: 'cubixcraft',
      label: text.cubixcraft,
      area: 'recipes',
      description: text.cubixcraftDescription,
      hint: text.cubixcraftHint,
      details: text.cubixcraftDetails,
      visible: permissions.canEditRecipes
    },
    {
      id: 'itemdb',
      label: text.itemdb,
      area: 'recipes',
      description: text.itemdbDescription,
      hint: text.itemdbHint,
      details: text.itemdbDetails,
      visible: true
    },
    {
      id: 'recipe',
      label: text.drafts,
      area: 'recipes',
      description: text.draftsDescription,
      hint: text.draftsHint,
      details: text.draftsDetails,
      visible: permissions.canCreateTemplates || permissions.canEditRecipes
    },
    {
      id: 'auctions',
      label: text.auctions,
      area: 'auctions',
      description: text.auctionsDescription,
      hint: text.auctionsHint,
      details: text.auctionsDetails,
      visible: permissions.canEditRecipes
    },
    {
      id: 'tasks',
      label: text.tasks,
      area: 'tasks',
      description: text.tasksDescription,
      hint: text.tasksHint,
      details: text.tasksDetails,
      visible: permissions.canManageTasks
    },
    {
      id: 'cloud',
      label: text.cloud,
      area: 'files',
      description: text.cloudDescription,
      hint: text.cloudHint,
      details: text.cloudDetails,
      visible: permissions.canManageCloudFiles
    },
    {
      id: 'technical',
      label: text.technical,
      area: 'diagnostics',
      description: text.technicalDescription,
      hint: text.technicalHint,
      details: text.technicalDetails,
      visible: permissions.canUseTechnicalPanel
    }
  ];

  return candidates
    .filter((item) => item.visible)
    .map(({ visible: _visible, ...item }) => item);
}
