from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'


class ItemPanelStaticStore:
    """Persistent server snapshot used as the frontend's static fallback."""

    VERSION = 1
    ASSET_NAMES = (
        'itempanel.csv',
        'itempanel-catalog.json',
        'itempanel-atlas.json',
        'itempanel-atlas.png',
    )

    def __init__(self, storage_dir: Path) -> None:
        self.storage_dir = storage_dir
        self.metadata_path = storage_dir / 'manifest.json'
        self.revisions_dir = storage_dir / 'revisions'

    def publish(
        self,
        csv_path: Path,
        catalog_payload: dict[str, Any],
        atlas_manifest: dict[str, Any],
        atlas_png: bytes,
    ) -> dict[str, Any]:
        if not csv_path.is_file():
            raise FileNotFoundError('itempanel.csv is not available')
        if not atlas_png.startswith(PNG_SIGNATURE):
            raise ValueError('itempanel atlas PNG is not available')

        csv_bytes = csv_path.read_bytes()
        catalog_bytes = self._json_bytes(catalog_payload)
        atlas_manifest_bytes = self._json_bytes(atlas_manifest)
        version = hashlib.sha256(
            b'\0'.join((csv_bytes, catalog_bytes, atlas_manifest_bytes, atlas_png))
        ).hexdigest()[:16]
        published_at = datetime.now(timezone.utc).isoformat()
        metadata = {
            'version': version,
            'store_version': self.VERSION,
            'published_at': published_at,
            'assets': list(self.ASSET_NAMES),
            'summary': {
                'catalog_entries': len(catalog_payload.get('entries', [])),
                'atlas_entries': len(atlas_manifest.get('entries', {})),
            },
        }

        self.revisions_dir.mkdir(parents=True, exist_ok=True)
        revision_dir = self.revisions_dir / version
        revision_dir.mkdir(parents=True, exist_ok=True)
        self._write_atomic(revision_dir / 'itempanel.csv', csv_bytes)
        self._write_atomic(revision_dir / 'itempanel-catalog.json', catalog_bytes)
        self._write_atomic(revision_dir / 'itempanel-atlas.json', atlas_manifest_bytes)
        self._write_atomic(revision_dir / 'itempanel-atlas.png', atlas_png)
        self._write_atomic(self.metadata_path, self._json_bytes(metadata))
        return metadata

    def status(self) -> dict[str, Any]:
        try:
            metadata = json.loads(self.metadata_path.read_text(encoding='utf-8'))
            if not isinstance(metadata, dict) or metadata.get('store_version') != self.VERSION:
                return {'available': False}
            revision_dir = self._revision_dir(metadata)
            missing = [name for name in self.ASSET_NAMES if not (revision_dir / name).is_file()]
            if missing:
                return {'available': False, 'version': metadata.get('version'), 'missing': missing}
            return {'available': True, **metadata}
        except (OSError, TypeError, ValueError):
            return {'available': False}

    def read_asset(self, name: str) -> Optional[bytes]:
        if name not in self.ASSET_NAMES or not self.status().get('available'):
            return None
        try:
            metadata = self._load_metadata()
            revision_dir = self._revision_dir(metadata) if metadata else None
            if revision_dir is None:
                return None
            return (revision_dir / name).read_bytes()
        except OSError:
            return None

    def read_atlas_manifest(self, image_url: str) -> Optional[dict[str, Any]]:
        raw = self.read_asset('itempanel-atlas.json')
        if raw is None:
            return None
        try:
            manifest = json.loads(raw.decode('utf-8'))
        except (UnicodeDecodeError, TypeError, ValueError):
            return None
        if not isinstance(manifest, dict):
            return None
        result = dict(manifest)
        result['image_url'] = image_url
        return result

    def _json_bytes(self, payload: dict[str, Any]) -> bytes:
        return json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')

    def _load_metadata(self) -> Optional[dict[str, Any]]:
        try:
            payload = json.loads(self.metadata_path.read_text(encoding='utf-8'))
        except (OSError, TypeError, ValueError):
            return None
        return payload if isinstance(payload, dict) else None

    def _revision_dir(self, metadata: dict[str, Any]) -> Path:
        revision = str(metadata.get('version', '')).strip()
        if not revision or any(character not in '0123456789abcdef' for character in revision.lower()):
            return self.revisions_dir / '__invalid__'
        return self.revisions_dir / revision

    def _write_atomic(self, path: Path, content: bytes) -> None:
        temporary = path.with_name(f'.{path.name}.tmp')
        temporary.write_bytes(content)
        temporary.replace(path)
