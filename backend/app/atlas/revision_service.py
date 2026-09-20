from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote

from app.atlas.artifact_store import AtlasArtifactStore


class AtlasRevisionService:
    """Builds Atlas v2 snapshots in the background and publishes them atomically."""

    def __init__(self, root: Path, server_id: str, itempanel_catalog: Any, mod_icon_service: Any) -> None:
        self.server_id = server_id
        self.itempanel_catalog = itempanel_catalog
        self.mod_icon_service = mod_icon_service
        self.store = AtlasArtifactStore(root)
        self._lock = threading.RLock()
        self._worker: Optional[threading.Thread] = None
        self._active_build: Optional[str] = None
        self._rebuild_requested = False

    def start_build(self) -> dict[str, Any]:
        with self._lock:
            if self._worker is not None and self._worker.is_alive() and self._active_build:
                self._rebuild_requested = True
                return {**self.build_status(self._active_build), 'queued': True}
            return self._start_build_locked()

    def _start_build_locked(self) -> dict[str, Any]:
        revision = f'rev-{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")}-{uuid.uuid4().hex[:8]}'
        now = datetime.now(timezone.utc).isoformat()
        self.store.write_state(revision, {
            'revision': revision,
            'server_id': self.server_id,
            'status': 'building',
            'started_at': now,
        })
        self._active_build = revision
        self._worker = threading.Thread(target=self._build, args=(revision,), name=f'atlas-v2-{self.server_id}', daemon=True)
        self._worker.start()
        return self.build_status(revision)

    def build_status(self, revision: str) -> dict[str, Any]:
        state = self.store.read_json(revision, 'state.json') or {'revision': revision, 'status': 'unknown'}
        current = self.store.read_current_revision()
        return {**state, 'active': revision == current}

    def list_revisions(self) -> dict[str, Any]:
        current = self.store.read_current_revision()
        return {
            'activeRevision': current,
            'revisions': [
                {**revision, 'active': revision.get('revision') == current}
                for revision in self.store.list_revisions()
            ],
        }

    def read_active_meta(self) -> Optional[dict[str, Any]]:
        revision = self.store.read_current_revision()
        if not revision:
            return None
        meta = self.store.read_json(revision, 'meta.json')
        if not isinstance(meta, dict):
            return None
        return {**meta, 'activeRevision': revision}

    def read_active_index(self) -> Optional[dict[str, Any]]:
        revision = self.store.read_current_revision()
        if not revision:
            return None
        index = self.store.read_json(revision, 'index.json')
        return index if isinstance(index, dict) else None

    def read_candidates(self, raw: str) -> list[dict[str, Any]]:
        index = self.read_active_index() or {}
        candidates = index.get('candidates', [])
        if not isinstance(candidates, list):
            return []
        return [candidate for candidate in candidates if isinstance(candidate, dict) and candidate.get('raw') == raw]

    def read_page(self, page_name: str, revision: Optional[str] = None) -> Optional[bytes]:
        selected_revision = revision or self.store.read_current_revision()
        if not selected_revision:
            return None
        return self.store.read_page(selected_revision, page_name)

    def activate(self, revision: str) -> dict[str, Any]:
        return self.store.activate(revision)

    def _build(self, revision: str) -> None:
        try:
            meta, index, candidates, pages = self._build_snapshot(revision)
            self.store.write_revision(revision, meta, index, candidates, pages)
            # The first complete snapshot becomes the initial active version.
            # Later builds stay inactive until an administrator activates them.
            if self.store.read_current_revision() is None:
                self.store.activate(revision)
        except Exception as exc:
            self.store.write_state(revision, {
                'revision': revision,
                'server_id': self.server_id,
                'status': 'error',
                'error': f'{exc.__class__.__name__}: {exc}',
                'updated_at': datetime.now(timezone.utc).isoformat(),
            })
        finally:
            with self._lock:
                if self._active_build == revision:
                    self._active_build = None
                    self._worker = None
                    if self._rebuild_requested:
                        self._rebuild_requested = False
                        self._start_build_locked()

    def _build_snapshot(self, revision: str) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]], dict[str, bytes]]:
        candidates: list[dict[str, Any]] = []
        pages: dict[str, bytes] = {}
        page_descriptors: list[dict[str, Any]] = []

        primary_manifest = self.itempanel_catalog.get_atlas_manifest() or {}
        primary_png = self.itempanel_catalog.read_atlas_png()
        if primary_png:
            page_name = 'itempanel-atlas.png'
            pages[page_name] = primary_png
            page_descriptors.append({
                'name': page_name,
                'source': 'primary',
                'size': int(primary_manifest.get('tile_size') or 32),
                'url': self._page_url(revision, page_name),
                'columns': primary_manifest.get('columns'),
                'rows': primary_manifest.get('rows'),
                'tileSize': primary_manifest.get('tile_size'),
            })
            for raw, entry in (primary_manifest.get('entries') or {}).items():
                if not isinstance(entry, dict):
                    continue
                candidates.append({
                    'raw': raw,
                    'key': str(entry.get('item_key') or '').lower(),
                    'meta': entry.get('meta'),
                    'quality': self._normalize_quality(entry.get('quality')),
                    'source': 'primary',
                    'size': 256 if int(primary_manifest.get('tile_size') or 32) >= 128 else 32,
                    'revision': revision,
                    'page': page_name,
                    'x': entry.get('x'),
                    'y': entry.get('y'),
                    'w': entry.get('w'),
                    'h': entry.get('h'),
                    'imageUrl': self._page_url(revision, page_name),
                    'displayName': entry.get('display_name'),
                    'columns': primary_manifest.get('columns'),
                    'rows': primary_manifest.get('rows'),
                    'tileSize': primary_manifest.get('tile_size'),
                })

        mod_manifest = self.mod_icon_service.read_manifest() or {}
        for page in mod_manifest.get('atlases') or []:
            if not isinstance(page, dict):
                continue
            filename = Path(str(page.get('file') or '')).name
            if not filename:
                continue
            content = self.mod_icon_service.read_atlas_png(filename)
            if not content:
                continue
            page_name = f'zip-{filename}'
            pages[page_name] = content
            page_descriptors.append({
                'name': page_name,
                'source': 'zip',
                'size': page.get('size'),
                'url': self._page_url(revision, page_name),
                'columns': page.get('columns'),
                'rows': page.get('rows'),
                'tileSize': page.get('tileSize'),
            })

        for size_key, entries in (mod_manifest.get('entries') or {}).items():
            if not isinstance(entries, dict):
                continue
            for entry in entries.values():
                if not isinstance(entry, dict):
                    continue
                filename = Path(str(entry.get('atlasFile') or '')).name
                if not filename:
                    continue
                page_name = f'zip-{filename}'
                candidates.append({
                    'raw': None,
                    'key': entry.get('key') or f"{entry.get('modid', '')}/{entry.get('iconName', '')}",
                    'meta': None,
                    'quality': self._normalize_quality(entry.get('quality')),
                    'source': 'zip',
                    'size': 256 if int(entry.get('size') or (256 if size_key == 'x256' else 32)) >= 128 else 32,
                    'revision': revision,
                    'page': page_name,
                    'x': entry.get('x'),
                    'y': entry.get('y'),
                    'w': entry.get('w'),
                    'h': entry.get('h'),
                    'imageUrl': self._page_url(revision, page_name),
                    'displayName': entry.get('iconName') or entry.get('entryName'),
                })

        index = {
            'schemaVersion': 2,
            'revision': revision,
            'candidates': candidates,
            'pages': page_descriptors,
        }
        meta = {
            'schemaVersion': 2,
            'revision': revision,
            'serverId': self.server_id,
            'status': 'ready',
            'builtAt': datetime.now(timezone.utc).isoformat(),
            'candidateCount': len(candidates),
            'pageCount': len(pages),
            'sources': {
                'primary': bool(primary_png),
                'zip': bool(mod_manifest.get('atlases')),
            },
        }
        return meta, index, candidates, pages

    @staticmethod
    def _normalize_quality(value: Any) -> str:
        if value in {'question', 'missing_texture_icon'}:
            return 'question'
        if value in {'empty', 'transparent_icon', 'empty_or_black_icon'}:
            return 'empty'
        if value in {'invalid', 'unsupported_icon', 'no_icon_file'}:
            return 'invalid'
        return 'good'

    @staticmethod
    def _page_url(revision: str, page_name: str) -> str:
        return f'/api/atlas/v2/pages/{quote(page_name, safe="")}?revision={quote(revision, safe="")}'
