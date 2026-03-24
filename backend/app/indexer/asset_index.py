from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional
from zipfile import ZipFile


class AssetIndex:
    def __init__(self, log_service: Any = None) -> None:
        self.log_service = log_service
        self.icons: dict[str, list[dict]] = {}
        self.icon_assets: dict[str, dict[str, Any]] = {}
        self.models: dict[str, dict] = {}
        self.lang: dict[str, dict[str, str]] = {}
        self.scan_status: dict[str, dict] = {}
        self.last_scan_report: dict[str, Any] = {
            'indexed_paths': [],
            'sources': [],
            'counters': {},
            'registered_keys': [],
            'missing_icons': [],
            'scan_errors': [],
        }

    def reset(self) -> None:
        self.icons.clear()
        self.icon_assets.clear()
        self.models.clear()
        self.lang.clear()
        self.scan_status.clear()
        self.last_scan_report = {
            'indexed_paths': [],
            'sources': [],
            'counters': {},
            'registered_keys': [],
            'missing_icons': [],
            'scan_errors': [],
        }

    def register_icon(self, key: str, candidate: dict) -> None:
        self.icons.setdefault(key, []).append(candidate)
        asset_id = candidate.get('asset_id')
        if asset_id:
            self.icon_assets[asset_id] = candidate

    def register_model(self, key: str, payload: dict) -> None:
        self.models[key] = payload

    def register_lang(self, locale: str, mapping: dict[str, str]) -> None:
        self.lang.setdefault(locale, {}).update(mapping)

    def scan_paths(self, paths: list[str]) -> str:
        scan_id = f'scan-{len(self.scan_status)+1}'
        self.scan_status[scan_id] = {'progress': 0, 'errors': [], 'startedAt': 'local'}
        report = {
            'indexed_paths': list(paths),
            'sources': [],
            'counters': {
                'textures_items': 0,
                'textures_blocks': 0,
                'lang_entries': 0,
                'models_item': 0,
            },
            'registered_keys': [],
            'missing_icons': [],
            'scan_errors': [],
        }
        if self.log_service is not None:
            self.log_service.log('BACKEND', 'INFO', 'ASSETS', 'Asset scan started', {'indexed_paths': list(paths)})
        for idx, raw_path in enumerate(paths, start=1):
            path = Path(raw_path)
            source_report = {
                'source_path': raw_path,
                'source_kind': 'dir' if path.is_dir() else 'archive' if path.suffix in {'.jar', '.zip'} else 'missing',
                'exists': path.exists(),
                'scanned': False,
                'indexed_files': 0,
                'skipped_files': [],
                'errors': [],
                'registered_keys': [],
                'nested_archives': [],
            }
            try:
                if path.is_dir():
                    self._scan_dir(path, source_report, report)
                    source_report['scanned'] = True
                elif path.suffix in {'.jar', '.zip'} and path.is_file():
                    self._scan_zip(path, source_report, report)
                    source_report['scanned'] = True
                else:
                    issue = self._issue('warning', 'asset_path', 'Asset source path is missing or unsupported', source_path=raw_path)
                    source_report['errors'].append(issue)
                    report['scan_errors'].append(issue)
                    self.scan_status[scan_id]['errors'].append(issue['message'])
                    if self.log_service is not None:
                        self.log_service.log('BACKEND', 'WARN', 'ASSETS', 'Asset source path missing or unsupported', issue)
            except Exception as exc:  # pragma: no cover
                issue = self._issue('error', 'asset_scan', str(exc), source_path=raw_path, error_type=exc.__class__.__name__)
                source_report['errors'].append(issue)
                report['scan_errors'].append(issue)
                self.scan_status[scan_id]['errors'].append(str(exc))
                if self.log_service is not None:
                    self.log_service.log('BACKEND', 'ERROR', 'ASSETS', 'Asset source scan failed', issue)
            report['sources'].append(source_report)
            self.scan_status[scan_id]['progress'] = int(idx / max(len(paths), 1) * 100)
        report['registered_keys'] = sorted(set(report['registered_keys']))
        report['missing_icons'] = self._build_missing_icons()
        self.last_scan_report = report
        if self.log_service is not None:
            self.log_service.log('BACKEND', 'INFO', 'ASSETS', 'Asset scan finished', {
                'counters': report['counters'],
                'sources': len(report['sources']),
                'missing_icons': len(report['missing_icons']),
                'registered_keys': len(report['registered_keys']),
            })
        return scan_id

    def _scan_dir(self, root: Path, source_report: dict[str, Any], report: dict[str, Any]) -> None:
        for file_path in root.rglob('*'):
            if not file_path.is_file():
                continue
            if file_path.suffix in {'.jar', '.zip'}:
                source_report['nested_archives'].append(str(file_path))
                if self.log_service is not None:
                    self.log_service.log('BACKEND', 'INFO', 'ASSETS', 'Scanning nested archive from directory source', {
                        'archive_path': str(file_path),
                        'root_source': source_report['source_path'],
                    })
                self._scan_zip(file_path, source_report, report)
                continue
            rel_path = file_path.relative_to(root).as_posix()
            self._consume_file(file_path, rel_path, source=str(root), source_report=source_report, report=report)

    def _scan_zip(self, archive_path: Path, source_report: dict[str, Any], report: dict[str, Any]) -> None:
        with ZipFile(archive_path) as archive:
            for name in archive.namelist():
                if name.endswith('/'):
                    continue
                self._consume_virtual(
                    name,
                    archive.read(name),
                    source=str(archive_path),
                    source_report=source_report,
                    report=report,
                    locator={'kind': 'archive_entry', 'archive_path': str(archive_path), 'entry_path': name},
                )

    def _consume_file(self, file_path: Path, rel_path: str, source: str, source_report: dict[str, Any], report: dict[str, Any]) -> None:
        try:
            data = file_path.read_bytes()
        except Exception as exc:
            issue = self._issue('error', 'asset_read', str(exc), file_path=str(file_path), source_path=source, error_type=exc.__class__.__name__)
            source_report['errors'].append(issue)
            report['scan_errors'].append(issue)
            if self.log_service is not None:
                self.log_service.log('BACKEND', 'ERROR', 'ASSETS', 'Failed to read asset file', issue)
            return
        self._consume_virtual(
            rel_path,
            data,
            source=source,
            source_report=source_report,
            report=report,
            locator={'kind': 'file', 'file_path': str(file_path)},
        )

    def _consume_virtual(
        self,
        rel_path: str,
        data: bytes,
        source: str,
        source_report: dict[str, Any],
        report: dict[str, Any],
        locator: Optional[dict[str, Any]] = None,
    ) -> None:
        source_report['indexed_files'] += 1
        try:
            recognized = False
            if rel_path.endswith('.jar.tree.json') or rel_path.endswith('.jar.json') or rel_path.endswith('.json'):
                if self._scan_mod_manifest(rel_path, data, source, source_report, report):
                    recognized = True
            if '/lang/' in rel_path and (rel_path.endswith('.json') or rel_path.endswith('.lang')):
                locale = Path(rel_path).stem
                mapping = self._parse_lang(rel_path, data)
                self.register_lang(locale, mapping)
                report['counters']['lang_entries'] += len(mapping)
                if self.log_service is not None:
                    self.log_service.log('BACKEND', 'DEBUG', 'ASSETS', 'Registered language entries', {'source_path': source, 'relative_path': rel_path, 'entries': len(mapping)}, verbose_only=True)
                recognized = True
            if '/models/item/' in rel_path and rel_path.endswith('.json'):
                namespace, item_name = self._extract_namespace_name(rel_path, 'models/item', '.json')
                self.register_model(f'{namespace}:{item_name}', json.loads(data.decode('utf-8')))
                report['counters']['models_item'] += 1
                report['registered_keys'].append(f'{namespace}:{item_name}')
                source_report['registered_keys'].append(f'{namespace}:{item_name}')
                if self.log_service is not None:
                    self.log_service.log('BACKEND', 'DEBUG', 'ASSETS', 'Registered item model', {'item_key': f'{namespace}:{item_name}', 'relative_path': rel_path, 'source_path': source}, verbose_only=True)
                recognized = True
            if rel_path.endswith('.png') and ('/textures/items/' in rel_path or '/textures/blocks/' in rel_path):
                namespace, item_name = self._extract_texture_key(rel_path)
                key = f'{namespace}:{item_name}'
                self.register_icon(
                    key,
                    {
                        'asset_id': self._build_asset_id(source, rel_path),
                        'path': rel_path,
                        'source_type': source,
                        'animated': False,
                        'locator': locator,
                    },
                )
                if self.log_service is not None:
                    self.log_service.log('BACKEND', 'INFO', 'ASSETS', 'Registered texture asset', {'item_key': key, 'relative_path': rel_path, 'source_path': source}, verbose_only=True)
                counter_key = 'textures_items' if '/textures/items/' in rel_path else 'textures_blocks'
                report['counters'][counter_key] += 1
                report['registered_keys'].append(key)
                source_report['registered_keys'].append(key)
                recognized = True
            if rel_path.endswith('.png.mcmeta'):
                target = rel_path[:-7]
                namespace, item_name = self._extract_texture_key(target)
                key = f'{namespace}:{item_name}'
                animation_meta = self._parse_animation_mcmeta(data)
                self._mark_icon_animated(key, source, target, locator, animation_meta)
                report['registered_keys'].append(key)
                source_report['registered_keys'].append(key)
                recognized = True
            if not recognized:
                source_report['skipped_files'].append({'path': rel_path, 'reason': 'unsupported_or_irrelevant'})
                if self.log_service is not None:
                    self.log_service.log('BACKEND', 'DEBUG', 'ASSETS', 'Skipped asset file', {'path': rel_path, 'source_path': source}, verbose_only=True)
        except Exception as exc:
            issue = self._issue('error', 'asset_parse', str(exc), file_path=rel_path, source_path=source, error_type=exc.__class__.__name__)
            source_report['errors'].append(issue)
            report['scan_errors'].append(issue)
            if self.log_service is not None:
                self.log_service.log('BACKEND', 'ERROR', 'ASSETS', 'Failed to parse asset file', issue)

    def _extract_namespace_name(self, rel_path: str, folder: str, suffix: str) -> tuple[str, str]:
        namespace = rel_path.split('/')[1]
        name = rel_path.split(f'/{folder}/', 1)[1][:-len(suffix)]
        return namespace, name

    def _extract_texture_key(self, rel_path: str) -> tuple[str, str]:
        namespace = rel_path.split('/')[1]
        name = rel_path.split('/textures/', 1)[1].split('/', 1)[1][:-4]
        return namespace, name

    def _parse_lang(self, rel_path: str, data: bytes) -> dict[str, str]:
        text = data.decode('utf-8')
        if rel_path.endswith('.json'):
            return json.loads(text)
        result = {}
        for line in text.splitlines():
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            result[key.strip()] = value.strip()
        return result

    def _parse_animation_mcmeta(self, data: bytes) -> dict[str, Any]:
        try:
            payload = json.loads(data.decode('utf-8'))
        except Exception:
            return {}
        animation = payload.get('animation', {}) if isinstance(payload, dict) else {}
        if not isinstance(animation, dict):
            return {}
        frames = animation.get('frames')
        normalized_frames = frames if isinstance(frames, list) else None
        frametime = animation.get('frametime')
        return {
            'frametime': frametime if isinstance(frametime, int) and frametime > 0 else 1,
            'frames': normalized_frames,
            'interpolate': bool(animation.get('interpolate', False)),
        }

    def _build_asset_id(self, source: str, rel_path: str) -> str:
        return f'{source}|{rel_path}'

    def parse_asset_id(self, icon_asset_id: str) -> Optional[tuple[str, str]]:
        if '|' in icon_asset_id:
            source, rel_path = icon_asset_id.split('|', 1)
            return source, rel_path
        if ':' in icon_asset_id:
            source, rel_path = icon_asset_id.split(':', 1)
            return source, rel_path
        return None

    def _mark_icon_animated(
        self,
        key: str,
        source: str,
        target_path: str,
        locator: Optional[dict[str, Any]],
        animation_meta: Optional[dict[str, Any]] = None,
    ) -> None:
        candidates = self.icons.get(key, [])
        for candidate in candidates:
            if candidate.get('path') == target_path and candidate.get('source_type') == source:
                candidate['animated'] = True
                if animation_meta:
                    candidate['animation_meta'] = animation_meta
                return
        self.register_icon(
            key,
            {
                'asset_id': self._build_asset_id(source, target_path),
                'path': target_path,
                'source_type': source,
                'animated': True,
                'locator': locator,
                'animation_meta': animation_meta or {},
            },
        )

    def _scan_mod_manifest(
        self,
        rel_path: str,
        data: bytes,
        source: str,
        source_report: dict[str, Any],
        report: dict[str, Any],
    ) -> bool:
        if '/lang/' in rel_path or '/models/' in rel_path:
            return False
        try:
            payload = json.loads(data.decode('utf-8'))
        except Exception:
            return False
        if not isinstance(payload, dict) or 'tree' not in payload or 'mod_path' not in payload:
            return False
        mod_path = str(payload.get('mod_path') or '')
        tree = payload.get('tree')
        if not mod_path or not isinstance(tree, dict):
            return False
        textures, mcmeta = self._collect_manifest_textures(tree)
        for texture_rel_path in textures:
            if '/textures/' not in texture_rel_path:
                continue
            try:
                namespace, item_name = self._extract_texture_key(texture_rel_path)
            except Exception:
                continue
            key = f'{namespace}:{item_name}'
            texture_locator = {'kind': 'archive_entry', 'archive_path': mod_path, 'entry_path': texture_rel_path}
            self.register_icon(
                key,
                {
                    'asset_id': self._build_asset_id(mod_path, texture_rel_path),
                    'path': texture_rel_path,
                    'source_type': mod_path,
                    'animated': f'{texture_rel_path}.mcmeta' in mcmeta,
                    'locator': texture_locator,
                },
            )
            report['registered_keys'].append(key)
            source_report['registered_keys'].append(key)
            counter_key = 'textures_items' if '/textures/items/' in texture_rel_path else 'textures_blocks'
            report['counters'][counter_key] += 1
        return bool(textures)

    def _collect_manifest_textures(self, tree: dict[str, Any]) -> tuple[set[str], set[str]]:
        textures: set[str] = set()
        mcmeta: set[str] = set()

        def walk_children(children: Any, prefix: str = '') -> None:
            if not isinstance(children, dict):
                return
            for name, node in children.items():
                rel_name = f'{prefix}/{name}' if prefix else str(name)
                if not isinstance(node, dict):
                    continue
                node_type = str(node.get('type') or '')
                if node_type == 'directory':
                    walk_children(node.get('children'), rel_name)
                    continue
                if node_type == 'file':
                    normalized = rel_name.replace('\\', '/')
                    if normalized.endswith('.png') and '/textures/' in normalized:
                        textures.add(normalized)
                    if normalized.endswith('.png.mcmeta') and '/textures/' in normalized:
                        mcmeta.add(normalized)
                    jar_contents = node.get('jar_contents')
                    if isinstance(jar_contents, dict):
                        walk_children(jar_contents.get('children'), '')
                    continue
                walk_children(node.get('children'), rel_name)

        walk_children(tree)
        return textures, mcmeta

    def _build_missing_icons(self) -> list[dict[str, Any]]:
        missing = []
        for key, model in self.models.items():
            layer0 = (model.get('textures') or {}).get('layer0')
            if not isinstance(layer0, str):
                continue
            normalized = layer0.strip()
            if not normalized or normalized.startswith('#'):
                continue
            if ':' in normalized:
                namespace, texture_name = normalized.split(':', 1)
                if not namespace or not texture_name:
                    continue
                texture_key = f'{namespace}:{texture_name}'
            else:
                item_namespace = key.split(':', 1)[0]
                texture_key = f'{item_namespace}:{normalized}'
            if texture_key not in self.icons:
                missing.append({'item_id': key, 'reason': 'model_texture_not_found', 'checked_key': texture_key})
        return missing

    def _issue(self, level: str, category: str, message: str, file_path: str = None, source_path: str = None, error_type: str = None) -> dict[str, Any]:
        return {
            'level': level,
            'category': category,
            'message': message,
            'file_path': file_path,
            'source_path': source_path,
            'line': None,
            'fragment': None,
            'error_type': error_type,
            'details': {},
        }
