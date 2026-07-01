import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { MobileAppMenu } from './MobileAppMenu';

test('mobile app menu opens navigation and system actions', () => {
  const onSelectTab = vi.fn();
  const onResetServer = vi.fn();
  const onOpenSettings = vi.fn();

  render(
    <MobileAppMenu
      appName="CubixRecipes"
      userEmail="user@example.com"
      userRole="admin"
      serverName="HiTech"
      tabs={[{ id: 'editor', label: 'Главное меню' }, { id: 'cloud', label: 'Облако' }]}
      activeTab="editor"
      onSelectTab={onSelectTab}
      onResetServer={onResetServer}
      language="ru"
      canManageSettings
      canOpenSettings
      onLanguageChange={vi.fn()}
      onOpenSettings={onOpenSettings}
      onLogout={vi.fn()}
      editorTools={<section>Файлы рецептов</section>}
    />
  );

  const menuButton = screen.getByLabelText('mobile-app-menu');
  expect(menuButton.getAttribute('aria-expanded')).toBe('false');

  fireEvent.click(menuButton);

  expect(menuButton.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('CubixRecipes')).toBeTruthy();
  expect(screen.getByText('Сменить сервер')).toBeTruthy();
  expect(screen.getByText('Файлы рецептов')).toBeTruthy();

  fireEvent.click(screen.getByText('Облако'));
  expect(onSelectTab).toHaveBeenCalledWith('cloud');
});
