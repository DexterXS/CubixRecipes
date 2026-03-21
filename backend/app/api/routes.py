from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import JSONResponse

from app.api.schemas import CreateFileRequest, CreateRecipeRequest, IndexScanRequest, ParseRequest, ProjectSettingsRequest, ResolveRequest, SaveAsRequest, SearchRequest, UpdateRecipeRequest
from app.config.project_config import ProjectConfigService
from app.debug.debug_service import DebugService
from app.domain.models import Recipe, RecipeCell
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


def _apply_matrix(parser: RecipeParser, matrix: list[list[Optional[str]]]) -> list[list[RecipeCell]]:
    cells = []
    for r, row in enumerate(matrix):
        cell_row = []
        for c, raw in enumerate(row):
            item = None
            if raw is not None:
                item, _error = parser.parse_item_ref_safe(raw)
            cell_row.append(RecipeCell(row=r, col=c, raw=raw, item=item))
        cells.append(cell_row)
    return cells


def create_app(scripts_dir: str = 'scripts', config_path: Optional[str] = None) -> FastAPI:
    parser = RecipeParser()
    config_service = ProjectConfigService(Path(config_path) if config_path else None)
    debug_service = DebugService(config_service)
    config = config_service.load()
    active_scripts_dir = scripts_dir if scripts_dir != 'scripts' else config.scripts_dir
    storage = ZsStorage(active_scripts_dir)
    storage.scan(extra_paths=config.extra_recipe_sources)
    asset_index = AssetIndex()
    resolver = ItemResolver(asset_index)
    index_paths = config_service.build_index_paths(config)
    if index_paths:
        asset_index.scan_paths(index_paths)
    debug_service.update_config(config, used_recipe_paths=config_service.build_recipe_scan_paths(config), used_asset_paths=index_paths)
    debug_service.record_recipe_scan(storage.last_scan_report)
    debug_service.record_asset_scan(asset_index.last_scan_report)
    service = RecipeService(storage, parser)

    router = APIRouter(prefix='/api')

    @router.post('/parse')
    def parse_route(request: ParseRequest):
        try:
            parsed = service.parse_text(request.text)
        except Exception as exc:
            debug_service.record_parse(debug_service.build_parse_error(request.text, exc))
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if parsed.kind == 'item_query':
            return {'kind': parsed.kind, 'item': parsed.item.__dict__}
        recipe = _resolve_recipe_items(parsed.recipe, resolver, debug_service)
        debug_service.record_parse(debug_service.build_parse_diagnostic_for_recipe(request.text, recipe))
        return {'kind': parsed.kind, 'recipe': serialize_recipe(recipe)}

    @router.post('/recipes/search')
    def search_route(request: SearchRequest):
        return {'matches': [serialize_recipe(_resolve_recipe_items(recipe, resolver, debug_service)) for recipe in storage.search_by_output(request.output_item_raw)]}

    @router.get('/recipes/{recipe_uid}')
    def get_recipe(recipe_uid: str):
        try:
            return serialize_recipe(_resolve_recipe_items(storage.get_recipe(recipe_uid), resolver, debug_service))
        except KeyError as exc:
            raise HTTPException(status_code=404, detail='Recipe not found') from exc

    @router.put('/recipes/{recipe_uid}')
    def update_recipe(recipe_uid: str, request: UpdateRecipeRequest):
        recipe = storage.get_recipe(recipe_uid)
        recipe.name = request.name
        recipe.output = parser.parse_item_ref(request.output_raw)
        recipe.matrix = _apply_matrix(parser, request.matrix)
        rendered = service.render_recipe(recipe)
        updated = storage.save_existing(recipe_uid, rendered)
        debug_service.record_recipe_scan(storage.last_scan_report)
        return {'ok': True, 'updatedRecipe': serialize_recipe(_resolve_recipe_items(updated, resolver, debug_service))}

    @router.post('/recipes/create')
    def create_recipe(request: CreateRecipeRequest):
        recipe = service.create_recipe(request.templateType, request.output, request.grid)
        return serialize_recipe(_resolve_recipe_items(recipe, resolver, debug_service))

    @router.get('/zs/files')
    def list_zs_files():
        return {'files': storage.list_files()}

    @router.post('/zs/files/create')
    def create_zs_file(request: CreateFileRequest):
        return {'ok': True, 'path': storage.create_file(request.path)}

    @router.post('/recipes/save-as')
    def save_as(request: SaveAsRequest):
        try:
            recipe = storage.get_recipe(request.recipe_uid)
        except KeyError:
            recipe = service.create_recipe(request.recipe_type, request.output_raw, len(request.matrix))
            recipe.recipe_uid = request.recipe_uid

        recipe.name = request.name
        recipe.output = parser.parse_item_ref(request.output_raw)
        recipe.matrix = _apply_matrix(parser, request.matrix)
        recipe.grid_h = len(recipe.matrix)
        recipe.grid_w = max((len(row) for row in request.matrix), default=0)
        new_uid = storage.save_as(service.render_recipe(recipe), request.target_path)
        debug_service.record_recipe_scan(storage.last_scan_report)
        return {'ok': True, 'new_uid': new_uid, 'recipe': serialize_recipe(_resolve_recipe_items(storage.get_recipe(new_uid), resolver, debug_service))}

    @router.post('/index/scan')
    def index_scan(request: IndexScanRequest):
        paths = request.paths or config_service.build_index_paths(config_service.load())
        asset_index.reset()
        scan_id = asset_index.scan_paths(paths)
        debug_service.record_asset_scan(asset_index.last_scan_report)
        return {'scan_id': scan_id, 'paths': paths}

    @router.get('/index/status/{scan_id}')
    def index_status(scan_id: str):
        return asset_index.scan_status.get(scan_id, {'progress': 0, 'errors': ['unknown scan id'], 'startedAt': None})

    @router.post('/items/resolve')
    def resolve_item(request: ResolveRequest):
        item = parser.parse_item_ref(request.item_raw)
        result = resolver.resolve(item, request.settings)
        debug_service.record_resolver(item.raw, item.base_key, result, resolver.last_resolution_details.get(item.raw))
        return result.__dict__

    @router.get('/settings/project')
    def get_project_settings():
        current = config_service.load()
        debug_service.update_config(current, used_recipe_paths=config_service.build_recipe_scan_paths(current), used_asset_paths=config_service.build_index_paths(current))
        return config_service.as_api_dict(current)

    @router.put('/settings/project')
    def update_project_settings(request: ProjectSettingsRequest):
        updated = config_service.update(request.model_dump())
        storage.scripts_dir = Path(updated.scripts_dir)
        storage.scan(extra_paths=updated.extra_recipe_sources)
        asset_index.reset()
        index_paths = config_service.build_index_paths(updated)
        if index_paths:
            asset_index.scan_paths(index_paths)
        debug_service.update_config(updated, used_recipe_paths=config_service.build_recipe_scan_paths(updated), used_asset_paths=index_paths)
        debug_service.record_recipe_scan(storage.last_scan_report)
        debug_service.record_asset_scan(asset_index.last_scan_report)
        return config_service.as_api_dict(updated)

    @router.post('/debug/recipes/rescan')
    def rescan_recipes():
        current = config_service.load()
        storage.scripts_dir = Path(current.scripts_dir)
        storage.scan(extra_paths=current.extra_recipe_sources)
        debug_service.update_config(current, used_recipe_paths=config_service.build_recipe_scan_paths(current), used_asset_paths=config_service.build_index_paths(current))
        debug_service.record_recipe_scan(storage.last_scan_report)
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

    @router.get('/debug/summary')
    def debug_summary():
        return debug_service.snapshot()

    @router.get('/icons/{icon_asset_id:path}')
    def icon_proxy(icon_asset_id: str):
        return JSONResponse({'icon_asset_id': icon_asset_id, 'note': 'MVP placeholder: static icon proxy not implemented in tests'})

    app = FastAPI(title='CubixRecipes API')
    app.include_router(router)
    return app
