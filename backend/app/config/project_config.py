from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional


DEFAULT_PANEL_LAYOUT = [
    {'id': 'input', 'zone': 'topLeft', 'order': 0, 'visible': True, 'height': 420},
    {'id': 'output', 'zone': 'topRight', 'order': 0, 'visible': True, 'height': 420},
    {'id': 'grid', 'zone': 'bottom', 'order': 0, 'visible': True, 'height': 420},
    {'id': 'settings', 'zone': 'bottom', 'order': 1, 'visible': True, 'height': 320},
    {'id': 'info', 'zone': 'sidebar', 'order': 0, 'visible': True, 'height': 280},
    {'id': 'debug', 'zone': 'sidebar', 'order': 1, 'visible': True, 'height': 280},
    {'id': 'diagnostics', 'zone': 'sidebar', 'order': 2, 'visible': True, 'height': 260},
    {'id': 'preview', 'zone': 'sidebar', 'order': 3, 'visible': False, 'height': 220},
    {'id': 'raw', 'zone': 'sidebar', 'order': 4, 'visible': False, 'height': 260},
]
DEFAULT_WORKSPACE_LAYOUT = {'top_ratio': 55, 'main_ratio': 68}


@dataclass
class PanelLayoutItemConfig:
    id: str
    zone: str = 'bottom'
    order: int = 0
    visible: bool = True
    height: Optional[int] = None


@dataclass
class WorkspaceLayoutConfig:
    top_ratio: int = 55
    main_ratio: int = 68


@dataclass
class UiPreferencesConfig:
    display_mode: str = 'text'
    density_mode: str = 'normal'
    editor_mode: str = 'edit'
    language: str = 'ru'
    active_view_tab: str = 'editor'
    reset_layout_version: int = 3
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
        default_path = Path(__file__).resolve().parents[3] / 'cubixrecipes.config.json'
        self.config_path = Path(config_path) if config_path is not None else default_path

    def load(self) -> ProjectPathsConfig:
        if not self.config_path.exists():
            config = ProjectPathsConfig(project_config_path=str(self.config_path))
            self.save(config)
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
        candidates = [current.scripts_dir, *current.extra_recipe_sources]
        return [value for value in candidates if value]

    def normalize(self, config: ProjectPathsConfig) -> ProjectPathsConfig:
        ui_preferences = self._coerce_ui_preferences(asdict(config.ui_preferences) if isinstance(config.ui_preferences, UiPreferencesConfig) else config.ui_preferences)
        return ProjectPathsConfig(
            scripts_dir=config.scripts_dir or 'scripts',
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
        return self.normalize(
            ProjectPathsConfig(
                scripts_dir=str(payload.get('scripts_dir', 'scripts') or 'scripts'),
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

    def _coerce_list(self, raw: Any) -> list[str]:
        if isinstance(raw, str):
            values = [line.strip() for line in raw.splitlines()]
        elif isinstance(raw, list):
            values = [str(item).strip() for item in raw]
        else:
            values = []
        return [value for value in values if value]

    def _coerce_ui_preferences(self, raw: Any) -> UiPreferencesConfig:
        payload = raw if isinstance(raw, dict) else {}
        return UiPreferencesConfig(
            display_mode=str(payload.get('display_mode', 'text') or 'text'),
            density_mode=str(payload.get('density_mode', 'normal') or 'normal'),
            editor_mode=str(payload.get('editor_mode', 'edit') or 'edit'),
            language=str(payload.get('language', 'ru') or 'ru'),
            active_view_tab=str(payload.get('active_view_tab', 'editor') or 'editor'),
            reset_layout_version=int(payload.get('reset_layout_version', 3) or 3),
            panel_layout=self._coerce_panel_layout(payload.get('panel_layout', DEFAULT_PANEL_LAYOUT)),
            workspace_layout=self._coerce_workspace_layout(payload.get('workspace_layout', DEFAULT_WORKSPACE_LAYOUT)),
        )

    def _coerce_workspace_layout(self, raw: Any) -> WorkspaceLayoutConfig:
        payload = raw if isinstance(raw, dict) else {}
        top_ratio = self._clamp_ratio(payload.get('top_ratio', DEFAULT_WORKSPACE_LAYOUT['top_ratio']))
        main_ratio = self._clamp_ratio(payload.get('main_ratio', DEFAULT_WORKSPACE_LAYOUT['main_ratio']))
        return WorkspaceLayoutConfig(top_ratio=top_ratio, main_ratio=main_ratio)

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
            result.append(
                PanelLayoutItemConfig(
                    id=panel_id,
                    zone=str(item.get('zone', 'bottom') or 'bottom'),
                    order=int(item.get('order', index) or index),
                    visible=bool(item.get('visible', True)),
                    height=max(180, min(height, 960)) if height is not None else None,
                )
            )
        for item in DEFAULT_PANEL_LAYOUT:
            if item['id'] not in seen:
                result.append(PanelLayoutItemConfig(**item))
        return result

    def _clamp_ratio(self, value: Any) -> int:
        try:
            ratio = int(value)
        except (TypeError, ValueError):
            ratio = 50
        return max(25, min(ratio, 75))

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
