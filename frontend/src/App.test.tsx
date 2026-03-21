import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import App from './pages/App';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: {
      readText: vi.fn().mockResolvedValue('recipes.addShaped(...)')
    }
  });

  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === '/api/debug/log') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) }) as Promise<Response>;
    }

    if (url === '/api/settings/project' && (!init?.method || init.method === 'GET')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          scripts_dir: 'scripts',
          mods_dir: '',
          assets_dir: '',
          recipe_db_path: '',
          extra_icon_sources: [],
          extra_recipe_sources: [],
          verbose_debug_logging: false,
          project_config_path: '/workspace/CubixRecipes/cubixrecipes.config.json',
          ui_preferences: {
            display_mode: 'text',
            density_mode: 'normal',
            editor_mode: 'edit',
            collapsed_sections: {}
          }
        })
      }) as Promise<Response>;
    }

    if (url === '/api/settings/project' && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      return Promise.resolve({ ok: true, json: async () => ({ ...body, project_config_path: '/workspace/CubixRecipes/cubixrecipes.config.json' }) }) as Promise<Response>;
    }

    if (url === '/api/parse') {
      const body = JSON.parse(String(init?.body));
      if (body.text === 'broken') {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'backend down' }) }) as Promise<Response>;
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          recipe: {
            recipe_uid: 'recipe-1',
            recipe_type: 'ct_shaped',
            name: null,
            output: { raw: '<minecraft:torch>' },
            output_resolution: { display_name: 'Факел', icon_url: '/api/icons/torch' },
            grid_w: 2,
            grid_h: 2,
            source: { kind: 'zs_file', path: 'scripts/test.zs' },
            matrix: [
              [{ raw: '<minecraft:planks>' }, { raw: null }],
              [{ raw: null }, { raw: '<minecraft:stick>' }]
            ]
          }
        })
      }) as Promise<Response>;
    }

    if (url === '/api/recipes/recipe-1' && init?.method === 'PUT') {
      const body = JSON.parse(String(init?.body));
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ok: true,
          updatedRecipe: {
            recipe_uid: 'recipe-1',
            recipe_type: 'ct_shaped',
            name: null,
            output: { raw: body.output_raw },
            output_resolution: { display_name: 'Факел', icon_url: '/api/icons/torch' },
            grid_w: 2,
            grid_h: 2,
            source: { kind: 'zs_file', path: 'scripts/test.zs' },
            matrix: [
              [{ raw: '<minecraft:planks>' }, { raw: null }],
              [{ raw: null }, { raw: '<minecraft:stick>' }]
            ]
          }
        })
      }) as Promise<Response>;
    }

    if (url === '/api/recipes/create') {
      const body = JSON.parse(String(init?.body));
      return Promise.resolve({
        ok: true,
        json: async () => ({
          recipe_uid: 'new-recipe',
          recipe_type: 'ct_shaped',
          name: null,
          output: { raw: body.output ?? '<minecraft:stone>' },
          output_resolution: null,
          grid_w: 3,
          grid_h: 3,
          source: { kind: 'generated', path: null },
          matrix: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ raw: null })))
        })
      }) as Promise<Response>;
    }

    if (url === '/api/recipes/save-as') {
      const body = JSON.parse(String(init?.body));
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ok: true,
          new_uid: 'saved-1',
          recipe: {
            recipe_uid: 'saved-1',
            recipe_type: 'ct_shaped',
            name: null,
            output: { raw: body.output_raw },
            output_resolution: { display_name: 'Факел', icon_url: '/api/icons/torch' },
            grid_w: 2,
            grid_h: 2,
            source: { kind: 'zs_file', path: 'scripts/new_recipe.zs' },
            matrix: [
              [{ raw: '<minecraft:planks>' }, { raw: null }],
              [{ raw: null }, { raw: '<minecraft:stick>' }]
            ]
          }
        })
      }) as Promise<Response>;
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  }) as typeof fetch;

  vi.spyOn(window, 'prompt').mockReturnValue('scripts/new_recipe.zs');
  vi.spyOn(window, 'open').mockImplementation(() => null);
});

test('paste triggers parse and shows stronger output block', async () => {
  render(<App />);
  const textarea = screen.getByLabelText('paste-input');
  fireEvent.paste(textarea, {
    clipboardData: {
      getData: () => 'recipes.addShaped(...)'
    }
  });
  await waitFor(() => expect(screen.getByText('Рецепт загружен')).toBeTruthy());
  expect((screen.getByLabelText('cell-0-0') as HTMLInputElement).value).toBe('<minecraft:planks>');
  expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:torch>');
  expect(screen.getAllByText('Факел').length).toBeGreaterThan(0);
  expect(screen.getByText('Input Grid')).toBeTruthy();
});

test('parse error resets status from parsing state', async () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('paste-input'), { target: { value: 'broken' } });
  fireEvent.click(screen.getByText('Вставить'));
  await waitFor(() => expect(screen.getByText('Ошибка парсинга: backend down')).toBeTruthy());
});

test('toolbar buttons invoke save, save-as, create, help and wiki flows with editable output', async () => {
  render(<App />);

  fireEvent.change(screen.getByLabelText('paste-input'), { target: { value: 'recipes.addShaped(...)' } });
  fireEvent.click(screen.getAllByText('Вставить')[0]);
  await waitFor(() => expect(screen.getByText('Рецепт загружен')).toBeTruthy());

  fireEvent.change(screen.getByLabelText('output-raw'), { target: { value: '<minecraft:lantern>' } });
  fireEvent.click(screen.getByText('Сохранить'));
  await waitFor(() => expect(screen.getByText('Рецепт сохранён')).toBeTruthy());

  fireEvent.click(screen.getByText('Сохранить как'));
  await waitFor(() => expect(screen.getByText('Рецепт сохранён в scripts/new_recipe.zs')).toBeTruthy());

  fireEvent.click(screen.getByText('Создать новый'));
  await waitFor(() => expect(screen.getByText('Создан новый шаблон рецепта')).toBeTruthy());
  expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:lantern>');

  fireEvent.click(screen.getByText('Справка'));
  expect(screen.getByRole('dialog', { name: 'Справка' })).toBeTruthy();

  fireEvent.click(screen.getByText('Вики'));
  expect(window.open).toHaveBeenCalledWith('/wiki.html', '_blank', 'noopener,noreferrer');
});

test('clear action resets editor state', async () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('paste-input'), { target: { value: 'recipes.addShaped(...)' } });
  fireEvent.click(screen.getAllByText('Вставить')[0]);
  await waitFor(() => expect(screen.getByText('Рецепт загружен')).toBeTruthy());

  fireEvent.click(screen.getByText('Очистить'));
  expect((screen.getByLabelText('paste-input') as HTMLTextAreaElement).value).toBe('');
  expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:stone>');
  expect(screen.getByText('Интерфейс очищен')).toBeTruthy();
});
