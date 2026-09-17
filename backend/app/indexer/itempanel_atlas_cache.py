from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Optional


class ItemPanelAtlasCache:
    """Persistent cache for the explicitly published itempanel atlas."""

    VERSION = 1

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

        payload = {
            'version': self.VERSION,
            'csv': stat_marker(csv_path),
            'icons_dir': stat_marker(icons_dir),
            'icon_files': icon_files,
        }
        encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
        return hashlib.sha256(encoded).hexdigest()

    def load(self, source_key: str) -> Optional[tuple[dict, bytes]]:
        """Load an atlas only when it matches the current source fingerprint.

        Kept for callers that need strict source validation. Published atlases
        use :meth:`load_published`, because a generated snapshot must remain
        stable until an administrator explicitly replaces it.
        """
        return self._load(expected_source_key=source_key)

    def load_published(self) -> Optional[tuple[dict, bytes]]:
        """Load the last explicitly saved atlas without rebuilding it."""
        return self._load(expected_source_key=None)

    def _load(self, expected_source_key: Optional[str]) -> Optional[tuple[dict, bytes]]:
        paths = self._paths()
        if paths is None:
            return None
        manifest_path, png_path = paths
        try:
            payload = json.loads(manifest_path.read_text(encoding='utf-8'))
            if not isinstance(payload, dict):
                return None
            if payload.get('version') != self.VERSION:
                return None
            if expected_source_key is not None and payload.get('source_key') != expected_source_key:
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
