from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any, Optional

from app.config.project_config import ProjectConfigService, ProjectPathsConfig
from app.debug.models import DebugIssue, DebugPathEntry, DebugSnapshot, ParseDiagnostic, ResolverDiagnostic
from app.domain.models import Recipe, ResolutionResult


class DebugService:
    def __init__(self, config_service: ProjectConfigService) -> None:
        self.config_service = config_service
        self._config_payload: dict[str, Any] = {}
        self._recipe_scan_payload: dict[str, Any] = {
            'active_paths': [],
            'files': [],
            'scan_errors': [],
            'unparsed_fragments': [],
        }
        self._asset_scan_payload: dict[str, Any] = {
            'indexed_paths': [],
            'sources': [],
            'counters': {},
            'registered_keys': [],
            'missing_icons': [],
            'scan_errors': [],
        }
        self._resolver_payload: dict[str, Any] = {'entries': []}
        self._parse_payload: dict[str, Any] = {'latest': None, 'history': []}

    def clear(self) -> None:
        self._resolver_payload = {'entries': []}
        self._parse_payload = {'latest': None, 'history': []}

    def update_config(self, config: ProjectPathsConfig, used_recipe_paths: Optional[list[str]] = None, used_asset_paths: Optional[list[str]] = None) -> None:
        validation = self.config_service.validate(config)
        path_entries = [
            self._path_entry('config_file', config.project_config_path, True, 'config_path', validation['project_config_path']),
            self._path_entry('scripts_dir', config.scripts_dir, config.scripts_dir in (used_recipe_paths or []), 'settings', validation['scripts_dir']),
            self._path_entry('mods_dir', config.mods_dir, config.mods_dir in (used_asset_paths or []), 'settings', validation['mods_dir']),
            self._path_entry('assets_dir', config.assets_dir, config.assets_dir in (used_asset_paths or []), 'settings', validation['assets_dir']),
            self._path_entry('recipe_db_path', config.recipe_db_path, bool(config.recipe_db_path), 'settings', validation['recipe_db_path']),
        ]
        for value, payload in zip(config.extra_icon_sources, validation['extra_icon_sources']):
            path_entries.append(self._path_entry('extra_icon_source', value, value in (used_asset_paths or []), 'settings', payload))
        for value, payload in zip(config.extra_recipe_sources, validation['extra_recipe_sources']):
            path_entries.append(self._path_entry('extra_recipe_source', value, value in (used_recipe_paths or []), 'settings', payload))
        self._config_payload = {
            'config_file': config.project_config_path,
            'scripts_dir': config.scripts_dir,
            'mods_dir': config.mods_dir,
            'assets_dir': config.assets_dir,
            'recipe_db_path': config.recipe_db_path,
            'extra_icon_sources': list(config.extra_icon_sources),
            'extra_recipe_sources': list(config.extra_recipe_sources),
            'paths': [asdict(entry) for entry in path_entries],
        }

    def _path_entry(self, label: str, path: str, used: bool, source: str, payload: dict[str, Any]) -> DebugPathEntry:
        return DebugPathEntry(
            label=label,
            path=path,
            exists=bool(payload.get('exists')),
            kind=str(payload.get('kind', 'missing')),
            used=used,
            source=source,
            message=str(payload.get('message', '')),
        )

    def record_recipe_scan(self, payload: dict[str, Any]) -> None:
        self._recipe_scan_payload = payload

    def record_asset_scan(self, payload: dict[str, Any]) -> None:
        self._asset_scan_payload = payload

    def record_resolver(self, item_raw: str, item_key: str, result: ResolutionResult, details: Optional[dict[str, Any]] = None) -> None:
        details = details or {}
        entry = ResolverDiagnostic(
            item_raw=item_raw,
            raw_id=item_raw,
            item_key=item_key,
            display_name_found=bool(result.display_name and result.display_name != item_raw),
            icon_found=bool(result.icon_asset_id),
            display_name=result.display_name,
            icon_asset_id=result.icon_asset_id,
            icon_url=result.icon_url,
            source=details.get('source'),
            strategy=result.strategy,
            confidence=result.confidence,
            checked_sources=list(details.get('checked_sources', [])),
            checked_keys=list(details.get('checked_keys', [])),
            reason=details.get('reason'),
            trace=list(result.trace),
        )
        entries = [item for item in self._resolver_payload['entries'] if item.get('item_raw') != item_raw]
        entries.append(asdict(entry))
        self._resolver_payload = {'entries': entries}

    def record_parse(self, diagnostic: ParseDiagnostic) -> None:
        payload = asdict(diagnostic)
        history = [payload, *self._parse_payload.get('history', [])][:10]
        self._parse_payload = {'latest': payload, 'history': history}

    def build_parse_diagnostic_for_recipe(self, raw_input: str, recipe: Recipe) -> ParseDiagnostic:
        parsed_cells = []
        failed_cells = []
        null_cells = []
        for row in recipe.matrix:
            for cell in row:
                cell_info = {'row': cell.row, 'col': cell.col, 'raw': cell.raw}
                if cell.raw is None:
                    null_cells.append(cell_info)
                elif cell.item is None:
                    failed_cells.append(cell_info)
                else:
                    parsed_cells.append({**cell_info, 'parsed': cell.item.raw})
        return ParseDiagnostic(
            input_kind='recipe',
            raw_input=raw_input,
            success=True,
            output_raw=recipe.output.raw,
            matrix_width=recipe.grid_w,
            matrix_height=recipe.grid_h,
            parsed_cells=parsed_cells,
            failed_cells=failed_cells,
            null_cells=null_cells,
            warnings=list(recipe.diagnostics),
            errors=[],
        )

    def build_parse_error(self, raw_input: str, exc: Exception) -> ParseDiagnostic:
        return ParseDiagnostic(
            input_kind='unknown',
            raw_input=raw_input,
            success=False,
            warnings=[],
            errors=[asdict(DebugIssue(level='error', category='parse', message=str(exc), error_type=exc.__class__.__name__))],
        )

    def snapshot(self) -> dict[str, Any]:
        errors = []
        missing_links = []
        for issue in self._recipe_scan_payload.get('scan_errors', []):
            errors.append(issue)
        for issue in self._asset_scan_payload.get('scan_errors', []):
            errors.append(issue)
        for issue in self._parse_payload.get('latest', {}).get('errors', []) if self._parse_payload.get('latest') else []:
            errors.append(issue)
        missing_links.extend(self._asset_scan_payload.get('missing_icons', []))
        summary = self._build_summary()
        snapshot = DebugSnapshot(
            summary=summary,
            config=self._config_payload,
            recipe_scan=self._recipe_scan_payload,
            asset_scan=self._asset_scan_payload,
            resolver=self._resolver_payload,
            parse=self._parse_payload,
            errors=errors,
            missing_links=missing_links,
        )
        return snapshot.to_dict()

    def _build_summary(self) -> dict[str, int]:
        recipe_files = self._recipe_scan_payload.get('files', [])
        asset_sources = self._asset_scan_payload.get('sources', [])
        parse_latest = self._parse_payload.get('latest') or {}
        return {
            'recipes_scanned': sum(int(item.get('recipe_count', 0)) for item in recipe_files),
            'recipes_failed': len(self._recipe_scan_payload.get('scan_errors', [])) + sum(len(item.get('unparsed_fragments', [])) for item in recipe_files),
            'assets_scanned': sum(int(item.get('indexed_files', 0)) for item in asset_sources),
            'icons_found': int(self._asset_scan_payload.get('counters', {}).get('textures_items', 0)) + int(self._asset_scan_payload.get('counters', {}).get('textures_blocks', 0)),
            'icons_missing': len(self._asset_scan_payload.get('missing_icons', [])),
            'lang_entries_loaded': int(self._asset_scan_payload.get('counters', {}).get('lang_entries', 0)),
            'parse_warnings': len(parse_latest.get('warnings', [])),
            'errors': len(self._recipe_scan_payload.get('scan_errors', [])) + len(self._asset_scan_payload.get('scan_errors', [])) + len(parse_latest.get('errors', [])),
        }
