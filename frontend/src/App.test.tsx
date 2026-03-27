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
      readText: vi.fn().mockResolvedValue('recipes.addShaped(...)'),
      writeText: vi.fn().mockResolvedValue(undefined)
    }
  });

  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === '/itempanel.csv') {
      const csv = [
        'key,id,meta,has_nbt,display_ru,display_en',
        'minecraft:planks,5,0,false,Дубовые доски,Oak Planks',
        'minecraft:planks,5,1,false,Еловые доски,Spruce Planks',
        'minecraft:planks,5,2,false,Берёзовые доски,Birch Planks'
      ].join('\n');
      return Promise.resolve({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(csv).buffer
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
  fireEvent.click(screen.getByText('Собрать raw из полей'));
  expect(sourceTextarea.value).toBe('<minecraft:enchanted_book>');

  fireEvent.click(screen.getByText('+ NBT поле'));
  const keyInput = await screen.findByLabelText(/nbt-key-/);
  const valueInput = await screen.findByLabelText(/nbt-value-/);
  fireEvent.change(keyInput, { target: { value: 'StoredEnchantments' } });
  fireEvent.change(valueInput, { target: { value: '[{lvl: 3 as short, id: 35 as short}]' } });
  fireEvent.click(screen.getByText('Собрать raw из полей'));
  expect(sourceTextarea.value).toBe('<minecraft:enchanted_book>.withTag({StoredEnchantments: [{lvl: 3 as short, id: 35 as short}]})');
});

test('toolbar actions still support save, save-as, create and help/wiki', async () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('paste-input'), { target: { value: 'recipes.addShaped(...)' } });
  fireEvent.click(screen.getByText('Парсить'));
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


test('manual text input with addShaped auto-parses after change', async () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('paste-input'), { target: { value: 'mods.avaritia.ExtremeCrafting.addShaped(<minecraft:glass>, [[<minecraft:stone>]])' } });
  await waitFor(() => expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:torch>'));
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
