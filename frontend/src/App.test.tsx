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
            language: 'ru',
            active_view_tab: 'editor',
            reset_layout_version: 3,
            workspace_layout: { top_ratio: 55, main_ratio: 68 },
            panel_layout: [
              { id: 'input', zone: 'topLeft', order: 0, visible: true, height: 420 },
              { id: 'output', zone: 'topRight', order: 0, visible: true, height: 420 },
              { id: 'grid', zone: 'bottom', order: 0, visible: true, height: 420 },
              { id: 'settings', zone: 'bottom', order: 1, visible: true, height: 320 },
              { id: 'info', zone: 'sidebar', order: 0, visible: true, height: 280 },
              { id: 'debug', zone: 'sidebar', order: 1, visible: true, height: 280 },
              { id: 'diagnostics', zone: 'sidebar', order: 2, visible: true, height: 260 },
              { id: 'preview', zone: 'sidebar', order: 3, visible: false, height: 220 },
              { id: 'raw', zone: 'sidebar', order: 4, visible: false, height: 260 }
            ]
          }
        })
      }) as Promise<Response>;
    }

    if (url === '/api/settings/project/ui' && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      return Promise.resolve({ ok: true, json: async () => ({ ui_preferences: body, project_config_path: '/workspace/CubixRecipes/cubixrecipes.config.json' }) }) as Promise<Response>;
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
  vi.spyOn(window, 'open').mockImplementation(() => ({ closed: false } as Window));
});

test('uses russian layout with output to the right and parses recipe', async () => {
  render(<App />);
  expect(screen.getByText('Редактор рецептов')).toBeTruthy();
  expect(screen.getByText('Входной рецепт')).toBeTruthy();
  expect(screen.getAllByText('Результат').length).toBeGreaterThan(0);

  fireEvent.paste(screen.getByLabelText('paste-input'), { clipboardData: { getData: () => 'recipes.addShaped(...)' } });
  await waitFor(() => expect(screen.getByText('Рецепт загружен')).toBeTruthy());
  expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:torch>');
});

test('view menu hides and restores panels', async () => {
  render(<App />);
  fireEvent.click(screen.getByText('Вид'));
  const debugToggle = screen.getAllByLabelText('Быстрый debug')[0];
  fireEvent.click(debugToggle);
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Быстрый debug' })).toBeFalsy());

  fireEvent.click(screen.getByText('Показать все панели'));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Быстрый debug' })).toBeTruthy());
});

test('language switch changes visible labels', async () => {
  render(<App />);
  await waitFor(() => expect((screen.getByLabelText('Язык') as HTMLSelectElement).value).toBe('ru'));
  fireEvent.change(screen.getByLabelText('Язык'), { target: { value: 'en' } });
  await waitFor(() => expect(screen.getByText('Recipe Editor')).toBeTruthy());
  expect(screen.getByText('Language')).toBeTruthy();
});

test('toolbar buttons invoke save, save-as, create, help and wiki flows', async () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('paste-input'), { target: { value: 'recipes.addShaped(...)' } });
  fireEvent.click(screen.getByText('Вставить'));
  await waitFor(() => expect(screen.getByText('Рецепт загружен')).toBeTruthy());

  fireEvent.change(screen.getByLabelText('output-raw'), { target: { value: '<minecraft:lantern>' } });
  fireEvent.click(screen.getByText('Сохранить'));
  await waitFor(() => expect(screen.getByText('Рецепт сохранён')).toBeTruthy());

  fireEvent.click(screen.getByText('Сохранить как'));
  await waitFor(() => expect(screen.getByText('Рецепт сохранён → scripts/new_recipe.zs')).toBeTruthy());

  fireEvent.click(screen.getByText('Создать новый'));
  await waitFor(() => expect(screen.getAllByText('Создан новый шаблон рецепта').length).toBeGreaterThan(0));

  fireEvent.click(screen.getByText('Справка'));
  expect(screen.getByRole('dialog', { name: 'Справка' })).toBeTruthy();

  fireEvent.click(screen.getByText('Вики'));
  expect(window.open).toHaveBeenCalledWith('http://localhost:3000/wiki.html', '_blank', 'noopener,noreferrer');
});

test('drag and drop becomes the primary way to reorder panels', async () => {
  render(<App />);
  const dragHandle = await screen.findByLabelText('Перетащить панель: Настройки');
  const slots = document.querySelectorAll('.bottom-zone .drop-slot');
  expect(slots.length).toBeGreaterThan(1);

  fireEvent.dragStart(dragHandle);
  fireEvent.dragOver(slots[0]);
  fireEvent.drop(slots[0]);
  fireEvent.dragEnd(dragHandle);

  await waitFor(() => {
    const headings = Array.from(document.querySelectorAll('.bottom-zone h2')).map((node) => node.textContent);
    expect(headings[0]).toBe('Настройки');
  });
});

