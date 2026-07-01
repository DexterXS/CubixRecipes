from pathlib import Path

from app.debug.log_service import DebugLogService
from app.parsers.recipe_parser import RecipeParser
from app.services.server_manager import ServerManager


def _write_itempanel_csv(path: Path, key: str, display: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        'Item Name,Item ID,Item meta,Has NBT,Display Name\n'
        f'{key},1,0,false,{display}\n',
        encoding='utf-8',
    )


def test_default_server_uses_project_itempanel_csv_until_server_override(tmp_path: Path):
    project_root = tmp_path
    _write_itempanel_csv(project_root / 'itempanel.csv', 'minecraft:stone', 'Stone')

    manager = ServerManager(
        project_root / '.cubixrecipes_admin',
        project_root / 'data',
        project_root,
        RecipeParser(),
        DebugLogService(verbose=False),
    )

    context = manager.get_context('hitech')
    assert context is not None
    assert context.item_catalog_service.csv_path == project_root / 'itempanel.csv'
    assert {entry.key for entry in context.item_catalog_service.entries} == {'minecraft:stone'}

    _write_itempanel_csv(context.itempanel_csv_storage_path, 'minecraft:dirt', 'Dirt')
    context.refresh_itempanel_sources()
    context.item_catalog_service.scan()

    assert context.item_catalog_service.csv_path == context.itempanel_csv_storage_path
    assert {entry.key for entry in context.item_catalog_service.entries} == {'minecraft:dirt'}
