import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { MobileRecipeWorkspace } from './MobileRecipeWorkspace';

test('mobile recipe workspace keeps recipe files in the hamburger menu', () => {
  render(
    <MobileRecipeWorkspace
      canUseNeiFavorites={false}
      recipeBuilder={<section>craft</section>}
      recipeFiles={<section>files</section>}
      neiPanel={<section>nei</section>}
    />
  );

  expect(screen.getByText('craft')).toBeTruthy();
  expect(screen.getByText('files')).toBeTruthy();

  const menuButton = screen.getByLabelText('mobile-workspace-menu');
  expect(menuButton.getAttribute('aria-expanded')).toBe('false');

  fireEvent.click(menuButton);

  expect(menuButton.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('Меню редактора')).toBeTruthy();
});

test('mobile recipe workspace switches NEI to favorites without duplicating panels', () => {
  render(
    <MobileRecipeWorkspace
      canUseNeiFavorites
      recipeBuilder={<section>craft</section>}
      recipeFiles={<section>files</section>}
      neiPanel={<section>nei-items</section>}
      neiFavoritesPanel={<section>favorite-items</section>}
    />
  );

  expect(screen.getByRole('tab', { name: 'NEI' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByText('nei-items')).toBeTruthy();
  expect(screen.getByText('favorite-items')).toBeTruthy();

  fireEvent.click(screen.getByRole('tab', { name: 'Избранное' }));

  expect(screen.getByRole('tab', { name: 'Избранное' }).getAttribute('aria-selected')).toBe('true');
});
