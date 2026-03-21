import json
from zipfile import ZipFile
from pathlib import Path

from app.api.routes import create_app


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


def test_project_ui_preferences_update_is_lightweight(tmp_path: Path):
    config_path = tmp_path / 'cubixrecipes.config.json'
    app = create_app(config_path=str(config_path))
    put_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/settings/project/ui')

    response = put_route(type('UiRequest', (), {'model_dump': lambda self=None: {
        'display_mode': 'icons',
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
    assert response['ui_preferences']['panel_layout'][1]['height'] == 500
    stored = json.loads(config_path.read_text(encoding='utf-8'))
    assert stored['ui_preferences']['workspace_layout']['compact_header'] is True
