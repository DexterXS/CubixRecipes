from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional


CONFIG_FILENAME = 'cubixrecipes.config.json'
DATA_DIR_ENV_KEYS = ('CUBIXRECIPES_DATA_DIR', 'RAILWAY_VOLUME_MOUNT_PATH')
RAILWAY_ENV_KEYS = ('RAILWAY_ENVIRONMENT', 'RAILWAY_PROJECT_ID', 'RAILWAY_SERVICE_ID')
RAILWAY_DEFAULT_DATA_DIR = Path('/data')

DEFAULT_PANEL_LAYOUT = [
    {'id': 'hero', 'zone': 'topLeft', 'order': 0, 'visible': True, 'height': 120, 'width_units': 3},
    {'id': 'toolbar', 'zone': 'topLeft', 'order': 1, 'visible': True, 'height': 96, 'width_units': 3},
    {'id': 'input', 'zone': 'topLeft', 'order': 2, 'visible': True, 'height': 320, 'width_units': 2},
    {'id': 'output', 'zone': 'topRight', 'order': 3, 'visible': True, 'height': 320, 'width_units': 1},
    {'id': 'grid', 'zone': 'bottom', 'order': 4, 'visible': True, 'height': 380, 'width_units': 3},
    {'id': 'statusBar', 'zone': 'topRight', 'order': 5, 'visible': False, 'height': 72, 'width_units': 3},
    {'id': 'settings', 'zone': 'bottom', 'order': 6, 'visible': False, 'height': 260, 'width_units': 1},
    {'id': 'info', 'zone': 'sidebar', 'order': 7, 'visible': False, 'height': 260, 'width_units': 1},
    {'id': 'debug', 'zone': 'sidebar', 'order': 8, 'visible': False, 'height': 260, 'width_units': 1},
    {'id': 'diagnostics', 'zone': 'sidebar', 'order': 9, 'visible': False, 'height': 260, 'width_units': 1},
    {'id': 'preview', 'zone': 'sidebar', 'order': 10, 'visible': False, 'height': 220, 'width_units': 1},
    {'id': 'raw', 'zone': 'sidebar', 'order': 11, 'visible': False, 'height': 260, 'width_units': 1},
]
DEFAULT_WORKSPACE_LAYOUT = {'columns': 3, 'compact_header': True}


@dataclass
class PanelLayoutItemConfig:
    id: str
    zone: str = 'bottom'
    order: int = 0
    visible: bool = True
    height: Optional[int] = None
    width_units: int = 1


@dataclass
class WorkspaceLayoutConfig:
    columns: int = 3
    compact_header: bool = True


@dataclass
class UiPreferencesConfig:
    display_mode: str = 'text'
    animations_enabled: bool = True
    density_mode: str = 'normal'
    editor_mode: str = 'edit'
    ui_scale: float = 1.15
    language: str = 'ru'
    active_view_tab: str = 'editor'
    reset_layout_version: int = 4
    panel_layout: list[PanelLayoutItemConfig] = field(default_factory=list)
    workspace_layout: WorkspaceLayoutConfig = field(default_factory=WorkspaceLayoutConfig)


@dataclass
class ProjectPathsConfig:
    scripts_dir: str = 'scripts'
    mods_dir: str = ''
    assets_dir: str = ''
    recipe_db_path: str = ''
    extra_icon_sources: list[str] = field(default_factory=list)
    extra_recipe_sources: list[str] = field(default_factory=list)
    verbose_debug_logging: bool = False
    project_config_path: str = ''
    ui_preferences: UiPreferencesConfig = field(default_factory=UiPreferencesConfig)


class ProjectConfigService:
    def __init__(self, config_path: Optional[Path] = None) -> None:
        self.repo_root = Path(__file__).resolve().parents[3]
        self.data_dir = self._resolve_data_dir()
        default_path = self.data_dir / CONFIG_FILENAME if self.data_dir is not None else self.repo_root / CONFIG_FILENAME
        self.config_path = Path(config_path) if config_path is not None else default_path

    def load(self) -> ProjectPathsConfig:
        if not self.config_path.exists():
            config = ProjectPathsConfig(
                scripts_dir=self._default_scripts_dir(),
                project_config_path=str(self.config_path),
            )
            self.save(config)
            self._ensure_runtime_dirs(config)
            return config
        try:
            payload = json.loads(self.config_path.read_text(encoding='utf-8'))
        except json.JSONDecodeError:
            payload = {}
        return self._from_payload(payload)

    def save(self, config: ProjectPathsConfig) -> ProjectPathsConfig:
        normalized = self.normalize(config)
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        self.config_path.write_text(json.dumps(asdict(normalized), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        return normalized

    def update(self, payload: dict[str, Any]) -> ProjectPathsConfig:
        current = self.load()
        merged = ProjectPathsConfig(
            scripts_dir=str(payload.get('scripts_dir', current.scripts_dir) or current.scripts_dir),
            mods_dir=str(payload.get('mods_dir', current.mods_dir) or ''),
            assets_dir=str(payload.get('assets_dir', current.assets_dir) or ''),
            recipe_db_path=str(payload.get('recipe_db_path', current.recipe_db_path) or ''),
            extra_icon_sources=self._coerce_list(payload.get('extra_icon_sources', current.extra_icon_sources)),
            extra_recipe_sources=self._coerce_list(payload.get('extra_recipe_sources', current.extra_recipe_sources)),
            verbose_debug_logging=bool(payload.get('verbose_debug_logging', current.verbose_debug_logging)),
            project_config_path=str(self.config_path),
            ui_preferences=self._coerce_ui_preferences(payload.get('ui_preferences', asdict(current.ui_preferences))),
        )
        return self.save(merged)

    def update_ui_preferences(self, raw_ui_preferences: Any) -> ProjectPathsConfig:
        current = self.load()
        current.ui_preferences = self._coerce_ui_preferences(raw_ui_preferences)
        return self.save(current)

    def as_api_dict(self, config: Optional[ProjectPathsConfig] = None) -> dict[str, Any]:
        current = self.normalize(config or self.load())
        return {**asdict(current), 'validation': self.validate(current)}

    def validate(self, config: ProjectPathsConfig) -> dict[str, Any]:
        paths = {
            'scripts_dir': config.scripts_dir,
            'mods_dir': config.mods_dir,
            'assets_dir': config.assets_dir,
            'recipe_db_path': config.recipe_db_path,
            'project_config_path': config.project_config_path,
        }
        validations = {key: self._validate_path(value, expect_file=(key == 'recipe_db_path' or key == 'project_config_path')) for key, value in paths.items()}
        validations['recipe_db_path']['runtime_usage'] = 'unused'
        validations['recipe_db_path']['message'] = 'Путь сохранён, но пока не используется backend-ом'
        validations['extra_icon_sources'] = [self._validate_path(value) for value in config.extra_icon_sources]
        validations['extra_recipe_sources'] = [self._validate_path(value) for value in config.extra_recipe_sources]
        validations['verbose_debug_logging'] = {'enabled': config.verbose_debug_logging}
        validations['ui_preferences'] = asdict(config.ui_preferences)
        return validations

    def build_index_paths(self, config: Optional[ProjectPathsConfig] = None) -> list[str]:
        current = self.normalize(config or self.load())
        candidates = [current.mods_dir, current.assets_dir, *current.extra_icon_sources]
        return [value for value in candidates if value]

    def build_recipe_scan_paths(self, config: Optional[ProjectPathsConfig] = None) -> list[str]:
        current = self.normalize(config or self.load())
        candidates = [current.scripts_dir, *self.build_extra_recipe_scan_paths(current)]
        return self._dedupe_paths([value for value in candidates if value])

    def build_extra_recipe_scan_paths(self, config: Optional[ProjectPathsConfig] = None) -> list[str]:
        current = self.normalize(config or self.load())
        candidates = [*current.extra_recipe_sources]
        local_recipes_dir = self.config_path.resolve(strict=False).parent / 'Recipes'
        if local_recipes_dir.exists():
            candidates.append(str(local_recipes_dir))
        return self._dedupe_paths([value for value in candidates if value])

    def normalize(self, config: ProjectPathsConfig) -> ProjectPathsConfig:
        ui_preferences = self._coerce_ui_preferences(asdict(config.ui_preferences) if isinstance(config.ui_preferences, UiPreferencesConfig) else config.ui_preferences)
        return ProjectPathsConfig(
            scripts_dir=config.scripts_dir or self._default_scripts_dir(),
            mods_dir=config.mods_dir or '',
            assets_dir=config.assets_dir or '',
            recipe_db_path=config.recipe_db_path or '',
            extra_icon_sources=self._coerce_list(config.extra_icon_sources),
            extra_recipe_sources=self._coerce_list(config.extra_recipe_sources),
            verbose_debug_logging=bool(config.verbose_debug_logging),
            project_config_path=str(self.config_path),
            ui_preferences=ui_preferences,
        )

    def _from_payload(self, payload: dict[str, Any]) -> ProjectPathsConfig:
        default_scripts_dir = self._default_scripts_dir()
        return self.normalize(
            ProjectPathsConfig(
                scripts_dir=str(payload.get('scripts_dir', default_scripts_dir) or default_scripts_dir),
                mods_dir=str(payload.get('mods_dir', '') or ''),
                assets_dir=str(payload.get('assets_dir', '') or ''),
                recipe_db_path=str(payload.get('recipe_db_path', '') or ''),
                extra_icon_sources=self._coerce_list(payload.get('extra_icon_sources', [])),
                extra_recipe_sources=self._coerce_list(payload.get('extra_recipe_sources', [])),
                verbose_debug_logging=bool(payload.get('verbose_debug_logging', False)),
                project_config_path=str(self.config_path),
                ui_preferences=self._coerce_ui_preferences(payload.get('ui_preferences', {})),
            )
        )

    def _resolve_data_dir(self) -> Optional[Path]:
        for env_key in DATA_DIR_ENV_KEYS:
            raw_path = os.environ.get(env_key, '').strip()
            if raw_path:
                return Path(raw_path)
        if any(os.environ.get(env_key, '').strip() for env_key in RAILWAY_ENV_KEYS) and RAILWAY_DEFAULT_DATA_DIR.is_dir():
            return RAILWAY_DEFAULT_DATA_DIR
        return None

    def _default_scripts_dir(self) -> str:
        data_dir = self._data_dir_for_config()
        if data_dir is not None:
            return str(data_dir / 'scripts')
        return 'scripts'

    def _data_dir_for_config(self) -> Optional[Path]:
        candidates = []
        if self.data_dir is not None:
            candidates.append(self.data_dir)
        if RAILWAY_DEFAULT_DATA_DIR.is_dir():
            candidates.append(RAILWAY_DEFAULT_DATA_DIR)
        config_parent = self.config_path.resolve(strict=False).parent
        for candidate in candidates:
            try:
                if config_parent == candidate.resolve(strict=False):
                    return candidate
            except OSError:
                continue
        return None

    def _ensure_runtime_dirs(self, config: ProjectPathsConfig) -> None:
        data_dir = self._data_dir_for_config()
        if data_dir is None:
            return
        scripts_path = Path(config.scripts_dir).resolve(strict=False)
        try:
            scripts_path.relative_to(data_dir.resolve(strict=False))
        except ValueError:
            return
        scripts_path.mkdir(parents=True, exist_ok=True)

    def _coerce_list(self, raw: Any) -> list[str]:
        if isinstance(raw, str):
            values = [line.strip() for line in raw.splitlines()]
        elif isinstance(raw, list):
            values = [str(item).strip() for item in raw]
        else:
            values = []
        return [value for value in values if value]

    def _dedupe_paths(self, values: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for value in values:
            try:
                key = str(Path(value).resolve(strict=False)).lower()
            except Exception:
                key = value.lower()
            if key in seen:
                continue
            seen.add(key)
            result.append(value)
        return result

    def _coerce_ui_preferences(self, raw: Any) -> UiPreferencesConfig:
        payload = raw if isinstance(raw, dict) else {}
        return UiPreferencesConfig(
            display_mode=str(payload.get('display_mode', 'text') or 'text'),
            animations_enabled=bool(payload.get('animations_enabled', True)),
            density_mode=str(payload.get('density_mode', 'normal') or 'normal'),
            editor_mode=str(payload.get('editor_mode', 'edit') or 'edit'),
            ui_scale=float(payload.get('ui_scale', 1.15) or 1.15),
            language=str(payload.get('language', 'ru') or 'ru'),
            active_view_tab=str(payload.get('active_view_tab', 'editor') or 'editor'),
            reset_layout_version=int(payload.get('reset_layout_version', 4) or 4),
            panel_layout=self._coerce_panel_layout(payload.get('panel_layout', DEFAULT_PANEL_LAYOUT)),
            workspace_layout=self._coerce_workspace_layout(payload.get('workspace_layout', DEFAULT_WORKSPACE_LAYOUT)),
        )

    def _coerce_workspace_layout(self, raw: Any) -> WorkspaceLayoutConfig:
        payload = raw if isinstance(raw, dict) else {}
        columns = self._clamp_columns(payload.get('columns', DEFAULT_WORKSPACE_LAYOUT['columns']))
        compact_header = bool(payload.get('compact_header', DEFAULT_WORKSPACE_LAYOUT['compact_header']))
        return WorkspaceLayoutConfig(columns=columns, compact_header=compact_header)

    def _coerce_panel_layout(self, raw: Any) -> list[PanelLayoutItemConfig]:
        if not isinstance(raw, list):
            raw = DEFAULT_PANEL_LAYOUT
        result: list[PanelLayoutItemConfig] = []
        seen = set()
        for index, item in enumerate(raw):
            if not isinstance(item, dict):
                continue
            panel_id = str(item.get('id', '')).strip()
            if not panel_id or panel_id in seen:
                continue
            seen.add(panel_id)
            height_raw = item.get('height')
            height = int(height_raw) if isinstance(height_raw, (int, float)) else None
            width_units_raw = item.get('width_units', 1)
            try:
                width_units = int(width_units_raw)
            except (TypeError, ValueError):
                width_units = 1
            result.append(
                PanelLayoutItemConfig(
                    id=panel_id,
                    zone=str(item.get('zone', 'bottom') or 'bottom'),
                    order=int(item.get('order', index) or index),
                    visible=bool(item.get('visible', True)),
                    height=max(72, min(height, 960)) if height is not None else None,
                    width_units=max(1, min(width_units, 3)),
                )
            )
        for item in DEFAULT_PANEL_LAYOUT:
            if item['id'] not in seen:
                result.append(PanelLayoutItemConfig(**item))
        result.sort(key=lambda item: item.order)
        for order, item in enumerate(result):
            item.order = order
        return result

    def _clamp_columns(self, value: Any) -> int:
        try:
            columns = int(value)
        except (TypeError, ValueError):
            columns = 3
        return max(1, min(columns, 3))

    def _validate_path(self, raw_path: str, expect_file: bool = False) -> dict[str, Any]:
        if not raw_path:
            return {'path': raw_path, 'exists': False, 'kind': 'missing', 'message': 'Путь не задан'}
        path = Path(raw_path)
        exists = path.exists()
        if expect_file:
            kind = 'file' if path.is_file() else 'dir' if path.is_dir() else 'missing'
        else:
            kind = 'dir' if path.is_dir() else 'file' if path.is_file() else 'missing'
        message = 'OK' if exists else 'Путь не найден'
        return {'path': raw_path, 'exists': exists, 'kind': kind, 'message': message}
