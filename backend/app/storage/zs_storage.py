from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional, Union

from app.domain.models import Recipe
from app.parsers.recipe_parser import RecipeParser


@dataclass
class StoredRecipe:
    recipe: Recipe
    file_path: str
    start_offset: int
    end_offset: int
    raw_block: str


class ZsStorage:
    def __init__(self, scripts_dir: Union[str, Path], log_service: Optional[Any] = None):
        self.scripts_dir = Path(scripts_dir)
        self.log_service = log_service
        self.extra_recipe_sources: list[Path] = []
        self.allowed_write_roots: list[Path] = []
        self.parser = RecipeParser()
        self._recipes: dict[str, StoredRecipe] = {}
        self._by_output: dict[str, list[str]] = {}
        self._by_ingredient: dict[str, list[str]] = {}
        self.last_scan_report: dict[str, Any] = {
            'active_paths': [],
            'files': [],
            'scan_errors': [],
            'unparsed_fragments': [],
        }
        self._recipe_pattern = re.compile(r'(?:recipes\.addShaped|mods\.avaritia\.ExtremeCrafting\.addShaped)\(.*?\);', re.S)

    def scan(self, extra_paths: list[Union[str, Path]] = None) -> None:
        self._recipes.clear()
        self._by_output.clear()
        self._by_ingredient.clear()
        extra_paths = extra_paths or []
        self.extra_recipe_sources = [Path(path) for path in extra_paths if str(path)]
        self.allowed_write_roots = self._build_allowed_write_roots()
        paths = [self.scripts_dir, *self.extra_recipe_sources]
        self.last_scan_report = {
            'active_paths': [str(path) for path in paths],
            'files': [],
            'scan_errors': [],
            'unparsed_fragments': [],
        }
        if self.log_service is not None:
            self.log_service.log('BACKEND', 'INFO', 'RECIPES', 'Recipe scan started', {'active_paths': [str(path) for path in paths]})
        for root in paths:
            if not root.exists():
                issue = self._issue('error', 'recipe_path', 'Recipe source path does not exist', source_path=str(root))
                self.last_scan_report['scan_errors'].append(issue)
                if self.log_service is not None:
                    self.log_service.log('BACKEND', 'ERROR', 'RECIPES', 'Recipe source path does not exist', issue)
                continue
            if root.is_file() and root.suffix == '.zs':
                self._scan_file(root, root.parent, self._recipe_pattern, source='extra_recipe_source_file')
                continue
            if root.is_dir():
                for file_path in sorted(root.rglob('*.zs')):
                    source = 'scripts_dir' if root == self.scripts_dir else 'extra_recipe_source'
                    self._scan_file(file_path, root, self._recipe_pattern, source=source)
                continue
            issue = self._issue('warning', 'recipe_path', 'Unsupported recipe source type', source_path=str(root))
            self.last_scan_report['scan_errors'].append(issue)
            if self.log_service is not None:
                self.log_service.log('BACKEND', 'WARN', 'RECIPES', 'Unsupported recipe source type', issue)

    def _scan_file(self, file_path: Path, root: Path, pattern: re.Pattern, source: str) -> None:
        file_report = {
            'path': str(file_path),
            'exists': file_path.exists(),
            'discovered': True,
            'scanned': False,
            'read_ok': False,
            'source': source,
            'recipe_count': 0,
            'recognized_types': [],
            'blocks': [],
            'unparsed_fragments': [],
            'errors': [],
        }
        if self.log_service is not None:
            self.log_service.log('BACKEND', 'INFO', 'RECIPES', 'Reading recipe file', {'file_path': str(file_path), 'source': source}, verbose_only=True)
        try:
            text = file_path.read_text(encoding='utf-8')
            file_report['read_ok'] = True
            file_report['scanned'] = True
        except Exception as exc:
            issue = self._issue('error', 'recipe_read', str(exc), file_path=str(file_path), source_path=str(root), error_type=exc.__class__.__name__)
            file_report['errors'].append(issue)
            self.last_scan_report['scan_errors'].append(issue)
            self.last_scan_report['files'].append(file_report)
            if self.log_service is not None:
                self.log_service.log('BACKEND', 'ERROR', 'RECIPES', 'Failed to read recipe file', issue)
            return

        for match in pattern.finditer(text):
            block = match.group(0)
            try:
                recipe = self.parser.parse(block, source_kind='zs_file').recipe
                assert recipe is not None
                recipe.source.path = str(file_path)
                recipe.source.start_offset = match.start()
                recipe.source.end_offset = match.end()
                uid = hashlib.sha1(f'{file_path}:{match.start()}'.encode()).hexdigest()[:12]
                recipe.recipe_uid = uid
                stored = StoredRecipe(recipe=recipe, file_path=str(file_path), start_offset=match.start(), end_offset=match.end(), raw_block=block)
                self._recipes[uid] = stored
                file_report['recipe_count'] += 1
                if recipe.recipe_type not in file_report['recognized_types']:
                    file_report['recognized_types'].append(recipe.recipe_type)
                file_report['blocks'].append({
                    'recipe_uid': uid,
                    'recipe_type': recipe.recipe_type,
                    'output_raw': recipe.output.raw,
                    'recognized_types': [recipe.recipe_type],
                    'recipe_count': 1,
                    'file_path': str(file_path),
                    'start_offset': match.start(),
                    'end_offset': match.end(),
                    'diagnostics': list(recipe.diagnostics),
                })
                for key in {recipe.output.raw, recipe.output.base_key}:
                    self._by_output.setdefault(key, []).append(uid)
                self._index_recipe_ingredients(uid, recipe)
                if self.log_service is not None:
                    self.log_service.log('BACKEND', 'INFO', 'RECIPES', 'Recipe parsed from file', {'file_path': str(file_path), 'recipe_uid': uid, 'recipe_type': recipe.recipe_type, 'output': recipe.output.raw, 'grid': f'{recipe.grid_w}x{recipe.grid_h}', 'diagnostics': list(recipe.diagnostics)}, verbose_only=True)
            except Exception as exc:
                line = text.count('\n', 0, match.start()) + 1
                fragment = block[:240]
                issue = self._issue('error', 'recipe_parse', str(exc), file_path=str(file_path), source_path=str(root), error_type=exc.__class__.__name__, line=line, fragment=fragment)
                file_report['errors'].append(issue)
                fragment_payload = {'file_path': str(file_path), 'line': line, 'fragment': fragment, 'message': str(exc)}
                file_report['unparsed_fragments'].append(fragment_payload)
                self.last_scan_report['unparsed_fragments'].append(fragment_payload)
                self.last_scan_report['scan_errors'].append(issue)
                if self.log_service is not None:
                    self.log_service.log('BACKEND', 'ERROR', 'RECIPES', 'Recipe block failed to parse', issue)

        self.last_scan_report['files'].append(file_report)
        if self.log_service is not None:
            self.log_service.log('BACKEND', 'INFO', 'RECIPES', 'Finished recipe file scan', {'file_path': str(file_path), 'recipe_count': file_report['recipe_count'], 'recognized_types': file_report['recognized_types'], 'errors': len(file_report['errors'])}, verbose_only=True)

    def list_files(self) -> list[dict[str, Union[str, int]]]:
        return [
            {'path': item['path'], 'recipeCount': item['recipe_count']}
            for item in self.last_scan_report['files']
        ]

    def search_by_output(self, output_raw: str) -> list[Recipe]:
        try:
            item = self.parser.parse_item_ref(output_raw)
            keys = [output_raw, item.base_key]
        except Exception:
            keys = [output_raw]
        matches = []
        seen: set[str] = set()
        for key in keys:
            for uid in self._by_output.get(key, []):
                if uid not in seen:
                    seen.add(uid)
                    matches.append(self._recipes[uid].recipe)
        return matches

    def search_by_ingredient(self, item_raw: str) -> list[Recipe]:
        try:
            item = self.parser.parse_item_ref(item_raw)
            keys = [item_raw, item.base_key]
        except Exception:
            keys = [item_raw]
        matches = []
        seen: set[str] = set()
        for key in keys:
            for uid in self._by_ingredient.get(key, []):
                if uid not in seen:
                    seen.add(uid)
                    matches.append(self._recipes[uid].recipe)
        return matches

    def get_recipe(self, recipe_uid: str) -> Recipe:
        return self._recipes[recipe_uid].recipe

    def save_existing(self, recipe_uid: str, rendered_block: str) -> Recipe:
        stored = self._recipes[recipe_uid]
        path = Path(stored.file_path)
        text = path.read_text(encoding='utf-8')
        updated = text[: stored.start_offset] + rendered_block + text[stored.end_offset :]
        path.write_text(updated, encoding='utf-8')
        self._rescan_file(path)
        return self.get_recipe(recipe_uid)

    def save_as(self, rendered_block: str, target_path: str) -> str:
        path = self._resolve_writable_path(target_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        prefix = '\n' if path.exists() and path.read_text(encoding='utf-8').strip() else ''
        with path.open('a', encoding='utf-8') as handle:
            handle.write(prefix + rendered_block + '\n')
        self._rescan_file(path)
        latest = max((item for item in self._recipes.values() if item.file_path == str(path)), key=lambda item: item.start_offset)
        return latest.recipe.recipe_uid

    def create_file(self, path: str) -> str:
        file_path = self._resolve_writable_path(path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.touch(exist_ok=True)
        return str(file_path)

    def _build_allowed_write_roots(self) -> list[Path]:
        roots = [self.scripts_dir, *self.extra_recipe_sources]
        normalized: list[Path] = []
        for root in roots:
            try:
                resolved = root.resolve(strict=False)
            except Exception:
                continue
            if resolved not in normalized:
                normalized.append(resolved)
        return normalized

    def _resolve_writable_path(self, raw_path: str) -> Path:
        candidate = Path(raw_path)
        if not candidate.is_absolute():
            candidate = self.scripts_dir / candidate
        resolved_candidate = candidate.resolve(strict=False)
        allowed_roots = self.allowed_write_roots or self._build_allowed_write_roots()
        for root in allowed_roots:
            try:
                resolved_candidate.relative_to(root)
                return resolved_candidate
            except ValueError:
                continue
        raise ValueError(f'Target path is outside allowed recipe roots: {raw_path}')

    def _rescan_file(self, file_path: Path) -> None:
        resolved = file_path.resolve(strict=False)
        self._remove_file_from_index(resolved)
        root, source = self._scan_root_for_file(resolved)
        self._scan_file(resolved, root, self._recipe_pattern, source=source)

    def _remove_file_from_index(self, file_path: Path) -> None:
        file_key = str(file_path)
        removed_uids = [uid for uid, stored in self._recipes.items() if stored.file_path == file_key]
        for uid in removed_uids:
            self._recipes.pop(uid, None)
        self._rebuild_output_index()
        self.last_scan_report['files'] = [
            entry for entry in self.last_scan_report['files']
            if entry.get('path') != file_key
        ]
        self.last_scan_report['unparsed_fragments'] = [
            entry for entry in self.last_scan_report['unparsed_fragments']
            if entry.get('file_path') != file_key
        ]
        self.last_scan_report['scan_errors'] = [
            entry for entry in self.last_scan_report['scan_errors']
            if entry.get('file_path') != file_key
        ]

    def _rebuild_output_index(self) -> None:
        self._by_output.clear()
        self._by_ingredient.clear()
        for uid, stored in self._recipes.items():
            for key in {stored.recipe.output.raw, stored.recipe.output.base_key}:
                self._by_output.setdefault(key, []).append(uid)
            self._index_recipe_ingredients(uid, stored.recipe)

    def _index_recipe_ingredients(self, uid: str, recipe: Recipe) -> None:
        for row in recipe.matrix:
            for cell in row:
                if cell.raw is None or cell.item is None:
                    continue
                for key in {cell.raw, cell.item.base_key}:
                    self._by_ingredient.setdefault(key, []).append(uid)

    def _scan_root_for_file(self, file_path: Path) -> tuple[Path, str]:
        roots = [(self.scripts_dir, 'scripts_dir'), *[(path, 'extra_recipe_source') for path in self.extra_recipe_sources]]
        for root, source in roots:
            root_resolved = root.resolve(strict=False)
            try:
                file_path.relative_to(root_resolved)
                return root_resolved, source
            except ValueError:
                continue
        return file_path.parent, 'extra_recipe_source_file'

    def _issue(self, level: str, category: str, message: str, file_path: str = None, source_path: str = None, error_type: str = None, line: int = None, fragment: str = None) -> dict[str, Any]:
        return {
            'level': level,
            'category': category,
            'message': message,
            'file_path': file_path,
            'source_path': source_path,
            'line': line,
            'fragment': fragment,
            'error_type': error_type,
            'details': {},
        }
