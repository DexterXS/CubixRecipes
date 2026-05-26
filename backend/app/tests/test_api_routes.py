import asyncio
import json
from pathlib import Path
from zipfile import ZipFile
import struct
import zlib

import pytest
from fastapi import HTTPException
from app.api.routes import create_app


def _write_rgba_png(path: Path, pixels: list[tuple[int, int, int, int]], width: int = 2) -> None:
    height = len(pixels) // width
    raw_rows = []
    for row in range(height):
        raw = bytearray()
        for r, g, b, a in pixels[row * width:(row + 1) * width]:
            raw.extend([r, g, b, a])
        raw_rows.append(b'\x00' + bytes(raw))
    payload = zlib.compress(b''.join(raw_rows))

    def chunk(name: bytes, data: bytes) -> bytes:
        body = name + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

    path.write_bytes(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', payload)
        + chunk(b'IEND', b'')
    )


def test_health_endpoint_is_available(tmp_path: Path):
    app = create_app(str(tmp_path))
    health_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/health')

    assert health_route() == {'ok': True}


def test_itempanel_atlas_routes_are_available(tmp_path: Path):
    icons_dir = tmp_path / 'itempanel_icons'
    icons_dir.mkdir()
    (tmp_path / 'itempanel.csv').write_text('Item Name,Item ID,Item meta,Has NBT,Display Name\nminecraft:stone,1,0,false,Stone\n', encoding='utf-8')
    _write_rgba_png(icons_dir / 'Stone.png', [(255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255), (255, 255, 0, 255)])
    app = create_app(config_path=str(tmp_path / 'cubixrecipes.config.json'))
    manifest_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/itempanel/atlas')
    png_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/itempanel/atlas.png')

    manifest = manifest_route()
    png_response = png_route()

    assert '<minecraft:stone>' in manifest['entries']
    assert png_response.media_type == 'image/png'
    assert png_response.body.startswith(b'\x89PNG\r\n\x1a\n')


def test_admin_mod_icon_archive_generates_atlas(tmp_path: Path):
    icon_path = tmp_path / 'icon.png'
    _write_rgba_png(icon_path, [(255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255), (255, 255, 0, 255)])
    archive_path = tmp_path / 'mods.zip'
    with ZipFile(archive_path, 'w') as archive:
        archive.write(icon_path, 'examplemod_x32.png')
        archive.write(icon_path, 'examplemod_x256.png')

    app = create_app(config_path=str(tmp_path / 'cubixrecipes.config.json'))
    upload_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/admin/mod-icons/archive')
    generate_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/admin/mod-icons/generate')
    atlas_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/admin/mod-icons/atlases/{filename}')

    class BodyRequest:
        headers = {}

        async def body(self):
            return archive_path.read_bytes()

    uploaded = asyncio.run(upload_route(BodyRequest(), filename='mods.zip', replace=False))
    generated = generate_route()
    first_atlas = generated['manifest']['atlases'][0]
    atlas_response = atlas_route(first_atlas['file'])

    assert uploaded['archive']['name'] == 'mods.zip'
    assert generated['manifest']['entries']['x32']['examplemod']['w'] == 32
    assert generated['manifest']['entries']['x256']['examplemod']['w'] == 256
    assert atlas_response.media_type == 'image/png'
    assert atlas_response.body.startswith(b'\x89PNG')


def test_admin_mod_icon_archive_rejects_unsupported_names(tmp_path: Path):
    icon_path = tmp_path / 'icon.png'
    _write_rgba_png(icon_path, [(255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255), (255, 255, 0, 255)])
    archive_path = tmp_path / 'mods.zip'
    with ZipFile(archive_path, 'w') as archive:
        archive.write(icon_path, 'ExampleMod_x32.png')

    app = create_app(config_path=str(tmp_path / 'cubixrecipes.config.json'))
    upload_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/admin/mod-icons/archive')

    class BodyRequest:
        headers = {}

        async def body(self):
            return archive_path.read_bytes()

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(upload_route(BodyRequest(), filename='mods.zip', replace=False))

    assert exc_info.value.status_code == 400
    assert 'unsupported files' in exc_info.value.detail


def test_save_as_accepts_generated_recipe(tmp_path: Path):
    app = create_app(str(tmp_path))
    save_as = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/recipes/save-as')

    response = save_as(
        type(
            'Request',
            (),
            {
                'recipe_uid': 'new-recipe',
                'recipe_type': 'ct_shaped',
                'output_raw': '<minecraft:torch>',
                'matrix': [['<minecraft:coal>', None], [None, '<minecraft:stick>']],
                'name': 'Torch Recipe',
                'target_path': str(tmp_path / 'saved.zs'),
            },
        )()
    )

    assert response['ok'] is True
    assert response['recipe']['name'] == 'Torch Recipe'
    assert response['recipe']['output']['raw'] == '<minecraft:torch>'
    assert response['recipe']['matrix'][0][0]['raw'] == '<minecraft:coal>'
    assert (tmp_path / 'saved.zs').read_text(encoding='utf-8').strip().startswith('recipes.addShaped("Torch Recipe"')


def test_admin_zs_cloud_can_rename_delete_and_keep_root_backup(tmp_path: Path):
    recipe_path = tmp_path / 'cloud.zs'
    recipe_path.write_text('recipes.addShaped(<minecraft:apple>, [[<minecraft:stick>]]);\n', encoding='utf-8')
    app = create_app(str(tmp_path), config_path=str(tmp_path / 'cubixrecipes.config.json'))
    list_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/admin/zs-cloud/files' and 'GET' in getattr(route, 'methods', set()))
    download_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/admin/zs-cloud/files/download')
    rename_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/admin/zs-cloud/files/rename')
    delete_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/admin/zs-cloud/files' and 'DELETE' in getattr(route, 'methods', set()))
    backup_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/admin/zs-cloud/backups')

    files = list_route()['files']
    assert [item['name'] for item in files] == ['cloud.zs']
    assert not any('.cubixrecipes_admin' in item['path'] for item in files)

    downloaded = download_route(path=str(recipe_path))
    renamed = rename_route(type('RenameRequest', (), {'path': str(recipe_path), 'new_name': 'renamed.zs'})())
    renamed_path = tmp_path / 'renamed.zs'
    deleted = delete_route(type('DeleteRequest', (), {'path': str(renamed_path)})())

    class RootRequest:
        state = type('State', (), {'auth_user': {'is_root_admin': True}})()

    backups = backup_route(RootRequest())['backups']

    assert downloaded.body.startswith(b'recipes.addShaped')
    assert renamed['files'][0]['name'] == 'renamed.zs'
    assert deleted['files'] == []
    assert not renamed_path.exists()
    assert any(item['name'] == 'cloud.zs' for item in backups)
    assert any(item['name'] == 'renamed.zs' for item in backups)
    assert list_route()['files'] == []




def test_save_as_trims_empty_recipe_border_for_simple_recipes(tmp_path: Path):
    app = create_app(str(tmp_path))
    save_as = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/recipes/save-as')

    response = save_as(
        type(
            'Request',
            (),
            {
                'recipe_uid': 'new-recipe',
                'recipe_type': 'ct_shaped',
                'output_raw': '<minecraft:chest>',
                'matrix': [
                    [None, None, None, None],
                    [None, '<minecraft:planks>', '<minecraft:planks>', None],
                    [None, '<minecraft:planks>', '<minecraft:planks>', None],
                    [None, None, None, None],
                ],
                'name': None,
                'target_path': str(tmp_path / 'trimmed.zs'),
            },
        )()
    )

    assert response['ok'] is True
    assert response['recipe']['grid_w'] == 2
    assert response['recipe']['grid_h'] == 2
    saved_text = (tmp_path / 'trimmed.zs').read_text(encoding='utf-8').strip()
    assert '[[<minecraft:planks>, <minecraft:planks>], [<minecraft:planks>, <minecraft:planks>]]' in saved_text


def test_save_as_rejects_target_path_outside_allowed_roots(tmp_path: Path):
    app = create_app(str(tmp_path))
    save_as = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/recipes/save-as')
    outside_path = tmp_path.parent / 'outside-save.zs'
    with pytest.raises(HTTPException) as exc:
        save_as(
            type(
                'Request',
                (),
                {
                    'recipe_uid': 'new-recipe',
                    'recipe_type': 'ct_shaped',
                    'output_raw': '<minecraft:chest>',
                    'matrix': [[None, '<minecraft:planks>']],
                    'name': None,
                    'target_path': str(outside_path),
                },
            )()
        )
    assert exc.value.status_code == 400

def test_update_existing_recipe_persists_changes(tmp_path: Path):
    recipe_file = tmp_path / 'recipes.zs'
    recipe_file.write_text('recipes.addShaped(<minecraft:torch>, [[<minecraft:coal>]]);\n', encoding='utf-8')
    app = create_app(str(tmp_path))
    search_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/recipes/search')
    update_route = next(
        route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/recipes/{recipe_uid}' and 'PUT' in getattr(route, 'methods', set())
    )

    recipe_uid = search_route(type('SearchRequest', (), {'output_item_raw': '<minecraft:torch>'})())['matches'][0]['recipe_uid']
    response = update_route(
        recipe_uid,
        type(
            'UpdateRequest',
            (),
            {
                'recipe_type': 'ct_shaped',
                'output_raw': '<minecraft:torch>',
                'matrix': [['<minecraft:redstone>']],
                'name': None,
            },
        )(),
    )

    assert response['updatedRecipe']['output']['raw'] == '<minecraft:torch>'
    assert response['updatedRecipe']['matrix'][0][0]['raw'] == '<minecraft:redstone>'
    assert '<minecraft:redstone>' in recipe_file.read_text(encoding='utf-8')


def test_recipe_uses_route_finds_ingredient_matches(tmp_path: Path):
    recipe_file = tmp_path / 'recipes.zs'
    recipe_file.write_text('recipes.addShaped(<minecraft:torch>, [[<minecraft:coal>], [<minecraft:stick>]]);\n', encoding='utf-8')
    app = create_app(str(tmp_path))
    uses_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/recipes/uses')

    response = uses_route(type('UsesRequest', (), {'item_raw': '<minecraft:stick:0>'})())

    assert response['matches'][0]['output']['raw'] == '<minecraft:torch>'
    assert response['matches'][0]['matrix'][1][0]['raw'] == '<minecraft:stick>'


def test_update_recipe_returns_404_when_recipe_uid_is_missing(tmp_path: Path):
    app = create_app(str(tmp_path))
    update_route = next(
        route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/recipes/{recipe_uid}' and 'PUT' in getattr(route, 'methods', set())
    )

    with pytest.raises(HTTPException) as exc:
        update_route(
            'missing-id',
            type(
                'UpdateRequest',
                (),
                {
                    'recipe_type': 'ct_shaped',
                    'output_raw': '<minecraft:torch>',
                    'matrix': [['<minecraft:redstone>']],
                    'name': None,
                },
            )(),
        )
    assert exc.value.status_code == 404


def test_project_settings_are_persisted_and_reload_storage(tmp_path: Path):
    scripts_dir = tmp_path / 'custom_scripts'
    scripts_dir.mkdir()
    (scripts_dir / 'recipe.zs').write_text('recipes.addShaped(<minecraft:apple>, [[<minecraft:stick>]]);\n', encoding='utf-8')
    config_path = tmp_path / 'cubixrecipes.config.json'
    app = create_app(config_path=str(config_path))

    get_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/settings/project' and 'GET' in getattr(route, 'methods', set()))
    put_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/settings/project' and 'PUT' in getattr(route, 'methods', set()))
    search_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/recipes/search')

    initial = get_route()
    assert initial['scripts_dir'] == 'scripts'

    updated = put_route(
        type(
            'SettingsRequest',
            (),
            {
                'model_dump': lambda self=None: {
                    'scripts_dir': str(scripts_dir),
                    'mods_dir': '',
                    'assets_dir': '',
                    'recipe_db_path': str(tmp_path / 'recipes.json'),
                    'extra_icon_sources': [],
                    'extra_recipe_sources': [],
                }
            },
        )()
    )

    assert updated['scripts_dir'] == str(scripts_dir)
    assert updated['validation']['scripts_dir']['exists'] is True
    matches = search_route(type('SearchRequest', (), {'output_item_raw': '<minecraft:apple>'})())['matches']
    assert len(matches) == 1
    assert config_path.exists()


def test_debug_summary_exposes_recipe_and_asset_diagnostics(tmp_path: Path):
    scripts_dir = tmp_path / 'scripts'
    scripts_dir.mkdir()
    (scripts_dir / 'recipe.zs').write_text('recipes.addShaped(<minecraft:apple>, [[<minecraft:stick>]]);\n', encoding='utf-8')
    assets_dir = tmp_path / 'assets'
    (assets_dir / 'assets' / 'minecraft' / 'textures' / 'items').mkdir(parents=True)
    (assets_dir / 'assets' / 'minecraft' / 'textures' / 'items' / 'apple.png').write_bytes(b'png')
    config_path = tmp_path / 'cubixrecipes.config.json'
    app = create_app(config_path=str(config_path))

    put_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/settings/project' and 'PUT' in getattr(route, 'methods', set()))
    debug_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/debug/summary')

    put_route(
        type(
            'SettingsRequest',
            (),
            {
                'model_dump': lambda self=None: {
                    'scripts_dir': str(scripts_dir),
                    'mods_dir': '',
                    'assets_dir': str(assets_dir),
                    'recipe_db_path': '',
                    'extra_icon_sources': [],
                    'extra_recipe_sources': [],
                }
            },
        )()
    )

    payload = debug_route()

    assert payload['summary']['recipes_scanned'] == 1
    assert payload['summary']['icons_found'] == 1
    assert payload['config']['assets_dir'] == str(assets_dir)
    assert payload['recipe_scan']['files'][0]['recipe_count'] == 1
    assert payload['asset_scan']['counters']['textures_items'] == 1


def test_debug_log_ingest_and_export(tmp_path: Path):
    app = create_app(str(tmp_path))
    post_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/debug/log' and 'POST' in getattr(route, 'methods', set()))
    get_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/debug/log' and 'GET' in getattr(route, 'methods', set()))

    request = type('LogRequest', (), {'model_dump': lambda self=None: {'source': 'FRONTEND', 'level': 'WARN', 'category': 'UI', 'message': 'Test event', 'details': {'clicked': True, 'raw_input': 'x' * 600}, 'verbose_only': False}})()
    post_route(request)
    post_route(request)
    payload = get_route(include_text=True, include_details=False)
    incremental = get_route(since_id=0, limit=10, include_details=True, include_text=True)

    assert payload['events'][-1]['message'] == 'Test event'
    assert payload['events'][-1]['repeat_count'] == 2
    assert payload['diagnostics']['bottleneck'] in {'snapshot', 'filter', 'serialize'}
    assert 'Test event' in incremental['exportText']
    assert incremental['events'][-1]['details']['raw_input'].endswith('…')


def test_asset_scan_reads_nested_jars_from_mods_dir_and_resolver_reports_sources(tmp_path: Path):
    mods_dir = tmp_path / 'mods'
    mods_dir.mkdir()
    archive_path = mods_dir / 'examplemod.jar'
    with ZipFile(archive_path, 'w') as archive:
        archive.writestr('assets/examplemod/textures/items/seed.png', b'png')

    config_path = tmp_path / 'cubixrecipes.config.json'
    app = create_app(config_path=str(config_path))

    put_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/settings/project' and 'PUT' in getattr(route, 'methods', set()))
    resolve_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/items/resolve')
    debug_assets_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/debug/assets')
    debug_resolver_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/debug/resolver')

    put_route(
        type(
            'SettingsRequest',
            (),
            {
                'model_dump': lambda self=None: {
                    'scripts_dir': 'scripts',
                    'mods_dir': str(mods_dir),
                    'assets_dir': '',
                    'recipe_db_path': '',
                    'extra_icon_sources': [],
                    'extra_recipe_sources': [],
                    'verbose_debug_logging': True,
                }
            },
        )()
    )

    resolved = resolve_route(type('ResolveRequest', (), {'item_raw': '<examplemod:seed>', 'settings': {}})())
    assets_payload = debug_assets_route()
    resolver_payload = debug_resolver_route()

    assert assets_payload['counters']['textures_items'] == 1
    assert any(source['nested_archives'] for source in assets_payload['sources'])
    assert resolved['icon_asset_id'] is not None
    assert any(entry['item_raw'] == '<examplemod:seed>' and entry['checked_sources'] for entry in resolver_payload['entries'])


def test_index_status_returns_404_for_unknown_scan_id(tmp_path: Path):
    app = create_app(str(tmp_path))
    status_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/index/status/{scan_id}')
    with pytest.raises(HTTPException) as exc:
        status_route('scan-missing')
    assert exc.value.status_code == 404


def test_icon_proxy_streams_binary_from_indexed_archive(tmp_path: Path):
    mods_dir = tmp_path / 'mods'
    mods_dir.mkdir()
    archive_path = mods_dir / 'examplemod.jar'
    with ZipFile(archive_path, 'w') as archive:
        archive.writestr('assets/examplemod/textures/items/seed.png', b'png-binary')

    app = create_app(config_path=str(tmp_path / 'cubixrecipes.config.json'))
    put_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/settings/project' and 'PUT' in getattr(route, 'methods', set()))
    resolve_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/items/resolve')
    icon_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/icons/{icon_asset_id:path}')

    put_route(
        type(
            'SettingsRequest',
            (),
            {
                'model_dump': lambda self=None: {
                    'scripts_dir': 'scripts',
                    'mods_dir': str(mods_dir),
                    'assets_dir': '',
                    'recipe_db_path': '',
                    'extra_icon_sources': [],
                    'extra_recipe_sources': [],
                }
            },
        )()
    )
    resolved = resolve_route(type('ResolveRequest', (), {'item_raw': '<examplemod:seed>', 'settings': {}})())
    encoded_asset_id = resolved['icon_url'].split('/api/icons/', 1)[1]
    response = icon_route(encoded_asset_id)

    assert response.media_type == 'image/png'
    assert response.body == b'png-binary'
    assert '%' in resolved['icon_url']


def test_itempanel_icon_catalog_resolves_before_asset_scan(tmp_path: Path):
    icons_dir = tmp_path / 'itempanel_icons'
    icons_dir.mkdir()
    (tmp_path / 'itempanel.csv').write_text('Item Name,Item ID,Item meta,Has NBT,Display Name\nminecraft:stone,1,0,false,Камень\n', encoding='cp1251')
    _write_rgba_png(icons_dir / 'Камень.png', [(255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255), (255, 255, 0, 255)])

    app = create_app(config_path=str(tmp_path / 'cubixrecipes.config.json'))
    resolve_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/items/resolve')
    icon_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/icons/{icon_asset_id:path}')

    resolved = resolve_route(type('ResolveRequest', (), {'item_raw': '<minecraft:stone>', 'settings': {}})())
    encoded_asset_id = resolved['icon_url'].split('/api/icons/', 1)[1]
    response = icon_route(encoded_asset_id)

    assert resolved['strategy'] == 'itempanel_icon_catalog'
    assert resolved['display_name'] == 'Камень'
    assert response.media_type == 'image/png'
    assert response.body.startswith(b'\x89PNG')


def test_asset_scan_registers_icons_from_mods_json_tree(tmp_path: Path):
    manifest_path = tmp_path / 'examplemod.jar.json'
    manifest_payload = {
        'mod_name': 'examplemod',
        'mod_path': str(tmp_path / 'mods' / 'examplemod.jar'),
        'mod_type': 'jar',
        'tree': {
            'assets': {
                'type': 'directory',
                'children': {
                    'examplemod': {
                        'type': 'directory',
                        'children': {
                            'textures': {
                                'type': 'directory',
                                'children': {
                                    'items': {
                                        'type': 'directory',
                                        'children': {
                                            'seed.png': {'type': 'file', 'extension': '.png', 'size': 10},
                                            'seed.png.mcmeta': {'type': 'file', 'extension': '.mcmeta', 'size': 10},
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }
        },
    }
    manifest_path.write_text(json.dumps(manifest_payload), encoding='utf-8')

    app = create_app(config_path=str(tmp_path / 'cubixrecipes.config.json'))
    put_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/settings/project' and 'PUT' in getattr(route, 'methods', set()))
    resolve_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/items/resolve')

    put_route(
        type(
            'SettingsRequest',
            (),
            {
                'model_dump': lambda self=None: {
                    'scripts_dir': 'scripts',
                    'mods_dir': '',
                    'assets_dir': '',
                    'recipe_db_path': '',
                    'extra_icon_sources': [str(tmp_path)],
                    'extra_recipe_sources': [],
                }
            },
        )()
    )
    resolved = resolve_route(type('ResolveRequest', (), {'item_raw': '<examplemod:seed>', 'settings': {}})())

    assert resolved['icon_asset_id'] is not None
    assert resolved['animated'] is True


def test_project_ui_preferences_update_is_lightweight(tmp_path: Path):
    config_path = tmp_path / 'cubixrecipes.config.json'
    app = create_app(config_path=str(config_path))
    put_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/settings/project/ui')

    response = put_route(type('UiRequest', (), {'model_dump': lambda self=None: {
        'display_mode': 'icons',
        'animations_enabled': False,
        'density_mode': 'compact',
        'editor_mode': 'edit',
        'language': 'ru',
        'active_view_tab': 'editor',
        'reset_layout_version': 4,
        'workspace_layout': {'columns': 2, 'compact_header': True},
        'panel_layout': [
            {'id': 'hero', 'zone': 'topLeft', 'order': 0, 'visible': True, 'height': 120, 'width_units': 3},
            {'id': 'input', 'zone': 'topLeft', 'order': 1, 'visible': True, 'height': 500, 'width_units': 2},
            {'id': 'output', 'zone': 'topRight', 'order': 2, 'visible': True, 'height': 420, 'width_units': 1},
        ],
    }})())

    assert response['ui_preferences']['workspace_layout']['columns'] == 2
    assert response['ui_preferences']['animations_enabled'] is False
    assert response['ui_preferences']['panel_layout'][1]['height'] == 500
    stored = json.loads(config_path.read_text(encoding='utf-8'))
    assert stored['ui_preferences']['workspace_layout']['compact_header'] is True


def test_parse_route_tolerates_invalid_model_texture_reference(tmp_path: Path):
    assets_dir = tmp_path / 'assets'
    model_dir = assets_dir / 'assets' / 'energyadditions' / 'models' / 'item'
    model_dir.mkdir(parents=True)
    (model_dir / 'easolartype10.json').write_text('{"textures": {"layer0": "#missing"}}', encoding='utf-8')
    config_path = tmp_path / 'cubixrecipes.config.json'
    app = create_app(config_path=str(config_path))

    put_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/settings/project' and 'PUT' in getattr(route, 'methods', set()))
    parse_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/parse')

    put_route(
        type(
            'SettingsRequest',
            (),
            {
                'model_dump': lambda self=None: {
                    'scripts_dir': 'scripts',
                    'mods_dir': '',
                    'assets_dir': str(assets_dir),
                    'recipe_db_path': '',
                    'extra_icon_sources': [],
                    'extra_recipe_sources': [],
                    'verbose_debug_logging': True,
                }
            },
        )()
    )

    response = parse_route(type('ParseRequest', (), {'text': 'mods.avaritia.ExtremeCrafting.addShaped(<energyadditions:easolartype10>, [[<energyadditions:easolartype10>]]);'})())

    assert response['kind'] == 'recipe'
    assert response['recipe']['output']['raw'] == '<energyadditions:easolartype10>'
    assert response['recipe']['output_resolution']['strategy'] == 'placeholder'
