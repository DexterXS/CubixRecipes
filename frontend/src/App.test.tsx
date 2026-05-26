import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import App from './pages/App';
import { AuthUser } from './types';

const adminUser: AuthUser = {
  id: 1,
  email: 'root.user76@gmail.com',
  name: 'Root',
  avatar_url: null,
  role: 'admin',
  is_root_admin: true
};

const moderatorUser: AuthUser = {
  id: 2,
  email: 'moderator@example.com',
  name: 'Moderator',
  avatar_url: null,
  role: 'moderator',
  is_root_admin: false
};

const defaultUser: AuthUser = {
  id: 3,
  email: 'viewer@example.com',
  name: 'Viewer',
  avatar_url: null,
  role: 'default',
  is_root_admin: false
};

function projectSettings() {
  return {
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
      theme_mode: 'dark',
      ui_scale: 1.15,
      language: 'ru',
      active_view_tab: 'editor',
      reset_layout_version: 4,
      workspace_layout: { columns: 3, compact_header: true, top_split_ratio: 0.68, main_sidebar_ratio: 0.76, top_height: 560, bottom_height: 260 },
      panel_layout: []
    }
  };
}

beforeEach(() => {
  window.localStorage.clear();
  class MockImage {
    onload: null | (() => void) = null;
    set src(_value: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }
  vi.stubGlobal('Image', MockImage);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:recipe') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn(() => undefined) });

  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/itempanel.csv') {
      const csv = [
        'key,id,meta,has_nbt,display_ru,display_en',
        'minecraft:planks,5,0,false,Дубовые доски,Oak Planks',
        'minecraft:stick,280,0,false,Палка,Stick'
      ].join('\n');
      return Promise.resolve({ ok: true, arrayBuffer: async () => new TextEncoder().encode(csv).buffer }) as Promise<Response>;
    }
    if (url === '/itempanel-atlas.json') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          image_url: '/itempanel-atlas.png',
          tile_size: 32,
          columns: 1,
          rows: 2,
          entries: {
            '<minecraft:planks>': { x: 0, y: 0, w: 32, h: 32, display_name: 'Дубовые доски', item_key: 'minecraft:planks', meta: 0 },
            '<minecraft:stick>': { x: 0, y: 32, w: 32, h: 32, display_name: 'Палка', item_key: 'minecraft:stick', meta: 0 }
          }
        })
      }) as Promise<Response>;
    }
    if (url === '/api/debug/log') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) }) as Promise<Response>;
    }
    if (url === '/api/settings/project' && (!init?.method || init.method === 'GET')) {
      return Promise.resolve({ ok: true, json: async () => projectSettings() }) as Promise<Response>;
    }
    if (url === '/api/settings/project/ui' && init?.method === 'PUT') {
      const ui = JSON.parse(String(init.body));
      return Promise.resolve({ ok: true, json: async () => ({ ...projectSettings(), ui_preferences: ui }) }) as Promise<Response>;
    }
    if (url === '/api/admin/users') {
      return Promise.resolve({ ok: true, json: async () => ({ users: [adminUser, moderatorUser, defaultUser] }) }) as Promise<Response>;
    }
    if (url === '/api/admin/users/2/role' && init?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, user: { ...moderatorUser, role: 'admin' } }) }) as Promise<Response>;
    }
    if (url === '/api/parse') {
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => '',
        json: async () => ({
          kind: 'recipe',
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
              [{ raw: '<minecraft:planks>', resolution: { display_name: 'Дубовые доски', icon_url: '/api/icons/planks', animated: false } }, { raw: null }],
              [{ raw: null }, { raw: '<minecraft:stick>', resolution: { display_name: 'Палка', icon_url: '/api/icons/stick', animated: false } }]
            ]
          }
        })
      }) as Promise<Response>;
    }
    if (url === '/api/items/resolve' && init?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({ icon_url: '/api/icons/item', animated: false }) }) as Promise<Response>;
    }
    if (url === '/api/items/custom' && (!init?.method || init.method === 'GET')) {
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) }) as Promise<Response>;
    }
    if (url === '/api/items/custom' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, item: { id: 10, created_by_email: adminUser.email, owner_email: adminUser.email, created_at: null, updated_at: null, ...body } }) }) as Promise<Response>;
    }
    if (url === '/api/recipes/search-batch' && init?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({ matches: { '<minecraft:planks>': 1, '<minecraft:stick>': 0 } }) }) as Promise<Response>;
    }
    if (url === '/api/recipes/save-as') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, recipe: projectSettings() }) }) as Promise<Response>;
    }
    throw new Error(`Unexpected fetch call: ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('renders the cleaned static workspace for admins', async () => {
  render(<App authUser={adminUser} onLogout={vi.fn()} />);

  expect(screen.getByRole('button', { name: 'Главное меню' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Черновики' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Отладка' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Предметы' })).toBeFalsy();
  expect(screen.queryByRole('button', { name: 'Вид' })).toBeFalsy();
  expect(screen.getByText('Создать рецепт')).toBeTruthy();
  expect(screen.getByText('Файлы рецептов')).toBeTruthy();
  expect(screen.getByText('NEI предметы')).toBeTruthy();

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/admin/users', expect.anything()));
});

test('shows drafts for moderators but keeps debug/admin settings hidden from viewers', () => {
  render(<App authUser={moderatorUser} onLogout={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Черновики' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Отладка' })).toBeFalsy();
  cleanup();

  render(<App authUser={defaultUser} onLogout={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Черновики' })).toBeFalsy();
  expect(screen.queryByRole('button', { name: 'Отладка' })).toBeFalsy();
  expect(screen.queryByRole('button', { name: 'Настройки' })).toBeFalsy();
});

test('settings only keeps ui scale and staff role management', async () => {
  render(<App authUser={adminUser} onLogout={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Настройки' }));
  expect(screen.getByRole('dialog', { name: 'Настройки' })).toBeTruthy();
  expect(screen.getByLabelText('ui-scale')).toBeTruthy();
  expect(screen.getByText('Права персонала')).toBeTruthy();
  expect(screen.queryByText(/layout/i)).toBeFalsy();

  fireEvent.change(screen.getByLabelText('ui-scale'), { target: { value: '1.3' } });
  await waitFor(() => {
    const putCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url, init]) => url === '/api/settings/project/ui' && init?.method === 'PUT');
    expect(putCalls.length).toBeGreaterThan(0);
  });
});

test('local recipe file import loads the draft into the editor', async () => {
  const { container } = render(<App authUser={adminUser} onLogout={vi.fn()} />);
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  const source = 'recipes.addShaped(<minecraft:torch>, []);';
  const file = new File([source], 'torch.zs', { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: vi.fn(async () => source) });

  fireEvent.change(fileInput, { target: { files: [file] } });

  await waitFor(() => {
    const parseCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === '/api/parse');
    expect(parseCalls.length).toBeGreaterThan(0);
  });
  expect(await screen.findByText('torch.zs')).toBeTruthy();
  await waitFor(() => {
    expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:torch>');
  });
});

test('NEI context menu can save a personal custom item', async () => {
  render(<App authUser={adminUser} onLogout={vi.fn()} />);
  const item = await screen.findByLabelText('nei-item-<minecraft:planks>');

  fireEvent.contextMenu(item, { clientX: 120, clientY: 80 });
  fireEvent.click(await screen.findByRole('button', { name: 'Редактировать для себя' }));

  expect(screen.getByRole('dialog', { name: 'Редактор предмета' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('custom-item-name'), { target: { value: 'Разноцветные доски' } });
  fireEvent.change(screen.getByLabelText('custom-item-raw'), { target: { value: '<minecraft:planks:*>' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить предмет' }));

  await waitFor(() => {
    const saveCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url, init]) => url === '/api/items/custom' && init?.method === 'POST');
    expect(saveCalls.length).toBeGreaterThan(0);
    expect(String(saveCalls[0][1]?.body)).toContain('<minecraft:planks:*>');
  });
});
