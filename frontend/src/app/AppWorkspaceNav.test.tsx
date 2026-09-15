import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { AppWorkspaceNav } from './AppWorkspaceNav';
import { buildWorkspaceNavigation } from './workspaceNavigation';

test('renders compact workspace tabs with accessible hover details', () => {
  const tabs = buildWorkspaceNavigation('ru', {
    canCreateTemplates: true,
    canEditRecipes: true,
    canManageCloudFiles: true,
    canManageTasks: true,
    canUseTechnicalPanel: true
  });

  render(<AppWorkspaceNav tabs={tabs} activeTab="editor" onSelectTab={vi.fn()} />);

  const recipesTab = screen.getByRole('button', { name: 'Крафты' });
  expect(recipesTab.className).toContain('active');
  expect(recipesTab.querySelector('svg')).toBeTruthy();
  expect(screen.getByRole('tooltip', { name: /Создавай и редактируй рецепты/ })).toBeTruthy();
  expect(screen.getByText('Основное рабочее пространство')).toBeTruthy();
});
