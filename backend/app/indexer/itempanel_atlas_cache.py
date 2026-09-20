from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Optional


class ItemPanelAtlasCache:
    """Persistent cache for one server's generated itempanel atlas."""

    VERSION = 2

    def __init__(self, cache_dir: Optional[Path]) -> None:
        self.cache_dir = cache_dir

    def source_key(self, csv_path: Path, icons_dir: Path, icon_files: tuple[str, ...]) -> str:
        def stat_marker(path: Path) -> dict[str, object]:
            try:
                stat = path.stat()
            except OSError:
                return {'path': str(path.resolve(strict=False)), 'missing': True}
            return {
                'path': str(path.resolve(strict=False)),
                'size': stat.st_size,
                'mtime_ns': stat.st_mtime_ns,
            }

        icon_file_set = set(icon_files)
        icon_markers: dict[str, dict[str, object]] = {}
        try:
            with os.scandir(icons_dir) as directory:
                for entry in directory:
                    if entry.name not in icon_file_set:
                        continue
                    try:
                        stat = entry.stat(follow_symlinks=False)
                    except OSError:
                        icon_markers[entry.name] = {'name': entry.name, 'missing': True}
                        continue
                    icon_markers[entry.name] = {
                        'name': entry.name,
                        'size': stat.st_size,
                        'mtime_ns': stat.st_mtime_ns,
                    }
        except OSError:
            icon_markers = {}
        for icon_file in icon_files:
            icon_markers.setdefault(icon_file, {'name': icon_file, 'missing': True})

        payload = {
            'version': self.VERSION,
            'csv': stat_marker(csv_path),
            'icons_dir': stat_marker(icons_dir),
            'icon_files': [icon_markers[icon_file] for icon_file in sorted(icon_markers)],
        }
        encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
        return hashlib.sha256(encoded).hexdigest()

    def load(self, source_key: str) -> Optional[tuple[dict, bytes]]:
        paths = self._paths()
        if paths is None:
            return None
        manifest_path, png_path = paths
        try:
            payload = json.loads(manifest_path.read_text(encoding='utf-8'))
            if not isinstance(payload, dict):
                return None
            if payload.get('version') != self.VERSION or payload.get('source_key') != source_key:
                return None
            manifest = payload.get('manifest')
            atlas_png = png_path.read_bytes()
            if not isinstance(manifest, dict) or not atlas_png.startswith(b'\x89PNG\r\n\x1a\n'):
                return None
            return manifest, atlas_png
        except (OSError, TypeError, ValueError):
            return None

    def save(self, source_key: str, manifest: dict, atlas_png: bytes) -> None:
        paths = self._paths()
        if paths is None:
            return
        manifest_path, png_path = paths
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            png_tmp = png_path.with_name(f'{png_path.name}.tmp')
            manifest_tmp = manifest_path.with_name(f'{manifest_path.name}.tmp')
            png_tmp.write_bytes(atlas_png)
            manifest_tmp.write_text(
                json.dumps(
                    {'version': self.VERSION, 'source_key': source_key, 'manifest': manifest},
                    ensure_ascii=False,
                    separators=(',', ':'),
                ),
                encoding='utf-8',
            )
            png_tmp.replace(png_path)
            manifest_tmp.replace(manifest_path)
        except OSError:
            return

    def _paths(self) -> Optional[tuple[Path, Path]]:
        if self.cache_dir is None:
            return None
        return (
            self.cache_dir / 'itempanel-atlas.json',
            self.cache_dir / 'itempanel-atlas.png',
        )
