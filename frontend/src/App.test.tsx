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
            reset_layout_version: 4,
            workspace_layout: { columns: 3, compact_header: true, top_split_ratio: 0.68, main_sidebar_ratio: 0.76, top_height: 560, bottom_height: 260 },
            panel_layout: [
              { id: 'hero', zone: 'topLeft', order: 0, visible: true, height: 120, width_units: 3 },
              { id: 'toolbar', zone: 'topLeft', order: 1, visible: true, height: 96, width_units: 3 },
              { id: 'input', zone: 'topLeft', order: 2, visible: true, height: 320, width_units: 2 },
              { id: 'output', zone: 'topRight', order: 3, visible: true, height: 320, width_units: 1 },
              { id: 'grid', zone: 'bottom', order: 4, visible: true, height: 380, width_units: 3 },
              { id: 'statusBar', zone: 'topRight', order: 5, visible: false, height: 72, width_units: 3 },
              { id: 'settings', zone: 'bottom', order: 6, visible: false, height: 260, width_units: 1 },
              { id: 'info', zone: 'sidebar', order: 7, visible: false, height: 260, width_units: 1 },
              { id: 'debug', zone: 'sidebar', order: 8, visible: false, height: 260, width_units: 1 },
              { id: 'diagnostics', zone: 'sidebar', order: 9, visible: false, height: 260, width_units: 1 },
              { id: 'preview', zone: 'sidebar', order: 10, visible: false, height: 220, width_units: 1 },
              { id: 'raw', zone: 'sidebar', order: 11, visible: false, height: 260, width_units: 1 }
            ]
          }
        })
      }) as Promise<Response>;
    }

    if (url === '/api/settings/project/ui' && init?.method === 'PUT') {
      const ui = JSON.parse(String(init.body));
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
          ui_preferences: ui
        })
      }) as Promise<Response>;
    }

    if (url === '/api/parse') {
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
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, updatedRecipe: { recipe_uid: 'recipe-1', recipe_type: 'ct_shaped', name: null, output: { raw: body.output_raw }, output_resolution: { display_name: 'Факел', icon_url: '/api/icons/torch' }, grid_w: 2, grid_h: 2, source: { kind: 'zs_file', path: 'scripts/test.zs' }, matrix: [[{ raw: '<minecraft:planks>' }, { raw: null }], [{ raw: null }, { raw: '<minecraft:stick>' }]] } }) }) as Promise<Response>;
    }

    if (url === '/api/recipes/create') {
      const body = JSON.parse(String(init?.body));
      return Promise.resolve({ ok: true, json: async () => ({ recipe_uid: 'new-recipe', recipe_type: 'ct_shaped', name: null, output: { raw: body.output ?? '<minecraft:stone>' }, output_resolution: null, grid_w: 3, grid_h: 3, source: { kind: 'generated', path: null }, matrix: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ raw: null }))) }) }) as Promise<Response>;
    }

    if (url === '/api/recipes/save-as') {
      const body = JSON.parse(String(init?.body));
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, new_uid: 'saved-1', recipe: { recipe_uid: 'saved-1', recipe_type: 'ct_shaped', name: null, output: { raw: body.output_raw }, output_resolution: { display_name: 'Факел', icon_url: '/api/icons/torch' }, grid_w: 2, grid_h: 2, source: { kind: 'zs_file', path: 'scripts/new_recipe.zs' }, matrix: [[{ raw: '<minecraft:planks>' }, { raw: null }], [{ raw: null }, { raw: '<minecraft:stick>' }]] } }) }) as Promise<Response>;
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  }) as typeof fetch;

  vi.spyOn(window, 'prompt').mockReturnValue('scripts/new_recipe.zs');
  vi.spyOn(window, 'open').mockImplementation(() => ({ closed: false } as Window));
});

test('shows minimal default layout and parses a recipe', async () => {
  render(<App />);
  expect(screen.getByText('Редактор рецептов')).toBeTruthy();
  expect(screen.getByText('Входной рецепт')).toBeTruthy();
  expect(screen.getByText('Инструменты')).toBeTruthy();
  expect(screen.queryByText('Быстрый debug')).toBeFalsy();

  fireEvent.paste(screen.getByLabelText('paste-input'), { clipboardData: { getData: () => 'recipes.addShaped(...)' } });
  await waitFor(() => expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:torch>'));
  expect(screen.getByText('scripts/test.zs')).toBeTruthy();
});

test('view menu can reveal hidden panels and compact header mode', async () => {
  render(<App />);
  fireEvent.click(screen.getByText('Вид'));
  fireEvent.click(screen.getAllByLabelText('Быстрый debug')[0]);
  await waitFor(() => expect(screen.getAllByText('Быстрый debug').length).toBeGreaterThan(0));

  const compactToggle = screen.getByLabelText('Компактный верх');
  fireEvent.click(compactToggle);
  await waitFor(() => expect((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(([url]) => url === '/api/settings/project/ui')).toBe(true));
});

test('column count can be switched up to 3 columns and persisted', async () => {
  render(<App />);
  fireEvent.click(screen.getByText('Вид'));
  fireEvent.change(screen.getByRole('combobox', { name: 'Колонки' }), { target: { value: '1' } });
  await waitFor(() => {
    const putCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url, init]) => url === '/api/settings/project/ui' && init?.method === 'PUT');
    const body = JSON.parse(String(putCalls.at(-1)?.[1]?.body));
    expect(body.workspace_layout.columns).toBe(1);
  });
});

test('drag and drop can move panels between workspace zones', async () => {
  render(<App />);
  const dragHandle = await screen.findByLabelText('Перетащить панель: Выходной рецепт');
  const targetSlot = document.querySelector('.zone-drop-slot[data-zone="topLeft"][data-index="1"]');
  expect(targetSlot).toBeTruthy();

  fireEvent.dragStart(dragHandle);
  fireEvent.dragOver(targetSlot as Element);
  fireEvent.drop(targetSlot as Element);
  fireEvent.dragEnd(dragHandle);

  await waitFor(() => {
    const headings = Array.from(document.querySelectorAll('.zone-top-left h2')).map((node) => node.textContent);
    expect(headings.includes('Выходной рецепт')).toBe(true);
  });

  await waitFor(() => {
    const putCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url, init]) => url === '/api/settings/project/ui' && init?.method === 'PUT');
    const body = JSON.parse(String(putCalls.at(-1)?.[1]?.body));
    const movedPanel = body.panel_layout.find((panel: { id: string; zone: string }) => panel.id === 'output');
    expect(movedPanel.zone).toBe('topLeft');
  });
});

test('zone layout still applies panel width units', async () => {
  render(<App />);
  const dragHandle = await screen.findByLabelText('Перетащить панель: Выходной рецепт');
  const shell = dragHandle.closest('.workspace-panel-shell') as HTMLElement | null;
  expect(shell).toBeTruthy();
  expect(shell?.style.gridColumn).toContain('span 4');
});

test('layout zone resizers update persisted workspace ratios', async () => {
  render(<App />);
  const mainSidebarResizer = await screen.findByLabelText('Изменить ширину основной области и sidebar');
  const layout = document.querySelector('.workspace-layout') as HTMLElement | null;
  expect(layout).toBeTruthy();
  expect(layout?.style.gridTemplateColumns).toContain('0.76fr');
  Object.defineProperty(layout, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0, toJSON: () => ({}) })
  });

  fireEvent.pointerDown(mainSidebarResizer, { clientX: 760, clientY: 0 });
  fireEvent.mouseMove(window, { clientX: 600, clientY: 0 });
  fireEvent.mouseUp(window);

  await waitFor(() => {
    const putCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url, init]) => url === '/api/settings/project/ui' && init?.method === 'PUT');
    const body = JSON.parse(String(putCalls.at(-1)?.[1]?.body));
    expect(body.workspace_layout.main_sidebar_ratio).not.toBe(0.76);
  });
});

test('toolbar actions still support save, save-as, create and help/wiki', async () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('paste-input'), { target: { value: 'recipes.addShaped(...)' } });
  fireEvent.click(screen.getByText('Вставить'));
  await waitFor(() => expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:torch>'));

  fireEvent.click(screen.getByText('Сохранить'));
  await waitFor(() => {
    expect((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(([url, init]) => url === '/api/recipes/recipe-1' && init?.method === 'PUT')).toBe(true);
  });

  fireEvent.click(screen.getByText('Сохранить как'));
  await waitFor(() => {
    expect((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(([url]) => url === '/api/recipes/save-as')).toBe(true);
  });

  fireEvent.click(screen.getByText('Создать новый'));
  await waitFor(() => expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:torch>'));

  fireEvent.click(screen.getByText('Справка'));
  expect(screen.getByRole('dialog', { name: 'Справка' })).toBeTruthy();

  fireEvent.click(screen.getByText('Вики'));
  expect(window.open).toHaveBeenCalled();
});
