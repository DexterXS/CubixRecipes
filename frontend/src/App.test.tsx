import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import App from './pages/App';

function createDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    dropEffect: 'copy',
    effectAllowed: 'copy',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: vi.fn((type?: string) => {
      if (type) {
        store.delete(type);
        return;
      }
      store.clear();
    }),
    getData: vi.fn((type: string) => store.get(type) ?? ''),
    setData: vi.fn((type: string, value: string) => {
      store.set(type, value);
    }),
    setDragImage: vi.fn()
  } as unknown as DataTransfer;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  window.localStorage.clear();
  class MockImage {
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;

    set src(_value: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }

  vi.stubGlobal('Image', MockImage);
  Object.assign(navigator, {
    clipboard: {
      readText: vi.fn().mockResolvedValue('recipes.addShaped(...)'),
      writeText: vi.fn().mockResolvedValue(undefined)
    }
  });

  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === '/itempanel.csv') {
      const csv = [
        'key,id,meta,has_nbt,display_ru,display_en',
        'gravisuite:advddrill,0,1,false,Advanced Diamond Drill,Advanced Diamond Drill',
        'minecraft:planks,5,0,false,Дубовые доски,Oak Planks',
        'minecraft:planks,5,1,false,Еловые доски,Spruce Planks',
        'minecraft:planks,5,2,false,Берёзовые доски,Birch Planks',
        'minecraft:stick,280,0,false,Палка,'
      ].join('\n');
      return Promise.resolve({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(csv).buffer
      }) as Promise<Response>;
    }

    if (url === '/itempanel-atlas.json') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          image_url: '/itempanel-atlas.png',
          tile_size: 32,
          columns: 2,
          rows: 3,
          entries: {
            '<gravisuite:advddrill:1>': { x: 0, y: 64, w: 32, h: 32, display_name: 'Advanced Diamond Drill', item_key: 'gravisuite:advddrill', meta: 1 },
            '<minecraft:planks>': { x: 0, y: 0, w: 32, h: 32, display_name: 'Дубовые доски', item_key: 'minecraft:planks', meta: 0 },
            '<minecraft:planks:1>': { x: 32, y: 0, w: 32, h: 32, display_name: 'Еловые доски', item_key: 'minecraft:planks', meta: 1 },
            '<minecraft:planks:2>': { x: 0, y: 32, w: 32, h: 32, display_name: 'Берёзовые доски', item_key: 'minecraft:planks', meta: 2 },
            '<minecraft:stick>': { x: 32, y: 32, w: 32, h: 32, display_name: 'Палка', item_key: 'minecraft:stick', meta: 0 }
          }
        })
      }) as Promise<Response>;
    }

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
            animations_enabled: true,
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
              [{ raw: '<minecraft:planks>', resolution: { display_name: 'Oak Planks', icon_url: '/api/icons/planks', animated: false } }, { raw: null }],
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

    if (url === '/api/recipes/search' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      const matches = body.output_item_raw === '<minecraft:planks>'
        ? [{
          recipe_uid: 'recipes-planks',
          recipe_type: 'ct_shaped',
          name: null,
          output: { raw: '<minecraft:planks>' },
          output_resolution: { display_name: 'Oak Planks', icon_url: '/api/icons/planks' },
          grid_w: 3,
          grid_h: 3,
          source: { kind: 'zs_file', path: 'Recipes/minecraft.zs' },
          matrix: [
            [{ raw: '<minecraft:stick>' }, { raw: null }, { raw: null }],
            [{ raw: null }, { raw: null }, { raw: null }],
            [{ raw: null }, { raw: null }, { raw: null }]
          ]
        }]
        : [];
      return Promise.resolve({ ok: true, json: async () => ({ matches }) }) as Promise<Response>;
    }

    if (url === '/api/recipes/recipes-planks' && init?.method === 'PUT') {
      const body = JSON.parse(String(init?.body));
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, updatedRecipe: { recipe_uid: 'recipes-planks', recipe_type: 'ct_shaped', name: null, output: { raw: body.output_raw }, output_resolution: { display_name: 'Oak Planks', icon_url: '/api/icons/planks' }, grid_w: 3, grid_h: 3, source: { kind: 'zs_file', path: 'Recipes/minecraft.zs' }, matrix: [[{ raw: '<minecraft:stick>' }, { raw: null }, { raw: null }], [{ raw: null }, { raw: null }, { raw: null }], [{ raw: null }, { raw: null }, { raw: null }]] } }) }) as Promise<Response>;
    }

    if (url === '/api/recipes/create') {
      const body = JSON.parse(String(init?.body));
      return Promise.resolve({ ok: true, json: async () => ({ recipe_uid: 'new-recipe', recipe_type: 'ct_shaped', name: null, output: { raw: body.output ?? '<minecraft:stone>' }, output_resolution: null, grid_w: 3, grid_h: 3, source: { kind: 'generated', path: null }, matrix: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ raw: null }))) }) }) as Promise<Response>;
    }

    if (url === '/api/recipes/save-as') {
      const body = JSON.parse(String(init?.body));
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, new_uid: 'saved-1', recipe: { recipe_uid: 'saved-1', recipe_type: 'ct_shaped', name: null, output: { raw: body.output_raw }, output_resolution: { display_name: 'Факел', icon_url: '/api/icons/torch' }, grid_w: 2, grid_h: 2, source: { kind: 'zs_file', path: 'scripts/new_recipe.zs' }, matrix: [[{ raw: '<minecraft:planks>' }, { raw: null }], [{ raw: null }, { raw: '<minecraft:stick>' }]] } }) }) as Promise<Response>;
    }

    if (url === '/api/items/resolve' && init?.method === 'POST') {
      const raw = JSON.parse(String(init.body)).item_raw as string;
      const icon = raw.includes('minecraft:stick') ? '/api/icons/stick' : '/api/icons/planks';
      return Promise.resolve({ ok: true, json: async () => ({ icon_url: icon, animated: false }) }) as Promise<Response>;
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  }) as typeof fetch;

  vi.spyOn(window, 'prompt').mockReturnValue('scripts/new_recipe.zs');
  vi.spyOn(window, 'open').mockImplementation(() => ({ closed: false } as Window));
});

test('shows minimal default layout and parses a recipe', async () => {
  render(<App />);
  expect(screen.getByRole('button', { name: 'Создать рецепт' })).toBeTruthy();
  expect(screen.getByText('Создатель рецепта')).toBeTruthy();
  expect(screen.getByText('Входной рецепт')).toBeTruthy();
  expect(screen.getByText('NEI предметы')).toBeTruthy();
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

test('static workspace renders panels without drag and drop controls', async () => {
  render(<App />);
  expect(await screen.findByText('Входной рецепт')).toBeTruthy();
  expect(screen.getByText('Создатель рецепта')).toBeTruthy();
  expect(document.querySelector('.zone-drop-slot')).toBeFalsy();
  expect(document.querySelector('.layout-resizer')).toBeFalsy();
  expect(screen.queryByLabelText('Перетащить панель: Выходной рецепт')).toBeFalsy();
});

test('recipe creator switches grid size and exposes dense NEI item icons', async () => {
  render(<App />);

  fireEvent.change(await screen.findByLabelText('recipe-grid-size'), { target: { value: '9' } });
  await waitFor(() => expect(document.querySelectorAll('.recipe-builder-grid input[aria-label^="cell-"]')).toHaveLength(81));
  expect(screen.getAllByText('9x9').length).toBeGreaterThan(0);

  const neiItems = await screen.findByLabelText('nei-items');
  expect(neiItems.querySelectorAll('.nei-item').length).toBeGreaterThan(0);
  expect(screen.getByLabelText('nei-item-<minecraft:planks>').getAttribute('title')).toContain('Дубовые доски');

  fireEvent.change(screen.getByLabelText('nei-search'), { target: { value: 'stick' } });
  await waitFor(() => expect(screen.getByLabelText('nei-item-<minecraft:stick>')).toBeTruthy());
  expect(screen.queryByLabelText('nei-item-<minecraft:planks>')).toBeFalsy();
});

test('dragging a NEI item into the craft grid renders the atlas icon in the cell', async () => {
  render(<App />);

  const item = await screen.findByLabelText('nei-item-<minecraft:planks>');
  const cellSlot = screen.getByLabelText('craft-cell-0-0');
  const dataTransfer = createDataTransfer();

  fireEvent.dragStart(item, { dataTransfer });
  fireEvent.dragOver(cellSlot, { dataTransfer });
  fireEvent.drop(cellSlot, { dataTransfer });
  fireEvent.dragEnd(item, { dataTransfer });

  await waitFor(() => {
    expect((screen.getByLabelText('cell-0-0') as HTMLInputElement).value).toBe('<minecraft:planks>');
    const atlasIcon = cellSlot.querySelector('.cell-atlas-icon') as HTMLElement | null;
    expect(atlasIcon).toBeTruthy();
    expect(atlasIcon?.style.backgroundImage).toContain('itempanel-atlas.png');
  });
});

test('wildcard item raws render the matching atlas icon instead of question marks', async () => {
  render(<App />);

  await screen.findByLabelText('nei-item-<gravisuite:advddrill:1>');
  fireEvent.change(screen.getByLabelText('output-raw'), { target: { value: '<gravisuite:advddrill:*>' } });
  fireEvent.change(screen.getByLabelText('cell-1-1'), { target: { value: '<gravisuite:advddrill:*>' } });

  await waitFor(() => {
    const outputIcon = document.querySelector('.craft-output-slot .cell-atlas-icon') as HTMLElement | null;
    const cellSlot = screen.getByLabelText('craft-cell-1-1');
    const cellIcon = cellSlot.querySelector('.cell-atlas-icon') as HTMLElement | null;
    expect(outputIcon).toBeTruthy();
    expect(cellIcon).toBeTruthy();
    expect(outputIcon?.style.backgroundPosition).toBe('0px -64px');
    expect(cellIcon?.style.backgroundPosition).toBe('0px -64px');
    expect(cellSlot.textContent).not.toContain('?');
  });
});

test('pressing R over a NEI item opens its Recipes source and save updates that recipe', async () => {
  render(<App />);

  fireEvent.mouseEnter(await screen.findByLabelText('nei-item-<minecraft:planks>'));
  fireEvent.keyDown(window, { key: 'r' });

  await waitFor(() => {
    expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:planks>');
    expect((screen.getByLabelText('cell-0-0') as HTMLInputElement).value).toBe('<minecraft:stick>');
  });

  fireEvent.click(document.querySelector('.action-toolbar button') as HTMLButtonElement);

  await waitFor(() => {
    const fetchCalls = global.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchCalls.mock.calls.some(([url]) => url === '/api/recipes/search')).toBe(true);
    expect(fetchCalls.mock.calls.some(([url, init]) => url === '/api/recipes/recipes-planks' && init?.method === 'PUT')).toBe(true);
  });
});

test('clicking outside craft cells drops the held NEI item from the cursor', async () => {
  render(<App />);

  fireEvent.click(await screen.findByLabelText('nei-item-<minecraft:planks>'));
  expect(document.querySelector('.held-item-cursor')).toBeTruthy();

  fireEvent.mouseDown(document.querySelector('.recipe-craft-board') as HTMLElement, { button: 0 });

  await waitFor(() => expect(document.querySelector('.held-item-cursor')).toBeFalsy());
});

test('holding left mouse with a held item paints multiple craft cells', async () => {
  render(<App />);

  fireEvent.click(await screen.findByLabelText('nei-item-<minecraft:planks>'));
  const cell00 = screen.getByLabelText('cell-0-0').closest('.grid-cell') as HTMLElement;
  const cell01 = screen.getByLabelText('cell-0-1').closest('.grid-cell') as HTMLElement;
  const cell10 = screen.getByLabelText('cell-1-0').closest('.grid-cell') as HTMLElement;

  fireEvent.mouseDown(cell00, { button: 0, buttons: 1 });
  fireEvent.mouseEnter(cell01, { buttons: 1 });
  fireEvent.mouseEnter(cell10, { buttons: 1 });
  fireEvent.mouseUp(cell10, { button: 0 });

  await waitFor(() => {
    expect((screen.getByLabelText('cell-0-0') as HTMLInputElement).value).toBe('<minecraft:planks>');
    expect((screen.getByLabelText('cell-0-1') as HTMLInputElement).value).toBe('<minecraft:planks>');
    expect((screen.getByLabelText('cell-1-0') as HTMLInputElement).value).toBe('<minecraft:planks>');
  });
});

test('holding right mouse with an empty cursor clears craft cells while passing over them', async () => {
  render(<App />);

  fireEvent.change(screen.getByLabelText('cell-0-0'), { target: { value: '<minecraft:planks>' } });
  fireEvent.change(screen.getByLabelText('cell-0-1'), { target: { value: '<minecraft:stick>' } });
  await waitFor(() => {
    expect((screen.getByLabelText('cell-0-0') as HTMLInputElement).value).toBe('<minecraft:planks>');
    expect((screen.getByLabelText('cell-0-1') as HTMLInputElement).value).toBe('<minecraft:stick>');
  });

  const cell00 = screen.getByLabelText('cell-0-0').closest('.grid-cell') as HTMLElement;
  const cell01 = screen.getByLabelText('cell-0-1').closest('.grid-cell') as HTMLElement;

  fireEvent.mouseDown(cell00, { button: 2, buttons: 2 });
  fireEvent.mouseEnter(cell01, { buttons: 2 });
  fireEvent.mouseUp(cell01, { button: 2 });

  await waitFor(() => {
    expect((screen.getByLabelText('cell-0-0') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('cell-0-1') as HTMLInputElement).value).toBe('');
  });
});

test('theme toggle switches between dark and light mode', async () => {
  render(<App />);
  const toggle = await screen.findByRole('button', { name: 'Светлая тема' });
  fireEvent.click(toggle);
  await waitFor(() => expect(document.querySelector('main')?.className).toContain('theme-light'));
  expect(document.documentElement.dataset.theme).toBe('light');
});

test('layout settings button saves the current workspace arrangement explicitly', async () => {
  render(<App />);
  fireEvent.click(screen.getByText('Настройки'));
  expect(screen.getByRole('dialog', { name: 'Настройки layout' })).toBeTruthy();

  fireEvent.click(screen.getByText('Сохранить текущее расположение окон'));

  await waitFor(() => {
    const putCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url, init]) => url === '/api/settings/project/ui' && init?.method === 'PUT');
    expect(putCalls.length).toBeGreaterThan(0);
  });
});

test('settings panel can disable icon animations and persist ui preference', async () => {
  render(<App />);
  fireEvent.click(screen.getByText('Вид'));
  fireEvent.click(screen.getAllByLabelText('Настройки')[0]);

  const animationsToggle = await screen.findByLabelText('Анимации иконок');
  fireEvent.click(animationsToggle);

  await waitFor(() => {
    const putCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url, init]) => url === '/api/settings/project/ui' && init?.method === 'PUT');
    const body = JSON.parse(String(putCalls.at(-1)?.[1]?.body));
    expect(body.animations_enabled).toBe(false);
  });
});

test('grid cell action buttons copy, clear and paste values', async () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('paste-input'), { target: { value: 'recipes.addShaped(...)' } });
  await waitFor(() => expect((screen.getByLabelText('cell-0-0') as HTMLInputElement).value).toBe('<minecraft:planks>'));

  fireEvent.click(screen.getByLabelText('copy-cell-0-0'));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('<minecraft:planks>');

  fireEvent.click(screen.getByLabelText('clear-cell-0-0'));
  await waitFor(() => expect((screen.getByLabelText('cell-0-0') as HTMLInputElement).value).toBe(''));

  (navigator.clipboard.readText as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('<minecraft:dirt>');
  fireEvent.click(screen.getByLabelText('paste-cell-0-0'));
  await waitFor(() => expect((screen.getByLabelText('cell-0-0') as HTMLInputElement).value).toBe('<minecraft:dirt>'));
});

test('grid icons update after clear and paste actions in icon mode', async () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('paste-input'), { target: { value: 'recipes.addShaped(...)' } });
  await waitFor(() => expect((screen.getByLabelText('cell-0-0') as HTMLInputElement).value).toBe('<minecraft:planks>'));

  fireEvent.click(screen.getByText('Вид'));
  fireEvent.click(screen.getAllByLabelText('Настройки')[0]);
  fireEvent.change(screen.getByLabelText('Режим отображения'), { target: { value: 'icons' } });

  const iconButton = screen.getByLabelText('open-craft-editor-0-0');
  await waitFor(() => expect(iconButton.querySelector('img')).toBeTruthy());

  fireEvent.click(screen.getByLabelText('clear-cell-0-0'));
  await waitFor(() => expect(iconButton.textContent).toContain('?'));

  (navigator.clipboard.readText as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('<minecraft:planks>');
  fireEvent.click(screen.getByLabelText('paste-cell-0-0'));
  await waitFor(() => expect(iconButton.querySelector('img')).toBeTruthy());
});

test('item search in craft modal supports ID, ID:meta, RU and EN names', async () => {
  render(<App />);
  const outputEditButton = document.querySelector('.output-icon-button') as HTMLElement | null;
  expect(outputEditButton).toBeTruthy();
  fireEvent.click(outputEditButton as HTMLElement);

  const searchInput = await screen.findByLabelText('item-search');
  const sourceTextarea = screen.getByLabelText('craft-source-modal') as HTMLTextAreaElement;

  fireEvent.change(searchInput, { target: { value: '5:1' } });
  const idMetaSuggestion = await screen.findByText('<minecraft:planks:1>');
  fireEvent.click(idMetaSuggestion);
  expect(sourceTextarea.value).toBe('<minecraft:planks:1>');

  fireEvent.change(searchInput, { target: { value: 'Берёзовые доски' } });
  const ruSuggestion = await screen.findByText('<minecraft:planks:2>');
  fireEvent.click(ruSuggestion);
  expect(sourceTextarea.value).toBe('<minecraft:planks:2>');

  fireEvent.change(searchInput, { target: { value: 'Oak Planks' } });
  const enSuggestion = await screen.findByText('<minecraft:planks>');
  fireEvent.click(enSuggestion);
  expect(sourceTextarea.value).toBe('<minecraft:planks>');
});

test('item search suggestion hides second title when displayEn is missing', async () => {
  render(<App />);
  const outputEditButton = document.querySelector('.output-icon-button') as HTMLElement | null;
  expect(outputEditButton).toBeTruthy();
  fireEvent.click(outputEditButton as HTMLElement);

  const searchInput = await screen.findByLabelText('item-search');
  fireEvent.change(searchInput, { target: { value: 'Палка' } });

  await screen.findByText('<minecraft:stick>');
  expect(screen.getAllByText('Палка')).toHaveLength(1);
});

test('item search suggestions render static item icons', async () => {
  render(<App />);
  const outputEditButton = document.querySelector('.output-icon-button') as HTMLElement | null;
  expect(outputEditButton).toBeTruthy();
  fireEvent.click(outputEditButton as HTMLElement);

  const searchInput = await screen.findByLabelText('item-search');
  fireEvent.change(searchInput, { target: { value: 'planks' } });

  await screen.findByText('<minecraft:planks>');
  await waitFor(() => {
    const icon = document.querySelector('.suggestion-icon-slot img') as HTMLImageElement | null;
    expect(icon?.getAttribute('src')).toContain('/api/icons/planks');
  });
});

test('item search icon cache is reused after page reload', async () => {
  const openAndSearch = async () => {
    const outputEditButton = document.querySelector('.output-icon-button') as HTMLElement | null;
    expect(outputEditButton).toBeTruthy();
    fireEvent.click(outputEditButton as HTMLElement);
    const searchInput = await screen.findByLabelText('item-search');
    fireEvent.change(searchInput, { target: { value: 'planks' } });
    await screen.findByText('<minecraft:planks>');
    await waitFor(() => {
      const icon = document.querySelector('.suggestion-icon-slot img') as HTMLImageElement | null;
      expect(icon?.getAttribute('src')).toContain('/api/icons/planks');
    });
  };

  render(<App />);
  await openAndSearch();
  const resolveCallsAfterFirstOpen = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === '/api/items/resolve').length;
  expect(resolveCallsAfterFirstOpen).toBeGreaterThan(0);

  cleanup();
  render(<App />);
  await openAndSearch();
  const resolveCallsAfterSecondOpen = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === '/api/items/resolve').length;
  expect(resolveCallsAfterSecondOpen).toBe(resolveCallsAfterFirstOpen);
});

test('structured item editor builds raw without empty withTag and appends NBT only when provided', async () => {
  render(<App />);
  const outputEditButton = document.querySelector('.output-icon-button') as HTMLElement | null;
  expect(outputEditButton).toBeTruthy();
  fireEvent.click(outputEditButton as HTMLElement);

  const modInput = await screen.findByLabelText('item-mod-input');
  const itemInput = screen.getByLabelText('item-name-input');
  const metaInput = screen.getByLabelText('item-meta-input');
  const sourceTextarea = screen.getByLabelText('craft-source-modal') as HTMLTextAreaElement;

  fireEvent.change(modInput, { target: { value: 'minecraft' } });
  fireEvent.change(itemInput, { target: { value: 'enchanted_book' } });
  fireEvent.change(metaInput, { target: { value: '0' } });
  fireEvent.click(screen.getByLabelText('build-raw-main'));
  expect(sourceTextarea.value).toBe('<minecraft:enchanted_book>');

  fireEvent.click(screen.getByLabelText('open-nbt-editor'));
  fireEvent.click(screen.getByLabelText('add-nbt-field'));
  const keyInput = await screen.findByLabelText(/nbt-key-/);
  const valueInput = await screen.findByLabelText(/nbt-value-/);
  fireEvent.change(keyInput, { target: { value: 'StoredEnchantments' } });
  fireEvent.change(valueInput, { target: { value: '[{lvl: 3 as short, id: 35 as short}]' } });
  fireEvent.click(screen.getByLabelText('build-raw-nbt'));
  expect(sourceTextarea.value).toBe('<minecraft:enchanted_book>.withTag({StoredEnchantments: [{lvl: 3 as short, id: 35 as short}]})');
});

test('structured NBT tree editor supports nested list+compound with typed fields', async () => {
  render(<App />);
  const outputEditButton = document.querySelector('.output-icon-button') as HTMLElement | null;
  expect(outputEditButton).toBeTruthy();
  fireEvent.click(outputEditButton as HTMLElement);

  const modInput = await screen.findByLabelText('item-mod-input');
  const itemInput = screen.getByLabelText('item-name-input');
  const metaInput = screen.getByLabelText('item-meta-input');
  const sourceTextarea = screen.getByLabelText('craft-source-modal') as HTMLTextAreaElement;

  fireEvent.change(modInput, { target: { value: 'minecraft' } });
  fireEvent.change(itemInput, { target: { value: 'enchanted_book' } });
  fireEvent.change(metaInput, { target: { value: '0' } });
  fireEvent.click(screen.getByLabelText('open-nbt-editor'));
  fireEvent.click(screen.getByLabelText('add-nbt-list'));

  fireEvent.change(screen.getByLabelText('nbt-key-0'), { target: { value: 'StoredEnchantments' } });
  fireEvent.change(screen.getByLabelText('nbt-type-root.0'), { target: { value: 'list' } });
  fireEvent.click(screen.getByLabelText('add-nbt-item-root.0'));
  fireEvent.change(screen.getByLabelText('nbt-type-root.0.0'), { target: { value: 'compound' } });
  fireEvent.click(screen.getByLabelText('add-nbt-child-root.0.0'));
  fireEvent.change(screen.getByLabelText('nbt-key-root.0.0-0'), { target: { value: 'lvl' } });
  fireEvent.change(screen.getByLabelText('nbt-value-root.0.0.0'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('nbt-type-root.0.0.0'), { target: { value: 'short' } });
  fireEvent.click(screen.getByLabelText('add-nbt-child-root.0.0'));
  fireEvent.change(screen.getByLabelText('nbt-key-root.0.0-1'), { target: { value: 'id' } });
  fireEvent.change(screen.getByLabelText('nbt-value-root.0.0.1'), { target: { value: '35' } });
  fireEvent.change(screen.getByLabelText('nbt-type-root.0.0.1'), { target: { value: 'short' } });

  fireEvent.click(screen.getByLabelText('build-raw-nbt'));
  expect(sourceTextarea.value).toBe('<minecraft:enchanted_book>.withTag({StoredEnchantments: [{lvl: 3 as short, id: 35 as short}]})');
});

test('toolbar keeps only save actions', async () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('paste-input'), { target: { value: 'recipes.addShaped(...)' } });
  await waitFor(() => expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:torch>'));

  fireEvent.click(screen.getByText('Сохранить'));
  await waitFor(() => {
    expect((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(([url, init]) => url === '/api/recipes/recipe-1' && init?.method === 'PUT')).toBe(true);
  });

  fireEvent.click(screen.getByText('Сохранить как'));
  await waitFor(() => {
    expect((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(([url]) => url === '/api/recipes/save-as')).toBe(true);
  });

  expect(document.querySelectorAll('.action-toolbar button')).toHaveLength(2);
  expect(screen.queryByText('Парсить')).toBeFalsy();
  expect(document.querySelector('.action-toolbar .tab-nav')).toBeFalsy();
});
test('manual text input with addShaped auto-parses after change', async () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('paste-input'), { target: { value: 'mods.avaritia.ExtremeCrafting.addShaped(<minecraft:glass>, [[<minecraft:stone>]])' } });
  await waitFor(() => expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:torch>'));
});

test('texture dropdown in toolbar shows mods from itempanel.csv', async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: 'Предметы' }));
  const openDropdownButton = await screen.findByRole('button', { name: 'Список модов' });
  fireEvent.click(openDropdownButton);
  fireEvent.click(screen.getByRole('button', { name: 'Загрузить в кэш' }));

  await waitFor(() => {
    expect(screen.getByText('minecraft')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText(/Выгружено: 100% \(4\/4\)/)).toBeTruthy();
  });
});

test('texture bulk load reuses cache and resolves only missing entries', async () => {
  window.localStorage.setItem('cubixrecipes:item-search-icon-cache-v1', JSON.stringify({
    '<minecraft:planks>': '/api/icons/planks'
  }));

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: 'Предметы' }));
  const openDropdownButton = await screen.findByRole('button', { name: 'Список модов' });
  fireEvent.click(openDropdownButton);
  fireEvent.click(screen.getByRole('button', { name: 'Загрузить в кэш' }));

  await waitFor(() => {
    expect(screen.getByText(/Выгружено: 100% \(4\/4\)/)).toBeTruthy();
  });

  const resolveCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === '/api/items/resolve');
  expect(resolveCalls).toHaveLength(3);
});

test('texture load can be paused and resumed with dedicated controls', async () => {
  const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
  const baseImplementation = fetchMock.getMockImplementation();
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/items/resolve' && init?.method === 'POST') {
      const raw = JSON.parse(String(init.body)).item_raw as string;
      const icon = raw.includes('minecraft:stick') ? '/api/icons/stick' : '/api/icons/planks';
      return new Promise((resolve) => {
        setTimeout(() => resolve({ ok: true, json: async () => ({ icon_url: icon, animated: false }) }), 45);
      }) as Promise<Response>;
    }
    return baseImplementation?.(input, init) as Promise<Response>;
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: 'Предметы' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Список модов' }));
  fireEvent.click(screen.getByRole('button', { name: 'Загрузить в кэш' }));

  const stopButton = await screen.findByRole('button', { name: 'Стоп' });
  fireEvent.click(stopButton);
  expect(await screen.findByRole('button', { name: 'Продолжить' })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
  await waitFor(() => {
    expect(screen.getByText(/Загрузка завершена/)).toBeTruthy();
  });
  expect(screen.queryByRole('button', { name: 'Стоп' })).toBeFalsy();
  expect(screen.queryByRole('button', { name: 'Продолжить' })).toBeFalsy();
  expect(screen.queryByRole('button', { name: 'Отмена' })).toBeFalsy();
});


test('itempanel titles use meta mapping, default meta=0 and keep unknown meta raw when fallback is off', async () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('paste-input'), { target: { value: 'recipes.addShaped(...)' } });

  const cellInput = await screen.findByLabelText('cell-0-0');
  await waitFor(() => expect(cellInput.getAttribute('title')).toBe('Дубовые доски'));

  fireEvent.change(cellInput, { target: { value: '<minecraft:planks:1>' } });
  await waitFor(() => expect(cellInput.getAttribute('title')).toBe('Еловые доски'));

  fireEvent.change(cellInput, { target: { value: '<minecraft:planks:99>' } });
  await waitFor(() => expect(cellInput.getAttribute('title')).toBe('<minecraft:planks:99>'));
});


test('shows backend unavailable inline message when parse request cannot reach api', async () => {
  (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/debug/log') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) }) as Promise<Response>;
    }
    if (url === '/api/settings/project' && (!init?.method || init.method === 'GET')) {
      return Promise.resolve({ ok: true, json: async () => ({ scripts_dir: 'scripts', mods_dir: '', assets_dir: '', recipe_db_path: '', extra_icon_sources: [], extra_recipe_sources: [], verbose_debug_logging: false, project_config_path: '/workspace/CubixRecipes/cubixrecipes.config.json', ui_preferences: { display_mode: 'text', animations_enabled: true, density_mode: 'normal', editor_mode: 'edit', language: 'ru', active_view_tab: 'editor', reset_layout_version: 4, workspace_layout: { columns: 3, compact_header: true, top_split_ratio: 0.68, main_sidebar_ratio: 0.76, top_height: 560, bottom_height: 260 }, panel_layout: [{ id: 'hero', zone: 'topLeft', order: 0, visible: true, height: 120, width_units: 3 }, { id: 'toolbar', zone: 'topLeft', order: 1, visible: true, height: 96, width_units: 3 }, { id: 'input', zone: 'topLeft', order: 2, visible: true, height: 320, width_units: 2 }, { id: 'output', zone: 'topRight', order: 3, visible: true, height: 320, width_units: 1 }, { id: 'grid', zone: 'bottom', order: 4, visible: true, height: 380, width_units: 3 }, { id: 'statusBar', zone: 'topRight', order: 5, visible: false, height: 72, width_units: 3 }, { id: 'settings', zone: 'bottom', order: 6, visible: false, height: 260, width_units: 1 }, { id: 'info', zone: 'sidebar', order: 7, visible: false, height: 260, width_units: 1 }, { id: 'debug', zone: 'sidebar', order: 8, visible: false, height: 260, width_units: 1 }, { id: 'diagnostics', zone: 'sidebar', order: 9, visible: false, height: 260, width_units: 1 }, { id: 'preview', zone: 'sidebar', order: 10, visible: false, height: 220, width_units: 1 }, { id: 'raw', zone: 'sidebar', order: 11, visible: false, height: 260, width_units: 1 }] } }) }) as Promise<Response>;
    }
    if (url === '/api/parse') {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    throw new Error(`Unexpected fetch call: ${url}`);
  });

  render(<App />);
  fireEvent.change(screen.getByLabelText('paste-input'), { target: { value: 'recipes.addShaped(...)' } });
  await waitFor(() => expect(screen.getByText(/Backend unavailable for \/api\/parse/)).toBeTruthy());
  expect(screen.getByText(/FastAPI backend недоступен/)).toBeTruthy();
  expect(document.body.textContent).toContain('dev proxy сейчас ожидает backend');
});


test('mutes repeated debug log attempts after backend network failure', async () => {
  let debugCalls = 0;
  (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/debug/log') {
      debugCalls += 1;
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    if (url === '/api/settings/project' && (!init?.method || init.method === 'GET')) {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    throw new Error(`Unexpected fetch call: ${url}`);
  });

  render(<App />);
  await waitFor(() => expect(screen.getByText(/Не удалось загрузить UI-настройки/)).toBeTruthy());
  expect(debugCalls).toBe(1);
});
