import { describe, expect, test } from 'vitest';

import { buildWorkspaceNavigation } from './workspaceNavigation';

const allPermissions = {
  canCreateTemplates: true,
  canEditRecipes: true,
  canManageCloudFiles: true,
  canManageTasks: true,
  canUseTechnicalPanel: true
};

describe('buildWorkspaceNavigation', () => {
  test('returns product-oriented Russian workspace labels', () => {
    const tabs = buildWorkspaceNavigation('ru', allPermissions);

    expect(tabs.map((tab) => tab.id)).toEqual(['editor', 'recipe', 'tasks', 'cloud', 'technical']);
    expect(tabs.map((tab) => tab.label)).toEqual(['Крафты', 'Черновики', 'Задачи', 'Файлы', 'Техраздел']);
  });

  test('hides restricted sections without hiding the recipe editor', () => {
    const tabs = buildWorkspaceNavigation('en', {
      canCreateTemplates: false,
      canEditRecipes: false,
      canManageCloudFiles: false,
      canManageTasks: false,
      canUseTechnicalPanel: false
    });

    expect(tabs).toEqual([
      {
        id: 'editor',
        label: 'Recipes',
        area: 'recipes',
        description: 'Editor and NEI'
      }
    ]);
  });
});
