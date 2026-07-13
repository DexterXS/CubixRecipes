from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path
from typing import Any, Optional

from app.config.project_config import ProjectConfigService, ProjectPathsConfig
from app.storage.zs_storage import ZsStorage
from app.indexer.asset_index import AssetIndex
from app.indexer.itempanel_icon_catalog import ItemPanelIconCatalog
from app.items.item_catalog import ItemCatalogService
from app.resolver.item_resolver import ItemResolver
from app.storage.recipe_drafts import RecipeDraftTemplateStore
from app.storage.recipe_tasks import RecipeTaskStore
from app.storage.nei_favorites import NeiFavoritesStore
from app.storage.auction_planner import AuctionPlannerStore
from app.items.custom_items import CustomItemService
from app.services.item_case_alias_service import ItemCaseAliasService
from app.storage.zs_cloud import ZsCloudBackupService
from app.services.mod_icon_atlas_service import ModIconAtlasService


class ServerContext:
    def __init__(
        self,
        server_id: str,
        name: str,
        global_admin_data_dir: Path,
        global_data_dir: Path,
        project_root: Path,
        parser: Any,
        log_service: Any,
    ) -> None:
        self.server_id = server_id
        self.name = name
        self.parser = parser
        self.log_service = log_service
        self.project_root = project_root

        self.admin_data_dir = global_admin_data_dir / "servers" / server_id
        self.admin_data_dir.mkdir(parents=True, exist_ok=True)

        self.runtime_data_dir = global_data_dir / "servers" / server_id
        self.runtime_data_dir.mkdir(parents=True, exist_ok=True)

        # Конфиг этого сервера
        self.config_service = ProjectConfigService(self.admin_data_dir / "config.json")
        self.config = self.config_service.load()

        # Инициализируем изолированные хранилища
        active_scripts_dir = self.config.scripts_dir
        self.storage = ZsStorage(active_scripts_dir, log_service=self.log_service)
        self.storage.scan(extra_paths=self.config_service.build_extra_recipe_scan_paths(self.config))
        self.storage.excluded_managed_roots = [global_admin_data_dir]

        self.asset_index = AssetIndex(log_service=self.log_service)

        itempanel_data_dir = self.admin_data_dir / 'itempanel'
        self.itempanel_csv_storage_path = itempanel_data_dir / 'itempanel.csv'
        self.itempanel_snbt_storage_path = itempanel_data_dir / 'itempanel.json'
        self.itempanel_merged_csv_path = itempanel_data_dir / 'itempanel_merged.csv'
        self.itempanel_icons_dir = self.admin_data_dir / 'itempanel_icons'
        oredict_storage_path = self.admin_data_dir / 'oredict.txt'

        self.itempanel_icon_catalog = ItemPanelIconCatalog(
            self.active_itempanel_csv_path(),
            self.active_itempanel_icons_dir()
        )
        self.itempanel_icon_catalog.scan()

        self.item_catalog_service = ItemCatalogService(
            self.itempanel_icon_catalog.csv_path,
            self.active_itempanel_snbt_path(active_scripts_dir),
            self.itempanel_icon_catalog,
            merged_csv_path=self.itempanel_merged_csv_path,
            oredict_path=oredict_storage_path,
        )
        self.item_catalog_service.scan()

        self.mod_icon_atlas_service = ModIconAtlasService(
            self.admin_data_dir / 'mod_icon_archives',
            self.admin_data_dir / 'mod_icon_atlases'
        )
        self.item_case_alias_service = ItemCaseAliasService(
            Path(active_scripts_dir),
            self.itempanel_icon_catalog.csv_path,
            self.admin_data_dir / 'item_case_aliases'
        )
        self.zs_backup_service = ZsCloudBackupService(self.admin_data_dir / 'secret_zs_backups')
        self.recipe_draft_store = RecipeDraftTemplateStore(self.admin_data_dir / 'recipe_draft_templates.json')
        self.recipe_task_store = RecipeTaskStore(self.admin_data_dir / 'recipe_tasks.json')
        self.auction_planner_store = AuctionPlannerStore(self.admin_data_dir / 'auction_planner.json')
        self.nei_favorites_store = NeiFavoritesStore(self.runtime_data_dir / 'nei_favorites.json')

        self.resolver = ItemResolver(
            self.asset_index,
            log_service=self.log_service,
            itempanel_icon_catalog=self.itempanel_icon_catalog
        )
        self.custom_item_service = CustomItemService(self.admin_data_dir / 'custom_items')

        index_paths = self.config_service.build_index_paths(self.config)
        has_catalog_icons = bool(self.itempanel_icon_catalog.last_scan_report.get('matched', 0))
        if index_paths and not has_catalog_icons:
            self.asset_index.scan_paths(index_paths)

    def active_itempanel_csv_path(self) -> Path:
        if self.itempanel_csv_storage_path.is_file() or self.itempanel_merged_csv_path.is_file():
            return self.itempanel_csv_storage_path
        return self.project_root / 'itempanel.csv'

    def active_itempanel_icons_dir(self) -> Path:
        if self.itempanel_csv_storage_path.is_file() or self.itempanel_icons_dir.is_dir():
            return self.itempanel_icons_dir
        return self.project_root / 'itempanel_icons'

    def active_itempanel_snbt_path(self, current_scripts_dir: str) -> Path:
        if self.itempanel_snbt_storage_path.is_file():
            return self.itempanel_snbt_storage_path
        scripts_path = Path(current_scripts_dir).expanduser().resolve(strict=False)
        candidates = [
            scripts_path.parent / 'dumps' / 'itempanel.json',
            self.project_root / 'dumps' / 'itempanel.json',
            self.project_root / 'itempanel.json',
        ]
        return next((candidate for candidate in candidates if candidate.is_file()), candidates[-1])

    def refresh_itempanel_sources(self, current_scripts_dir: Optional[str] = None) -> None:
        scripts_dir = current_scripts_dir or self.config.scripts_dir
        self.itempanel_icon_catalog.csv_path = self.active_itempanel_csv_path()
        self.itempanel_icon_catalog.icons_dir = self.active_itempanel_icons_dir()
        self.item_catalog_service.csv_path = self.itempanel_icon_catalog.csv_path
        self.item_catalog_service.snbt_path = self.active_itempanel_snbt_path(scripts_dir)


class ServerManager:
    def __init__(
        self,
        global_admin_data_dir: Path,
        global_data_dir: Path,
        project_root: Path,
        parser: Any,
        log_service: Any,
    ) -> None:
        self.global_admin_data_dir = global_admin_data_dir
        self.global_data_dir = global_data_dir
        self.project_root = project_root
        self.parser = parser
        self.log_service = log_service

        self.servers_file = global_admin_data_dir / "servers.json"
        self.contexts: dict[str, ServerContext] = {}

        # Инициализируем / загружаем список серверов
        self.servers = self._load_servers()
        if not self.servers:
            # Создаем HiTech по умолчанию
            self.servers = [{"id": "hitech", "name": "HiTech"}]
            self._save_servers()
            self._migrate_legacy_data("hitech")

    def _load_servers(self) -> list[dict[str, str]]:
        if self.servers_file.is_file():
            try:
                return json.loads(self.servers_file.read_text(encoding='utf-8'))
            except Exception as exc:
                self.log_service.log(
                    'BACKEND', 'ERROR', 'SERVERS',
                    f'Failed to parse servers.json: {exc}'
                )
        return []

    def _save_servers(self) -> None:
        self.servers_file.parent.mkdir(parents=True, exist_ok=True)
        self.servers_file.write_text(
            json.dumps(self.servers, ensure_ascii=False, indent=2) + '\n',
            encoding='utf-8'
        )

    def _migrate_legacy_data(self, server_id: str) -> None:
        self.log_service.log(
            'BACKEND', 'INFO', 'SERVERS',
            f'Migrating legacy project data to server context "{server_id}"'
        )
        target_admin_dir = self.global_admin_data_dir / "servers" / server_id
        target_admin_dir.mkdir(parents=True, exist_ok=True)

        # 1. Переносим папки и файлы из global_admin_data_dir в target_admin_dir
        items_to_move = [
            "recipe_tasks.json",
            "recipe_draft_templates.json",
            "oredict.txt",
            "custom_items",
            "item_case_aliases",
            "secret_zs_backups",
            "mod_icon_archives",
            "mod_icon_atlases",
            "itempanel"
        ]
        for name in items_to_move:
            source = self.global_admin_data_dir / name
            if source.exists():
                dest = target_admin_dir / name
                # Если папка/файл назначения уже существуют, удаляем во избежание конфликта
                if dest.exists():
                    if dest.is_dir():
                        shutil.rmtree(dest)
                    else:
                        dest.unlink()
                shutil.move(str(source), str(dest))

        # 2. Переносим nei_favorites.json из global_data_dir
        legacy_favorites = self.global_data_dir / "nei_favorites.json"
        if legacy_favorites.is_file():
            target_runtime_dir = self.global_data_dir / "servers" / server_id
            target_runtime_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(str(legacy_favorites), str(target_runtime_dir / "nei_favorites.json"))

        # 3. Переносим конфиг путей. Старый конфиг лежал в корневом cubixrecipes.config.json
        legacy_config = self.global_admin_data_dir.parent / "cubixrecipes.config.json"
        if legacy_config.is_file():
            shutil.copy(str(legacy_config), str(target_admin_dir / "config.json"))

    def get_context(self, server_id: str) -> Optional[ServerContext]:
        if server_id not in self.contexts:
            # Ищем сервер в списке
            server_info = next((s for s in self.servers if s['id'] == server_id), None)
            if not server_info:
                return None
            self.contexts[server_id] = ServerContext(
                server_id=server_id,
                name=server_info['name'],
                global_admin_data_dir=self.global_admin_data_dir,
                global_data_dir=self.global_data_dir,
                project_root=self.project_root,
                parser=self.parser,
                log_service=self.log_service,
            )
        return self.contexts[server_id]

    def create_server(self, server_id: str, name: str) -> None:
        if any(s['id'] == server_id for s in self.servers):
            raise ValueError(f"Server ID {server_id} already exists")

        self.servers.append({"id": server_id, "name": name})
        self._save_servers()

        server_admin_dir = self.global_admin_data_dir / "servers" / server_id
        server_admin_dir.mkdir(parents=True, exist_ok=True)

        server_runtime_dir = self.global_data_dir / "servers" / server_id
        server_runtime_dir.mkdir(parents=True, exist_ok=True)

        # Генерируем дефолтный config.json для нового пустого сервера
        config_path = server_admin_dir / "config.json"
        scripts_dir = str(self.global_data_dir / "servers" / server_id / "scripts")
        mods_dir = str(self.global_data_dir / "servers" / server_id / "mods")

        config = ProjectPathsConfig(
            scripts_dir=scripts_dir,
            mods_dir=mods_dir,
            project_config_path=str(config_path)
        )
        config_path.write_text(
            json.dumps(
                {
                    "scripts_dir": config.scripts_dir,
                    "mods_dir": config.mods_dir,
                    "assets_dir": "",
                    "recipe_db_path": "",
                    "extra_icon_sources": [],
                    "extra_recipe_sources": [],
                    "verbose_debug_logging": False,
                    "project_config_path": str(config_path)
                },
                ensure_ascii=False,
                indent=2
            ) + '\n',
            encoding='utf-8'
        )

        # Создаем директории скриптов и модов
        Path(scripts_dir).mkdir(parents=True, exist_ok=True)
        Path(mods_dir).mkdir(parents=True, exist_ok=True)

    def rename_server(self, server_id: str, name: str) -> None:
        server_info = next((s for s in self.servers if s['id'] == server_id), None)
        if not server_info:
            raise ValueError(f"Server {server_id} not found")

        server_info['name'] = name
        self._save_servers()

        # Обновляем имя в закешированном контексте
        if server_id in self.contexts:
            self.contexts[server_id].name = name

    def delete_server(self, server_id: str) -> None:
        if server_id == "hitech":
            raise ValueError("Cannot delete default HiTech server")

        self.servers = [s for s in self.servers if s['id'] != server_id]
        self._save_servers()

        # Удаляем контекст из кэша
        if server_id in self.contexts:
            del self.contexts[server_id]

        # Удаляем директории
        server_admin_dir = self.global_admin_data_dir / "servers" / server_id
        if server_admin_dir.is_dir():
            shutil.rmtree(server_admin_dir)

        server_runtime_dir = self.global_data_dir / "servers" / server_id
        if server_runtime_dir.is_dir():
            shutil.rmtree(server_runtime_dir)
