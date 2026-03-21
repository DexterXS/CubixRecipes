from __future__ import annotations

from pathlib import Path
from typing import Optional, Union

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import JSONResponse

from app.api.schemas import CreateFileRequest, CreateRecipeRequest, IndexScanRequest, ParseRequest, ProjectSettingsRequest, ResolveRequest, SaveAsRequest, SearchRequest, UpdateRecipeRequest
from app.config.project_config import ProjectConfigService
from app.domain.models import Recipe, RecipeCell, RecipeSource
from app.indexer.asset_index import AssetIndex
from app.parsers.recipe_parser import RecipeParser
from app.resolver.item_resolver import ItemResolver
from app.services.recipe_service import RecipeService
from app.storage.zs_storage import ZsStorage


def serialize_recipe(recipe: Recipe) -> dict:
    return {
        "recipe_uid": recipe.recipe_uid,
        "recipe_type": recipe.recipe_type,
        "name": recipe.name,
        "output": {
            "raw": recipe.output.raw,
            "modid": recipe.output.modid,
            "name": recipe.output.name,
            "metaKind": recipe.output.meta_mode.value,
            "metaValue": recipe.output.meta_value,
        },
        "output_resolution": recipe.output_resolution,
        "grid_w": recipe.grid_w,
        "grid_h": recipe.grid_h,
        "matrix": [
            [
                {
                    "raw": cell.raw,
                    "parsed": None if cell.item is None else {
                        "modid": cell.item.modid,
                        "name": cell.item.name,
                        "metaKind": cell.item.meta_mode.value,
                        "metaValue": cell.item.meta_value,
                    },
                    "resolution": cell.resolution,
                }
                for cell in row
            ]
            for row in recipe.matrix
        ],
        "source": {
            "kind": recipe.source.kind,
            "path": recipe.source.path,
            "start_offset": recipe.source.start_offset,
            "end_offset": recipe.source.end_offset,
        },
        "diagnostics": {"parseWarnings": recipe.diagnostics, "resolverHints": []},
    }


def _resolve_recipe_items(recipe: Recipe, resolver: ItemResolver) -> Recipe:
    recipe.output_resolution = resolver.resolve(recipe.output).__dict__
    for row in recipe.matrix:
        for cell in row:
            if cell.item is None:
                cell.resolution = None
            else:
                cell.resolution = resolver.resolve(cell.item).__dict__
    return recipe


def _apply_matrix(parser: RecipeParser, matrix: list[list[Optional[str]]]) -> list[list[RecipeCell]]:
    return [
        [RecipeCell(row=r, col=c, raw=raw, item=None if raw is None else parser.parse_item_ref(raw)) for c, raw in enumerate(row)]
        for r, row in enumerate(matrix)
    ]


def create_app(scripts_dir: str = "scripts", config_path: Optional[str] = None) -> FastAPI:
    parser = RecipeParser()
    config_service = ProjectConfigService(Path(config_path) if config_path else None)
    config = config_service.load()
    active_scripts_dir = scripts_dir if scripts_dir != "scripts" else config.scripts_dir
    storage = ZsStorage(active_scripts_dir)
    storage.scan()
    asset_index = AssetIndex()
    resolver = ItemResolver(asset_index)
    if config_service.build_index_paths(config):
        asset_index.scan_paths(config_service.build_index_paths(config))
    service = RecipeService(storage, parser)

    router = APIRouter(prefix="/api")

    @router.post("/parse")
    def parse_route(request: ParseRequest):
        parsed = service.parse_text(request.text)
        if parsed.kind == "item_query":
            return {"kind": parsed.kind, "item": parsed.item.__dict__}
        return {"kind": parsed.kind, "recipe": serialize_recipe(_resolve_recipe_items(parsed.recipe, resolver))}

    @router.post("/recipes/search")
    def search_route(request: SearchRequest):
        return {"matches": [serialize_recipe(_resolve_recipe_items(recipe, resolver)) for recipe in storage.search_by_output(request.output_item_raw)]}

    @router.get("/recipes/{recipe_uid}")
    def get_recipe(recipe_uid: str):
        try:
            return serialize_recipe(_resolve_recipe_items(storage.get_recipe(recipe_uid), resolver))
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Recipe not found") from exc

    @router.put("/recipes/{recipe_uid}")
    def update_recipe(recipe_uid: str, request: UpdateRecipeRequest):
        recipe = storage.get_recipe(recipe_uid)
        recipe.name = request.name
        recipe.output = parser.parse_item_ref(request.output_raw)
        recipe.matrix = _apply_matrix(parser, request.matrix)
        rendered = service.render_recipe(recipe)
        updated = storage.save_existing(recipe_uid, rendered)
        return {"ok": True, "updatedRecipe": serialize_recipe(_resolve_recipe_items(updated, resolver))}

    @router.post("/recipes/create")
    def create_recipe(request: CreateRecipeRequest):
        recipe = service.create_recipe(request.templateType, request.output, request.grid)
        return serialize_recipe(_resolve_recipe_items(recipe, resolver))

    @router.get("/zs/files")
    def list_zs_files():
        return {"files": storage.list_files()}

    @router.post("/zs/files/create")
    def create_zs_file(request: CreateFileRequest):
        return {"ok": True, "path": storage.create_file(request.path)}

    @router.post("/recipes/save-as")
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
        return {"ok": True, "new_uid": new_uid, "recipe": serialize_recipe(_resolve_recipe_items(storage.get_recipe(new_uid), resolver))}

    @router.post("/index/scan")
    def index_scan(request: IndexScanRequest):
        paths = request.paths or config_service.build_index_paths()
        scan_id = asset_index.scan_paths(paths)
        return {"scan_id": scan_id, "paths": paths}

    @router.get("/index/status/{scan_id}")
    def index_status(scan_id: str):
        return asset_index.scan_status.get(scan_id, {"progress": 0, "errors": ["unknown scan id"], "startedAt": None})

    @router.post("/items/resolve")
    def resolve_item(request: ResolveRequest):
        item = parser.parse_item_ref(request.item_raw)
        result = resolver.resolve(item, request.settings)
        return result.__dict__

    @router.get("/settings/project")
    def get_project_settings():
        return config_service.as_api_dict()

    @router.put("/settings/project")
    def update_project_settings(request: ProjectSettingsRequest):
        updated = config_service.update(request.model_dump())
        storage.scripts_dir = Path(updated.scripts_dir)
        storage.scan()
        asset_index.reset()
        index_paths = config_service.build_index_paths(updated)
        if index_paths:
            asset_index.scan_paths(index_paths)
        return config_service.as_api_dict(updated)

    @router.get("/icons/{icon_asset_id:path}")
    def icon_proxy(icon_asset_id: str):
        return JSONResponse({"icon_asset_id": icon_asset_id, "note": "MVP placeholder: static icon proxy not implemented in tests"})

    app = FastAPI(title="CubixRecipes API")
    app.include_router(router)
    return app
