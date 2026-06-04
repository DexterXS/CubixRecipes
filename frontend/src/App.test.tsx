import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

let mockRecipeDraftTemplates: any[] = [];

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

function findLocalDraftPayload() {
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith('cubixrecipes:local-draft:v1:')) {
      return JSON.parse(window.localStorage.getItem(key) ?? '{}');
    }
  }
  return null;
}

function enableHotkeyDebug() {
  fireEvent.click(screen.getByRole('button', { name: 'Настройки' }));
  const dialog = screen.getByRole('dialog', { name: 'Настройки' });
  fireEvent.click(screen.getByLabelText('hotkey-debug-enabled'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
}

beforeEach(() => {
  window.localStorage.clear();
  mockRecipeDraftTemplates = [];
  class MockImage {
    onload: null | (() => void) = null;
    set src(_value: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }
  vi.stubGlobal('Image', MockImage);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:recipe') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn(() => undefined) });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/itempanel.csv') {
      const csv = [
        'key,id,meta,has_nbt,display_ru,display_en',
        'minecraft:planks,5,0,false,Дубовые доски,Oak Planks',
        'minecraft:stick,280,0,false,Палка,Stick',
        'examplemod:item,9000,0,false,First icon,First icon'
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
    if (url === '/api/mod-icons/atlas') {
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          manifest: {
            updatedAt: '2026-05-26T00:00:00+00:00',
            maxAtlasSize: 4096,
            fallbackAtlasUrl: '/api/itempanel/atlas.png',
            archives: [{ name: 'examplemod_x32.zip', size: 1024, modifiedAt: '2026-05-26T00:00:00+00:00' }],
            atlases: [{
              modid: 'examplemod',
              size: 32,
              page: 1,
              image_url: '/api/mod-icons/atlases/mod-icons-examplemod-x32-1.png',
              file: 'mod-icons-examplemod-x32-1.png',
              columns: 1,
              rows: 1,
              tileSize: 32,
              entries: { 'examplemod/First icon': { key: 'examplemod/First icon', modid: 'examplemod', iconName: 'First icon', size: 32, page: 1, atlasFile: 'mod-icons-examplemod-x32-1.png', image_url: '/api/mod-icons/atlases/mod-icons-examplemod-x32-1.png', x: 0, y: 0, w: 32, h: 32 } }
            }],
            entries: {
              x32: { 'examplemod/First icon': { key: 'examplemod/First icon', modid: 'examplemod', iconName: 'First icon', size: 32, page: 1, atlasFile: 'mod-icons-examplemod-x32-1.png', image_url: '/api/mod-icons/atlases/mod-icons-examplemod-x32-1.png', x: 0, y: 0, w: 32, h: 32 } },
              x256: {}
            },
            duplicates: [],
            rejected: [],
            totalMods: 1,
            totalIcons: 1
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
    if (url === '/api/admin/mod-icons') {
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          archives: [{ name: 'examplemod_x32.zip', size: 1024, modifiedAt: '2026-05-26T00:00:00+00:00' }],
          manifest: {
            updatedAt: '2026-05-26T00:00:00+00:00',
            maxAtlasSize: 4096,
            fallbackAtlasUrl: '/api/itempanel/atlas.png',
            archives: [{ name: 'examplemod_x32.zip', size: 1024, modifiedAt: '2026-05-26T00:00:00+00:00' }],
            atlases: [{
              modid: 'examplemod',
              size: 32,
              page: 1,
              image_url: '/api/admin/mod-icons/atlases/mod-icons-examplemod-x32-1.png',
              file: 'mod-icons-examplemod-x32-1.png',
              columns: 1,
              rows: 1,
              tileSize: 32,
              entries: { 'examplemod/First icon': { key: 'examplemod/First icon', modid: 'examplemod', iconName: 'First icon', size: 32, page: 1, atlasFile: 'mod-icons-examplemod-x32-1.png', image_url: '/api/admin/mod-icons/atlases/mod-icons-examplemod-x32-1.png', x: 0, y: 0, w: 32, h: 32 } }
            }],
            entries: {
              x32: { 'examplemod/First icon': { key: 'examplemod/First icon', modid: 'examplemod', iconName: 'First icon', size: 32, page: 1, atlasFile: 'mod-icons-examplemod-x32-1.png', image_url: '/api/admin/mod-icons/atlases/mod-icons-examplemod-x32-1.png', x: 0, y: 0, w: 32, h: 32 } },
              x256: {}
            },
            duplicates: [],
            rejected: [],
            totalMods: 1,
            totalIcons: 1
          },
          rules: { acceptedArchive: '.zip', acceptedFiles: ['modid_x32.zip', 'modid_x256.zip', 'PNG files inside modid_x32/ or modid_x256/'], maxAtlasSize: 4096 }
        })
      }) as Promise<Response>;
    }
    if (url === '/api/admin/mod-icons/generate' && init?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          manifest: {
            updatedAt: '2026-05-26T00:00:00+00:00',
            maxAtlasSize: 4096,
            fallbackAtlasUrl: '/api/itempanel/atlas.png',
            archives: [{ name: 'examplemod_x32.zip', size: 1024, modifiedAt: '2026-05-26T00:00:00+00:00' }],
            atlases: [],
            entries: { x32: {}, x256: {} },
            duplicates: [],
            rejected: [],
            totalMods: 1,
            totalIcons: 0
          }
        })
      }) as Promise<Response>;
    }
    if (url === '/api/admin/zs-cloud/files' && (!init?.method || init.method === 'GET')) {
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ files: [{ path: 'scripts/test.zs', name: 'test.zs', size: 88, modifiedAt: '2026-05-26T00:00:00+00:00', recipeCount: 1 }] })
      }) as Promise<Response>;
    }
    if (url.startsWith('/api/admin/zs-cloud/files/download')) {
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-disposition': "attachment; filename*=UTF-8''test.zs" }),
        blob: async () => new Blob(['recipes.addShaped(<minecraft:apple>, []);'])
      }) as Promise<Response>;
    }
    if (url === '/api/admin/zs-cloud/files/upload' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body ?? '{}'));
      if (body.filename === 'conflict.zs' && body.mode === 'fail') {
        return Promise.resolve({
          ok: false,
          status: 409,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ detail: 'File already exists: conflict.zs' })
        }) as Promise<Response>;
      }
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          path: `scripts/${body.filename}`,
          files: [{ path: `scripts/${body.filename}`, name: body.filename, size: String(body.text ?? '').length, modifiedAt: '2026-05-26T00:00:00+00:00', recipeCount: 1 }]
        })
      }) as Promise<Response>;
    }
    if (url === '/api/admin/zs-cloud/files/rename' && init?.method === 'PATCH') {
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, files: [{ path: 'scripts/renamed.zs', name: 'renamed.zs', size: 88, modifiedAt: '2026-05-26T00:00:00+00:00', recipeCount: 1 }] })
      }) as Promise<Response>;
    }
    if (url === '/api/admin/zs-cloud/files' && init?.method === 'DELETE') {
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, files: [] })
      }) as Promise<Response>;
    }
    if (url === '/api/admin/zs-cloud/backups') {
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ backups: [{ id: 'abc123abc123abcd', name: 'test.zs', originalPath: 'scripts/test.zs', size: 88, updatedAt: '2026-05-26T00:00:00+00:00' }] })
      }) as Promise<Response>;
    }
    if (url === '/api/parse') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const text = String(body.text ?? '');
      const outputRaw = text.match(/add(?:Shaped|Shapeless)\(\s*(<[^>]+>)/)?.[1] ?? '<minecraft:torch>';
      const outputName = outputRaw === '<minecraft:stick>' ? 'Палка' : outputRaw === '<minecraft:planks>' ? 'Дубовые доски' : 'Факел';
      const outputIcon = outputRaw === '<minecraft:stick>' ? '/api/icons/stick' : outputRaw === '<minecraft:planks>' ? '/api/icons/planks' : '/api/icons/torch';
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => '',
        json: async () => ({
          kind: 'recipe',
          recipe: {
            recipe_uid: outputRaw === '<minecraft:stick>' ? 'recipe-stick-draft' : 'recipe-1',
            recipe_type: text.includes('addShapeless') ? 'ct_shapeless' : 'ct_shaped',
            binding_mode: 'soft',
            name: null,
            output: { raw: outputRaw },
            output_resolution: { display_name: outputName, icon_url: outputIcon },
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
    if (url === '/api/recipe-drafts/templates' && (!init?.method || init.method === 'GET')) {
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ templates: mockRecipeDraftTemplates })
      }) as Promise<Response>;
    }
    if (url === '/api/recipe-drafts/templates' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body ?? '{}'));
      const template = {
        id: `server-draft-${mockRecipeDraftTemplates.length + 1}`,
        outputRaw: body.outputRaw,
        recipe: body.recipe,
        sourceText: body.sourceText,
        createdByEmail: adminUser.email,
        createdAt: 1770000000000 + mockRecipeDraftTemplates.length,
        updatedAt: 1770000000000 + mockRecipeDraftTemplates.length,
        name: body.name
      };
      mockRecipeDraftTemplates = [template, ...mockRecipeDraftTemplates];
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, template })
      }) as Promise<Response>;
    }
    if (url.startsWith('/api/recipe-drafts/templates/') && init?.method === 'DELETE') {
      const draftId = decodeURIComponent(url.split('/').pop() ?? '');
      mockRecipeDraftTemplates = mockRecipeDraftTemplates.filter((template) => template.id !== draftId);
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true })
      }) as Promise<Response>;
    }
    if (url === '/api/recipes/search-batch' && init?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({ matches: { '<minecraft:planks>': 1, '<minecraft:stick>': 0 } }) }) as Promise<Response>;
    }
    if (url === '/api/recipes/search' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      const match = body.output_item_raw === '<minecraft:planks>'
        ? {
          recipe_uid: 'recipe-planks',
          recipe_type: 'ct_shaped',
          name: null,
          output: { raw: '<minecraft:planks>' },
          output_resolution: { display_name: 'Дубовые доски', icon_url: '/api/icons/planks' },
          grid_w: 1,
          grid_h: 1,
          source: { kind: 'zs_file', path: 'scripts/planks.zs' },
          matrix: [[{ raw: '<minecraft:stick>', resolution: { display_name: 'Палка', icon_url: '/api/icons/stick', animated: false } }]]
        }
        : null;
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ matches: match ? [match] : [] })
      }) as Promise<Response>;
    }
    if (url === '/api/recipes/uses' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          matches: body.item_raw === '<minecraft:planks>' ? [{
            recipe_uid: 'recipe-uses-1',
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
          }] : []
        })
      }) as Promise<Response>;
    }
    if (url === '/api/recipes/create') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          recipe_uid: 'created-recipe',
          recipe_type: body.templateType ?? 'ct_shaped',
          binding_mode: body.bindingMode ?? 'soft',
          name: null,
          output: { raw: body.output ?? '<minecraft:stone>' },
          output_resolution: null,
          grid_w: body.grid ?? 3,
          grid_h: body.grid ?? 3,
          matrix: [[{ raw: null, resolution: null }]],
          source: { kind: 'generated', path: null }
        })
      }) as Promise<Response>;
    }
    if (url === '/api/recipes/save-as') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          new_uid: 'saved-recipe',
          recipe: {
            recipe_uid: 'saved-recipe',
            recipe_type: body.recipe_type ?? 'ct_shaped',
            binding_mode: body.binding_mode ?? 'soft',
            name: body.name ?? null,
            output: { raw: body.output_raw ?? '<minecraft:stone>' },
            output_resolution: null,
            grid_w: body.matrix?.[0]?.length ?? 1,
            grid_h: body.matrix?.length ?? 1,
            matrix: (body.matrix ?? [[null]]).map((row: Array<string | null>) => row.map((raw) => ({ raw, resolution: null }))),
            source: { kind: 'zs_file', path: body.target_path ?? 'recipe.zs' }
          }
        })
      }) as Promise<Response>;
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
  expect(screen.getByRole('button', { name: 'Иконки модов' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Облако .zs' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Отладка' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Предметы' })).toBeFalsy();
  expect(screen.queryByRole('button', { name: 'Вид' })).toBeFalsy();
  expect(screen.getByText('Создать рецепт')).toBeTruthy();
  expect(screen.getByText('Файлы рецептов')).toBeTruthy();
  expect(screen.getByText('NEI предметы')).toBeTruthy();

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/admin/users', expect.anything()));
});

test('admin mod icons tab shows archive and atlas status', async () => {
  render(<App authUser={adminUser} onLogout={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Иконки модов' }));

  expect(await screen.findByText('examplemod_x32.zip')).toBeTruthy();
  expect(await screen.findByText('Иконок')).toBeTruthy();
  expect(await screen.findByLabelText('mod-icon-examplemod/First icon-x32')).toBeTruthy();
});

test('NEI uses generated mod icon atlas entries matched by itempanel display name', async () => {
  render(<App authUser={adminUser} onLogout={vi.fn()} />);

  fireEvent.change(await screen.findByLabelText('nei-search'), { target: { value: 'examplemod' } });
  const item = await screen.findByLabelText('nei-item-<examplemod:item>');

  await waitFor(() => {
    const icon = item.querySelector('.nei-atlas-icon') as HTMLElement | null;
    expect(icon).toBeTruthy();
    expect(icon?.style.backgroundImage).toContain('mod-icons-examplemod-x32-1.png');
  });
});

test('cloud storage shows files and root backup only after Ctrl+B', async () => {
  render(<App authUser={adminUser} onLogout={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Облако .zs' }));

  expect(await screen.findByText('test.zs')).toBeTruthy();
  expect(screen.queryByText('ROOT backup')).toBeFalsy();
  fireEvent.keyDown(window, { key: 'b', code: 'KeyB', ctrlKey: true });

  expect(await screen.findByText('ROOT backup')).toBeTruthy();
  expect(await screen.findByLabelText('root-backup-files')).toBeTruthy();
});

test('shows drafts for moderators but keeps debug/admin settings hidden from viewers', () => {
  render(<App authUser={moderatorUser} onLogout={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Черновики' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Иконки модов' })).toBeFalsy();
  expect(screen.queryByRole('button', { name: 'Облако .zs' })).toBeFalsy();
  expect(screen.queryByRole('button', { name: 'Отладка' })).toBeFalsy();
  cleanup();

  render(<App authUser={defaultUser} onLogout={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Черновики' })).toBeFalsy();
  expect(screen.queryByRole('button', { name: 'Иконки модов' })).toBeFalsy();
  expect(screen.queryByRole('button', { name: 'Облако .zs' })).toBeFalsy();
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

test('cloud save uses a controlled filename modal instead of a path prompt', async () => {
  const promptSpy = vi.spyOn(window, 'prompt');
  render(<App authUser={adminUser} onLogout={vi.fn()} />);

  fireEvent.click(screen.getByLabelText('save-cloud'));

  expect(promptSpy).not.toHaveBeenCalled();
  const dialog = await screen.findByRole('dialog', { name: 'Сохранить рецепт в облако' });
  const filenameInput = within(dialog).getByLabelText('cloud-save-filename') as HTMLInputElement;
  fireEvent.change(filenameInput, { target: { value: 'scripts/unsafe.zs' } });

  expect(within(dialog).getByText('Имя файла должно быть без папок и переходов ..')).toBeTruthy();
  expect((within(dialog).getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true);

  fireEvent.change(filenameInput, { target: { value: 'safe_recipe.zs' } });
  await waitFor(() => expect(within(dialog).getByText('safe_recipe.zs')).toBeTruthy());
  const saveButton = within(dialog).getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement;
  expect(saveButton.disabled).toBe(false);
  fireEvent.click(saveButton);

  await waitFor(() => {
    const saveAsCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([url]) => url === '/api/recipes/save-as');
    expect(saveAsCall).toBeTruthy();
    const body = JSON.parse(String(saveAsCall?.[1]?.body ?? '{}'));
    expect(body.target_path).toBe('safe_recipe.zs');
  });
  expect(promptSpy).not.toHaveBeenCalled();
});

test('local recipe files can be selected for bulk download and deletion', async () => {
  const { container } = render(<App authUser={adminUser} onLogout={vi.fn()} />);
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  const firstSource = 'recipes.addShaped(<minecraft:torch>, []);';
  const secondSource = 'recipes.addShaped(<minecraft:stick>, []);';
  const firstFile = new File([firstSource], 'torch.zs', { type: 'text/plain' });
  const secondFile = new File([secondSource], 'stick.zs', { type: 'text/plain' });
  Object.defineProperty(firstFile, 'text', { value: vi.fn(async () => firstSource) });
  Object.defineProperty(secondFile, 'text', { value: vi.fn(async () => secondSource) });

  fireEvent.change(fileInput, { target: { files: [firstFile, secondFile] } });

  expect(await screen.findByText('torch.zs')).toBeTruthy();
  expect(await screen.findByText('stick.zs')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Скачать выбранные' })).toBeFalsy();

  fireEvent.click(screen.getByLabelText('Выбрать torch.zs'));
  fireEvent.click(screen.getByLabelText('Выбрать stick.zs'));

  expect(screen.getByText('Выбрано: 2')).toBeTruthy();
  const createObjectUrlCalls = (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Скачать выбранные' }));
  expect((URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(createObjectUrlCalls + 2);

  fireEvent.click(screen.getByRole('button', { name: 'Удалить выбранные' }));
  expect(screen.queryByText('torch.zs')).toBeFalsy();
  expect(screen.queryByText('stick.zs')).toBeFalsy();
  expect(screen.queryByRole('button', { name: 'Удалить выбранные' })).toBeFalsy();
});

test('recipe files panel uploads uploaded file content to cloud instead of current recipe', async () => {
  const { container } = render(<App authUser={adminUser} onLogout={vi.fn()} />);
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  const source = 'recipes.addShaped(<minecraft:torch>, [[<minecraft:planks>]]);';
  const file = new File([source], 'uploaded_file.zs', { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: vi.fn(async () => source) });

  fireEvent.change(fileInput, { target: { files: [file] } });
  expect(await screen.findByText('uploaded_file.zs')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('output-raw'), { target: { value: '<minecraft:stone>' } });

  const createObjectUrlCalls = (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
  fireEvent.click(screen.getByLabelText('download-active-draft'));
  expect((URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(createObjectUrlCalls + 1);

  fireEvent.click(screen.getByLabelText('upload-drafts-cloud'));

  await waitFor(() => {
    const uploadCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([url]) => url === '/api/admin/zs-cloud/files/upload');
    expect(uploadCall).toBeTruthy();
    const body = JSON.parse(String(uploadCall?.[1]?.body ?? '{}'));
    expect(body.filename).toBe('uploaded_file.zs');
    expect(body.text).toBe(source);
    expect(body.mode).toBe('fail');
  });
  const saveAsCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === '/api/recipes/save-as');
  expect(saveAsCalls.length).toBe(0);
});

test('recipe files cloud upload asks how to handle existing files', async () => {
  const { container } = render(<App authUser={adminUser} onLogout={vi.fn()} />);
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  const source = 'recipes.addShaped(<minecraft:stick>, [[<minecraft:planks>]]);';
  const file = new File([source], 'conflict.zs', { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: vi.fn(async () => source) });

  fireEvent.change(fileInput, { target: { files: [file] } });
  expect(await screen.findByText('conflict.zs')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('upload-drafts-cloud'));

  expect(await screen.findByLabelText('cloud-upload-conflict')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('cloud-upload-append'));

  await waitFor(() => {
    const uploadCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === '/api/admin/zs-cloud/files/upload');
    expect(uploadCalls.length).toBe(2);
    const retryBody = JSON.parse(String(uploadCalls[1]?.[1]?.body ?? '{}'));
    expect(retryBody.filename).toBe('conflict.zs');
    expect(retryBody.mode).toBe('append');
    expect(retryBody.text).toBe(source);
  });
});

test('local user draft survives a reload', async () => {
  const { container } = render(<App authUser={adminUser} onLogout={vi.fn()} />);
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  const source = 'recipes.addShaped(<minecraft:torch>, [[<minecraft:planks>]]);';
  const file = new File([source], 'torch.zs', { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: vi.fn(async () => source) });

  fireEvent.change(fileInput, { target: { files: [file] } });
  fireEvent.change(await screen.findByLabelText('nei-search'), { target: { value: 'planks' } });

  await waitFor(() => {
    const payload = findLocalDraftPayload();
    expect(payload?.state?.outputRaw).toBe('<minecraft:torch>');
    expect(payload?.state?.neiSearchQuery).toBe('planks');
    expect(payload?.craftHash).toBeTruthy();
  });

  cleanup();
  render(<App authUser={adminUser} onLogout={vi.fn()} />);

  expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:torch>');
  expect((screen.getByLabelText('nei-search') as HTMLInputElement).value).toBe('planks');
});

test('recipe builder supports 2x2, shapeless, and strict placement controls', async () => {
  render(<App authUser={adminUser} onLogout={vi.fn()} />);

  fireEvent.change(screen.getByLabelText('recipe-grid-size'), { target: { value: '2' } });
  expect(screen.getByLabelText('craft-cell-1-1')).toBeTruthy();
  expect(screen.queryByLabelText('craft-cell-2-2')).toBeFalsy();

  fireEvent.change(screen.getByLabelText('recipe-craft-mode'), { target: { value: 'shapeless' } });
  expect((screen.getByLabelText('recipe-binding-mode') as HTMLSelectElement).disabled).toBe(true);

  await waitFor(() => {
    const payload = findLocalDraftPayload();
    expect(payload?.state?.recipe.recipe_type).toBe('ct_shapeless');
  });

  fireEvent.change(screen.getByLabelText('recipe-craft-mode'), { target: { value: 'shaped' } });
  fireEvent.change(screen.getByLabelText('recipe-binding-mode'), { target: { value: 'strict' } });

  await waitFor(() => {
    const payload = findLocalDraftPayload();
    expect(payload?.state?.recipe.binding_mode).toBe('strict');
  });
});

test('saved recipe draft templates can be browsed, previewed, opened, and removed', async () => {
  render(<App authUser={adminUser} onLogout={vi.fn()} />);
  await screen.findByLabelText('nei-item-<minecraft:planks>');

  fireEvent.change(screen.getByLabelText('output-raw'), { target: { value: '<minecraft:planks>' } });
  fireEvent.click(screen.getByLabelText('save-draft-template'));
  await waitFor(() => expect(mockRecipeDraftTemplates.length).toBe(1));

  fireEvent.click(screen.getByRole('button', { name: 'Черновики' }));
  const draftItem = await screen.findByLabelText('draft-item-<minecraft:planks>');
  expect(draftItem.className).toContain('has-drafts');
  fireEvent.click(draftItem);

  const templateList = screen.getByLabelText('draft-template-list');
  const template = within(templateList).getByLabelText(/^draft-template-<minecraft:planks>-/);
  expect(within(template).getByText(adminUser.email)).toBeTruthy();
  expect(screen.queryByText('Только с черновиками')).toBeFalsy();
  expect(screen.getByLabelText('draft-template-preview')).toBeTruthy();

  fireEvent.click(template);
  expect(screen.getByLabelText('draft-template-list')).toBeTruthy();
  expect(screen.getByLabelText('draft-template-preview')).toBeTruthy();

  fireEvent.click(within(template).getByLabelText(/^edit-draft-template-/));
  expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:planks>');
  expect(screen.queryByLabelText('draft-template-list')).toBeFalsy();

  fireEvent.click(screen.getByRole('button', { name: 'Черновики' }));
  const reopenedTemplate = await screen.findByLabelText(/^draft-template-<minecraft:planks>-/);
  fireEvent.contextMenu(reopenedTemplate, { clientX: 120, clientY: 80 });
  fireEvent.click(screen.getByLabelText('delete-draft-template'));
  await waitFor(() => expect(screen.queryByLabelText(/^draft-template-<minecraft:planks>-/)).toBeFalsy());
});

test('admin can browse recipe draft templates created by moderators', async () => {
  mockRecipeDraftTemplates = [{
    id: 'moderator-template-1',
    outputRaw: '<minecraft:planks>',
    recipe: {
      recipe_uid: 'moderator-template-1',
      recipe_type: 'ct_shaped',
      binding_mode: 'soft',
      name: null,
      output: { raw: '<minecraft:planks>' },
      output_resolution: { display_name: 'Дубовые доски', icon_url: '/api/icons/planks' },
      grid_w: 1,
      grid_h: 1,
      source: { kind: 'local_draft', path: 'draft:<minecraft:planks>' },
      matrix: [[{ raw: '<minecraft:stick>', resolution: { display_name: 'Палка', icon_url: '/api/icons/stick', animated: false } }]]
    },
    sourceText: 'recipes.addShaped(<minecraft:planks>, [[<minecraft:stick>]]);',
    createdByEmail: moderatorUser.email,
    createdAt: 1770000000000,
    updatedAt: 1770000000000,
    name: 'Moderator planks template'
  }];

  render(<App authUser={adminUser} onLogout={vi.fn()} />);

  fireEvent.click(await screen.findByRole('button', { name: 'Черновики' }));
  const template = await screen.findByLabelText('draft-template-<minecraft:planks>-moderator-template-1');

  expect(within(template).getByText(moderatorUser.email)).toBeTruthy();
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

test('R opens a recipe from a hovered craft-grid item and history can return', async () => {
  const { container } = render(<App authUser={adminUser} onLogout={vi.fn()} />);
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  const source = 'recipes.addShaped(<minecraft:torch>, [[<minecraft:planks>]]);';
  const file = new File([source], 'torch.zs', { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: vi.fn(async () => source) });

  fireEvent.change(fileInput, { target: { files: [file] } });
  await waitFor(() => {
    expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:torch>');
  });

  const firstCell = screen.getByLabelText('craft-cell-0-0').closest('[data-craft-cell="true"]') as HTMLElement;
  fireEvent.mouseEnter(firstCell);
  fireEvent.keyDown(window, { key: 'r' });

  await waitFor(() => {
    expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:planks>');
  });

  fireEvent.click(screen.getByLabelText('recipe-history-back'));

  await waitFor(() => {
    expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:torch>');
  });
});

test('R opens a hovered NEI recipe even when search input keeps focus', async () => {
  render(<App authUser={adminUser} onLogout={vi.fn()} />);
  enableHotkeyDebug();
  const search = screen.getByLabelText('nei-search') as HTMLInputElement;
  const item = await screen.findByLabelText('nei-item-<minecraft:planks>');

  fireEvent.change(search, { target: { value: 'planks' } });
  search.focus();
  fireEvent.mouseEnter(item);
  fireEvent.keyDown(search, { key: 'к', code: 'KeyR' });

  await waitFor(() => {
    expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:planks>');
  });
  expect(screen.getByLabelText('recipe-hotkey-debug')).toBeTruthy();
  expect(screen.getByText('keydown captured')).toBeTruthy();
});

test('R falls back to a local uploaded draft when backend search has no match', async () => {
  const { container } = render(<App authUser={adminUser} onLogout={vi.fn()} />);
  enableHotkeyDebug();
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  const source = [
    'recipes.addShaped(<minecraft:torch>, [[<minecraft:planks>]]);',
    'recipes.addShaped(<minecraft:stick>, [[<minecraft:planks>]]);'
  ].join('\n');
  const file = new File([source], 'local-drafts.zs', { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: vi.fn(async () => source) });

  fireEvent.change(fileInput, { target: { files: [file] } });
  await waitFor(() => {
    expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:torch>');
  });

  const search = screen.getByLabelText('nei-search') as HTMLInputElement;
  const item = await screen.findByLabelText('nei-item-<minecraft:stick>');
  fireEvent.change(search, { target: { value: 'stick' } });
  fireEvent.mouseEnter(item);
  fireEvent.keyDown(window, { key: 'r', code: 'KeyR' });

  await waitFor(() => {
    expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:stick>');
  });
  expect(screen.getByText('uploaded draft cache hit')).toBeTruthy();
  expect(screen.getByText('uploaded draft recipe applied')).toBeTruthy();
});

test('U opens paged recipe uses for a hovered craft-grid item', async () => {
  const { container } = render(<App authUser={adminUser} onLogout={vi.fn()} />);
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  const source = 'recipes.addShaped(<minecraft:torch>, [[<minecraft:planks>]]);';
  const file = new File([source], 'torch.zs', { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: vi.fn(async () => source) });

  fireEvent.change(fileInput, { target: { files: [file] } });
  await waitFor(() => {
    expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:torch>');
  });

  const firstCell = screen.getByLabelText('craft-cell-0-0').closest('[data-craft-cell="true"]') as HTMLElement;
  fireEvent.mouseEnter(firstCell);
  fireEvent.keyDown(window, { key: 'г', code: 'KeyU' });

  const dialog = await screen.findByRole('dialog', { name: 'Использования предмета' });
  expect(dialog).toBeTruthy();
  expect(within(dialog).getByText('1/1')).toBeTruthy();
  await waitFor(() => {
    const usesCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === '/api/recipes/uses');
    expect(String(usesCalls[0][1]?.body)).toContain('<minecraft:planks>');
  });
});

test('U includes local uploaded draft uses when backend search has no match', async () => {
  const { container } = render(<App authUser={adminUser} onLogout={vi.fn()} />);
  enableHotkeyDebug();
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  const source = 'recipes.addShaped(<minecraft:torch>, [[<minecraft:stick>]]);';
  const file = new File([source], 'local-uses.zs', { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: vi.fn(async () => source) });

  fireEvent.change(fileInput, { target: { files: [file] } });
  await waitFor(() => {
    expect((screen.getByLabelText('output-raw') as HTMLInputElement).value).toBe('<minecraft:torch>');
  });

  const search = screen.getByLabelText('nei-search') as HTMLInputElement;
  const item = await screen.findByLabelText('nei-item-<minecraft:stick>');
  fireEvent.change(search, { target: { value: 'stick' } });
  fireEvent.mouseEnter(item);
  fireEvent.keyDown(window, { key: 'u', code: 'KeyU' });

  const dialog = await screen.findByRole('dialog');
  expect(dialog).toBeTruthy();
  expect(within(dialog).getByText('1/1')).toBeTruthy();
  expect(screen.getByText('uploaded draft uses parsed')).toBeTruthy();
});
