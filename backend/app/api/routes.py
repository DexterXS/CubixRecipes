from __future__ import annotations

import json
from pathlib import Path
from time import perf_counter
from typing import Any, Optional
from zipfile import ZipFile

from fastapi import APIRouter, FastAPI, HTTPException, Response
from fastapi.responses import PlainTextResponse

from app.api.schemas import CreateFileRequest, CreateRecipeRequest, DebugLogEventRequest, IndexScanRequest, ParseRequest, ProjectSettingsRequest, ResolveRequest, SaveAsRequest, SearchRequest, UiPreferencesRequest, UpdateRecipeRequest
from app.config.project_config import ProjectConfigService
from app.debug.debug_service import DebugService
from app.debug.log_service import DebugLogService
from app.domain.models import Recipe
from app.indexer.asset_index import AssetIndex
from app.parsers.recipe_parser import RecipeParser
from app.resolver.item_resolver import ItemResolver
from app.services.recipe_service import RecipeService
from app.storage.zs_storage import ZsStorage


def serialize_recipe(recipe: Recipe) -> dict:
    return {
        'recipe_uid': recipe.recipe_uid,
        'recipe_type': recipe.recipe_type,
        'name': recipe.name,
        'output': {
            'raw': recipe.output.raw,
            'modid': recipe.output.modid,
            'name': recipe.output.name,
            'metaKind': recipe.output.meta_mode.value,
            'metaValue': recipe.output.meta_value,
        },
        'output_resolution': recipe.output_resolution,
        'grid_w': recipe.grid_w,
        'grid_h': recipe.grid_h,
        'matrix': [
            [
                {
                    'raw': cell.raw,
                    'parsed': None if cell.item is None else {
                        'modid': cell.item.modid,
                        'name': cell.item.name,
                        'metaKind': cell.item.meta_mode.value,
                        'metaValue': cell.item.meta_value,
                    },
                    'resolution': cell.resolution,
                }
                for cell in row
            ]
            for row in recipe.matrix
        ],
        'source': {
            'kind': recipe.source.kind,
            'path': recipe.source.path,
            'start_offset': recipe.source.start_offset,
            'end_offset': recipe.source.end_offset,
        },
        'diagnostics': {'parseWarnings': recipe.diagnostics, 'resolverHints': []},
    }


def _resolve_recipe_items(recipe: Recipe, resolver: ItemResolver, debug_service: DebugService) -> Recipe:
    output_resolution = resolver.resolve(recipe.output)
    debug_service.record_resolver(recipe.output.raw, recipe.output.base_key, output_resolution, resolver.last_resolution_details.get(recipe.output.raw))
    recipe.output_resolution = output_resolution.__dict__
    for row in recipe.matrix:
        for cell in row:
            if cell.item is None:
                cell.resolution = None
            else:
                resolved = resolver.resolve(cell.item)
                debug_service.record_resolver(cell.item.raw, cell.item.base_key, resolved, resolver.last_resolution_details.get(cell.item.raw))
                cell.resolution = resolved.__dict__
    return recipe


def _log_api(log_service: DebugLogService, method: str, path: str, payload: dict[str, Any], status: str, started_at: float, response_body: Any = None, level: str = 'INFO') -> None:
    duration_ms = round((perf_counter() - started_at) * 1000, 2)
    details = {'method': method, 'path': path, 'payload': payload, 'status': status, 'duration_ms': duration_ms}
    if response_body is not None:
        details['response'] = response_body
    log_service.log('API', level, 'API', f'{method} {path} -> {status}', details, verbose_only=(level == 'INFO'))


def create_app(scripts_dir: str = 'scripts', config_path: Optional[str] = None) -> FastAPI:
    parser = RecipeParser()
    config_service = ProjectConfigService(Path(config_path) if config_path else None)
    config = config_service.load()
    raw_config_payload = {}
    config_path_obj = Path(config.project_config_path)
    if config_path_obj.exists():
        try:
            raw_config_payload = json.loads(config_path_obj.read_text(encoding='utf-8'))
        except Exception:
            raw_config_payload = {'_raw': config_path_obj.read_text(encoding='utf-8', errors='replace')[:2000]}
    log_service = DebugLogService(verbose=config.verbose_debug_logging)
    debug_service = DebugService(config_service)
    active_scripts_dir = scripts_dir if scripts_dir != 'scripts' else config.scripts_dir
    storage = ZsStorage(active_scripts_dir, log_service=log_service)
    storage.scan(extra_paths=config.extra_recipe_sources)
    asset_index = AssetIndex(log_service=log_service)
    resolver = ItemResolver(asset_index, log_service=log_service)
    index_paths = config_service.build_index_paths(config)
    if index_paths:
        asset_index.scan_paths(index_paths)
    debug_service.update_config(config, used_recipe_paths=config_service.build_recipe_scan_paths(config), used_asset_paths=index_paths)
    debug_service.record_recipe_scan(storage.last_scan_report)
    debug_service.record_asset_scan(asset_index.last_scan_report)
    service = RecipeService(storage, parser)

    log_service.log('BACKEND', 'INFO', 'CONFIG', 'Application bootstrapped', {
        'config_file': config.project_config_path,
        'raw_config_payload': raw_config_payload,
        'normalized_config': config_service.as_api_dict(config),
        'final_index_paths': index_paths,
        'final_recipe_scan_paths': config_service.build_recipe_scan_paths(config),
        'scripts_dir': active_scripts_dir,
        'verbose_debug_logging': config.verbose_debug_logging,
    })

    router = APIRouter(prefix='/api')

    @router.post('/parse')
    def parse_route(request: ParseRequest):
        started_at = perf_counter()
        log_service.log('API', 'INFO', 'API', 'POST /api/parse received', {'payload': {'text_length': len(request.text), 'preview': request.text[:200]}})
        try:
            parsed = service.parse_text(request.text)
        except Exception as exc:
            debug_service.record_parse(debug_service.build_parse_error(request.text, exc))
            log_service.log('BACKEND', 'ERROR', 'PARSE', 'Parse failed', {'error': str(exc), 'error_type': exc.__class__.__name__, 'raw_input': request.text[:500]})
            _log_api(log_service, 'POST', '/api/parse', {'text_length': len(request.text)}, '400', started_at, {'detail': str(exc)}, level='ERROR')
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if parsed.kind == 'item_query':
            _log_api(log_service, 'POST', '/api/parse', {'text_length': len(request.text)}, '200', started_at, {'kind': parsed.kind})
            return {'kind': parsed.kind, 'item': parsed.item.__dict__}
        recipe = _resolve_recipe_items(parsed.recipe, resolver, debug_service)
        debug_service.record_parse(debug_service.build_parse_diagnostic_for_recipe(request.text, recipe))
        log_service.log('RESOLVER', 'INFO', 'ICON', 'Icon lookup completed for parsed recipe', {
            'recipe_uid': recipe.recipe_uid,
            'output_raw': recipe.output.raw,
            'output_icon_url': recipe.output_resolution.get('icon_url') if recipe.output_resolution else None,
            'resolved_cells': sum(1 for row in recipe.matrix for cell in row if cell.resolution and cell.resolution.get('icon_url')),
        })
        log_service.log('BACKEND', 'INFO', 'PARSE', 'Recipe parsed', {
            'recipe_type': recipe.recipe_type,
            'output': recipe.output.raw,
            'grid': f'{recipe.grid_w}x{recipe.grid_h}',
            'parsed_cells': sum(1 for row in recipe.matrix for cell in row if cell.item is not None),
            'null_cells': sum(1 for row in recipe.matrix for cell in row if cell.raw is None),
            'warnings': list(recipe.diagnostics),
            'raw_input': request.text[:500],
        })
        response_body = {'kind': parsed.kind, 'recipe_uid': recipe.recipe_uid, 'output': recipe.output.raw}
        _log_api(log_service, 'POST', '/api/parse', {'text_length': len(request.text)}, '200', started_at, response_body)
        return {'kind': parsed.kind, 'recipe': serialize_recipe(recipe)}

    @router.post('/recipes/search')
    def search_route(request: SearchRequest):
        started_at = perf_counter()
        matches = [serialize_recipe(_resolve_recipe_items(recipe, resolver, debug_service)) for recipe in storage.search_by_output(request.output_item_raw)]
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Recipe search completed', {'output_item_raw': request.output_item_raw, 'matches': len(matches)})
        _log_api(log_service, 'POST', '/api/recipes/search', {'output_item_raw': request.output_item_raw}, '200', started_at, {'matches': len(matches)})
        return {'matches': matches}

    @router.get('/recipes/{recipe_uid}')
    def get_recipe(recipe_uid: str):
        started_at = perf_counter()
        try:
            recipe = serialize_recipe(_resolve_recipe_items(storage.get_recipe(recipe_uid), resolver, debug_service))
            _log_api(log_service, 'GET', f'/api/recipes/{recipe_uid}', {}, '200', started_at, {'recipe_uid': recipe_uid})
            return recipe
        except KeyError as exc:
            _log_api(log_service, 'GET', f'/api/recipes/{recipe_uid}', {}, '404', started_at, {'detail': 'Recipe not found'}, level='ERROR')
            raise HTTPException(status_code=404, detail='Recipe not found') from exc

    @router.put('/recipes/{recipe_uid}')
    def update_recipe(recipe_uid: str, request: UpdateRecipeRequest):
        started_at = perf_counter()
        recipe = service.update_recipe(storage.get_recipe(recipe_uid), request.output_raw, request.matrix, request.name)
        rendered = service.render_recipe(recipe)
        updated = storage.save_existing(recipe_uid, rendered)
        debug_service.record_recipe_scan(storage.last_scan_report)
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Recipe updated', {'recipe_uid': recipe_uid, 'output_raw': request.output_raw, 'matrix_rows': len(request.matrix)})
        response_body = {'ok': True, 'updatedRecipe': serialize_recipe(_resolve_recipe_items(updated, resolver, debug_service))}
        _log_api(log_service, 'PUT', f'/api/recipes/{recipe_uid}', {'output_raw': request.output_raw}, '200', started_at, {'recipe_uid': recipe_uid})
        return response_body

    @router.post('/recipes/create')
    def create_recipe(request: CreateRecipeRequest):
        started_at = perf_counter()
        recipe = service.create_recipe(request.templateType, request.output, request.grid)
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Recipe template created', {'template_type': request.templateType, 'output': request.output, 'grid': request.grid})
        _log_api(log_service, 'POST', '/api/recipes/create', {'templateType': request.templateType, 'grid': request.grid}, '200', started_at, {'recipe_uid': recipe.recipe_uid})
        return serialize_recipe(_resolve_recipe_items(recipe, resolver, debug_service))

    @router.get('/zs/files')
    def list_zs_files():
        started_at = perf_counter()
        files = storage.list_files()
        _log_api(log_service, 'GET', '/api/zs/files', {}, '200', started_at, {'files': len(files)})
        return {'files': files}

    @router.post('/zs/files/create')
    def create_zs_file(request: CreateFileRequest):
        started_at = perf_counter()
        path = storage.create_file(request.path)
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Created .zs file', {'path': path})
        _log_api(log_service, 'POST', '/api/zs/files/create', {'path': request.path}, '200', started_at, {'path': path})
        return {'ok': True, 'path': path}

    @router.post('/recipes/save-as')
    def save_as(request: SaveAsRequest):
        started_at = perf_counter()
        try:
            recipe = storage.get_recipe(request.recipe_uid)
            recipe = service.update_recipe(recipe, request.output_raw, request.matrix, request.name)
        except KeyError:
            recipe = service.create_recipe(request.recipe_type, request.output_raw, len(request.matrix))
            recipe.recipe_uid = request.recipe_uid
            recipe = service.update_recipe(recipe, request.output_raw, request.matrix, request.name)
        new_uid = storage.save_as(service.render_recipe(recipe), request.target_path)
        debug_service.record_recipe_scan(storage.last_scan_report)
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Recipe saved as', {'recipe_uid': request.recipe_uid, 'new_uid': new_uid, 'target_path': request.target_path})
        response = {'ok': True, 'new_uid': new_uid, 'recipe': serialize_recipe(_resolve_recipe_items(storage.get_recipe(new_uid), resolver, debug_service))}
        _log_api(log_service, 'POST', '/api/recipes/save-as', {'target_path': request.target_path}, '200', started_at, {'new_uid': new_uid})
        return response

    @router.post('/index/scan')
    def index_scan(request: IndexScanRequest):
        started_at = perf_counter()
        paths = request.paths or config_service.build_index_paths(config_service.load())
        asset_index.reset()
        scan_id = asset_index.scan_paths(paths)
        debug_service.record_asset_scan(asset_index.last_scan_report)
        _log_api(log_service, 'POST', '/api/index/scan', {'paths': paths}, '200', started_at, {'scan_id': scan_id})
        return {'scan_id': scan_id, 'paths': paths}

    @router.get('/index/status/{scan_id}')
    def index_status(scan_id: str):
        started_at = perf_counter()
        status = asset_index.scan_status.get(scan_id, {'progress': 0, 'errors': ['unknown scan id'], 'startedAt': None})
        _log_api(log_service, 'GET', f'/api/index/status/{scan_id}', {}, '200', started_at, {'progress': status.get('progress')})
        return status

    @router.post('/items/resolve')
    def resolve_item(request: ResolveRequest):
        started_at = perf_counter()
        item = parser.parse_item_ref(request.item_raw)
        result = resolver.resolve(item, request.settings)
        debug_service.record_resolver(item.raw, item.base_key, result, resolver.last_resolution_details.get(item.raw))
        log_service.log('RESOLVER', 'INFO', 'ICON', 'Icon lookup requested', {'raw_item_id': item.raw, 'icon_asset_id': result.icon_asset_id, 'strategy': result.strategy})
        if result.icon_asset_id is None:
            log_service.log('BACKEND', 'WARN', 'ICON', 'Resolver returned no icon', {'raw_item_id': item.raw, 'checked': resolver.last_resolution_details.get(item.raw)})
        _log_api(log_service, 'POST', '/api/items/resolve', {'item_raw': request.item_raw}, '200', started_at, {'strategy': result.strategy, 'icon_asset_id': result.icon_asset_id})
        return result.__dict__

    @router.get('/settings/project')
    def get_project_settings():
        current = config_service.load()
        debug_service.update_config(current, used_recipe_paths=config_service.build_recipe_scan_paths(current), used_asset_paths=config_service.build_index_paths(current))
        return config_service.as_api_dict(current)

    @router.put('/settings/project')
    def update_project_settings(request: ProjectSettingsRequest):
        started_at = perf_counter()
        updated = config_service.update(request.model_dump())
        log_service.set_verbose(updated.verbose_debug_logging)
        storage.scripts_dir = Path(updated.scripts_dir)
        storage.scan(extra_paths=updated.extra_recipe_sources)
        asset_index.reset()
        index_paths = config_service.build_index_paths(updated)
        if index_paths:
            asset_index.scan_paths(index_paths)
        debug_service.update_config(updated, used_recipe_paths=config_service.build_recipe_scan_paths(updated), used_asset_paths=index_paths)
        debug_service.record_recipe_scan(storage.last_scan_report)
        debug_service.record_asset_scan(asset_index.last_scan_report)
        log_service.log('BACKEND', 'INFO', 'CONFIG', 'Project settings updated', {'scripts_dir': updated.scripts_dir, 'mods_dir': updated.mods_dir, 'assets_dir': updated.assets_dir, 'verbose_debug_logging': updated.verbose_debug_logging})
        response = config_service.as_api_dict(updated)
        _log_api(log_service, 'PUT', '/api/settings/project', request.model_dump(), '200', started_at, {'verbose_debug_logging': updated.verbose_debug_logging})
        return response

    @router.put('/settings/project/ui')
    def update_project_ui_preferences(request: UiPreferencesRequest):
        started_at = perf_counter()
        updated = config_service.update_ui_preferences(request.model_dump())
        debug_service.update_config(updated, used_recipe_paths=config_service.build_recipe_scan_paths(updated), used_asset_paths=config_service.build_index_paths(updated))
        response = config_service.as_api_dict(updated)
        _log_api(log_service, 'PUT', '/api/settings/project/ui', {'ui_preferences': request.model_dump()}, '200', started_at, {'language': updated.ui_preferences.language, 'layout_items': len(updated.ui_preferences.panel_layout)})
        return response

    @router.post('/debug/recipes/rescan')
    def rescan_recipes():
        current = config_service.load()
        storage.scripts_dir = Path(current.scripts_dir)
        storage.scan(extra_paths=current.extra_recipe_sources)
        debug_service.update_config(current, used_recipe_paths=config_service.build_recipe_scan_paths(current), used_asset_paths=config_service.build_index_paths(current))
        debug_service.record_recipe_scan(storage.last_scan_report)
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Manual recipe rescan triggered', {'paths': storage.last_scan_report.get('active_paths', [])})
        return storage.last_scan_report

    @router.post('/debug/assets/rescan')
    def rescan_assets():
        current = config_service.load()
        paths = config_service.build_index_paths(current)
        asset_index.reset()
        if paths:
            asset_index.scan_paths(paths)
        debug_service.update_config(current, used_recipe_paths=config_service.build_recipe_scan_paths(current), used_asset_paths=paths)
        debug_service.record_asset_scan(asset_index.last_scan_report)
        log_service.log('BACKEND', 'INFO', 'ASSETS', 'Manual asset rescan triggered', {'paths': paths})
        return asset_index.last_scan_report

    @router.get('/debug/config')
    def debug_config():
        current = config_service.load()
        debug_service.update_config(current, used_recipe_paths=config_service.build_recipe_scan_paths(current), used_asset_paths=config_service.build_index_paths(current))
        return debug_service.snapshot()['config']

    @router.get('/debug/recipes')
    def debug_recipes():
        return debug_service.snapshot()['recipe_scan']

    @router.get('/debug/assets')
    def debug_assets():
        return debug_service.snapshot()['asset_scan']

    @router.get('/debug/resolver')
    def debug_resolver():
        return debug_service.snapshot()['resolver']

    @router.get('/debug/parse')
    def debug_parse():
        return debug_service.snapshot()['parse']

    @router.post('/debug/clear')
    def debug_clear():
        debug_service.clear()
        return {'ok': True}

    @router.post('/debug/log')
    def ingest_debug_log(request: DebugLogEventRequest):
        event = log_service.ingest(request.model_dump())
        return {'ok': True, 'event': event}

    @router.get('/debug/log')
    def debug_log(source: str = 'All', level: str = 'All', since_id: int = 0, limit: int = 100, include_details: bool = False, include_text: bool = False):
        query = log_service.query_events(source=source, level=level, since_id=since_id, limit=limit, include_details=include_details)
        events = query['events']
        response = {
            'events': events,
            'verbose': log_service.verbose,
            'nextSinceId': query['next_since_id'],
            'hasMore': query['has_more'],
            'diagnostics': query['diagnostics'],
        }
        if include_text:
            response['exportText'] = log_service.export_text(events)
        return response

    @router.post('/debug/log/clear')
    def debug_log_clear():
        log_service.clear()
        return {'ok': True}

    @router.get('/debug/log/export')
    def debug_log_export(source: str = 'All', level: str = 'All'):
        events = log_service.list_events(source=source, level=level, limit=0, include_details=True)
        return PlainTextResponse(log_service.export_text(events))

    @router.get('/debug/summary')
    def debug_summary():
        snapshot = debug_service.snapshot()
        snapshot['unified_log'] = {'size': len(log_service.list_events(limit=0)), 'verbose': log_service.verbose}
        return snapshot

    @router.get('/icons/{icon_asset_id:path}')
    def icon_proxy(icon_asset_id: str):
        candidate = asset_index.icon_assets.get(icon_asset_id)
        if candidate is None:
            parsed = asset_index.parse_asset_id(icon_asset_id)
            if parsed is not None:
                source, rel_path = parsed
                for entries in asset_index.icons.values():
                    found = next((entry for entry in entries if entry.get('source_type') == source and entry.get('path') == rel_path), None)
                    if found is not None:
                        candidate = found
                        break
        if candidate is None:
            raise HTTPException(status_code=404, detail='Icon asset not found')

        locator = candidate.get('locator') or {}
        content: Optional[bytes] = None
        try:
            if locator.get('kind') == 'file':
                file_path = Path(str(locator.get('file_path', '')))
                if file_path.is_file():
                    content = file_path.read_bytes()
            elif locator.get('kind') == 'archive_entry':
                archive_path = Path(str(locator.get('archive_path', '')))
                entry_path = str(locator.get('entry_path', ''))
                if archive_path.is_file() and entry_path:
                    with ZipFile(archive_path) as archive:
                        content = archive.read(entry_path)
        except Exception as exc:
            log_service.log('BACKEND', 'ERROR', 'ICON', 'Icon binary read failed', {'icon_asset_id': icon_asset_id, 'error': str(exc), 'error_type': exc.__class__.__name__})
            raise HTTPException(status_code=500, detail='Icon binary read failed') from exc
        if content is None:
            raise HTTPException(status_code=404, detail='Icon binary is unavailable for this asset')
        return Response(content=content, media_type='image/png')

    app = FastAPI(title='CubixRecipes API')

    @app.get('/health')
    def health_check():
        return {'ok': True}

    app.include_router(router)
    return app
