from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


REVISION_PATTERN = re.compile(r'^rev-[A-Za-z0-9_-]+$')
FILE_PATTERN = re.compile(r'^[A-Za-z0-9._-]+$')


class AtlasArtifactStore:
    """Stores immutable Atlas v2 revisions and one atomic active pointer."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.revisions_dir = root / 'revisions'
        self.current_path = root / 'current.json'
        self.revisions_dir.mkdir(parents=True, exist_ok=True)

    def revision_path(self, revision: str) -> Path:
        if not REVISION_PATTERN.fullmatch(revision):
            raise ValueError('Invalid atlas revision')
        return self.revisions_dir / revision

    def write_state(self, revision: str, state: dict[str, Any]) -> None:
        revision_dir = self.revision_path(revision)
        revision_dir.mkdir(parents=True, exist_ok=True)
        self._write_json_atomic(revision_dir / 'state.json', state)

    def write_revision(
        self,
        revision: str,
        meta: dict[str, Any],
        index: dict[str, Any],
        candidates: list[dict[str, Any]],
        pages: dict[str, bytes],
    ) -> None:
        revision_dir = self.revision_path(revision)
        revision_dir.mkdir(parents=True, exist_ok=True)
        pages_dir = revision_dir / 'pages'
        pages_dir.mkdir(parents=True, exist_ok=True)
        for page_name, content in pages.items():
            page_path = pages_dir / self._safe_filename(page_name)
            self._write_bytes_atomic(page_path, content)
        self._write_json_atomic(revision_dir / 'candidates.json', candidates)
        self._write_json_atomic(revision_dir / 'index.json', index)
        self._write_json_atomic(revision_dir / 'meta.json', meta)
        self.write_state(revision, {
            'revision': revision,
            'status': 'ready',
            'updated_at': datetime.now(timezone.utc).isoformat(),
        })

    def list_revisions(self) -> list[dict[str, Any]]:
        revisions: list[dict[str, Any]] = []
        if not self.revisions_dir.is_dir():
            return revisions
        for revision_dir in sorted(self.revisions_dir.iterdir(), key=lambda item: item.name, reverse=True):
            if not revision_dir.is_dir() or not REVISION_PATTERN.fullmatch(revision_dir.name):
                continue
            meta = self.read_json(revision_dir.name, 'meta.json')
            state = self.read_json(revision_dir.name, 'state.json') or {}
            payload = meta if isinstance(meta, dict) else state
            if not isinstance(payload, dict):
                continue
            revisions.append({**payload, 'revision': revision_dir.name})
        return revisions

    def read_json(self, revision: str, filename: str) -> Any:
        path = self.revision_path(revision) / self._safe_filename(filename)
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except (OSError, TypeError, ValueError):
            return None

    def read_page(self, revision: str, page_name: str) -> Optional[bytes]:
        state = self.read_json(revision, 'state.json')
        if not isinstance(state, dict) or state.get('status') != 'ready':
            return None
        path = self.revision_path(revision) / 'pages' / self._safe_filename(page_name)
        try:
            content = path.read_bytes()
        except OSError:
            return None
        return content if content.startswith(b'\x89PNG\r\n\x1a\n') else None

    def read_current_revision(self) -> Optional[str]:
        try:
            payload = json.loads(self.current_path.read_text(encoding='utf-8'))
        except (OSError, TypeError, ValueError):
            return None
        revision = payload.get('revision') if isinstance(payload, dict) else None
        return revision if isinstance(revision, str) and REVISION_PATTERN.fullmatch(revision) else None

    def activate(self, revision: str) -> dict[str, Any]:
        meta = self.read_json(revision, 'meta.json')
        if not isinstance(meta, dict) or meta.get('status') != 'ready':
            raise ValueError('Atlas revision is not ready')
        self.root.mkdir(parents=True, exist_ok=True)
        self._write_json_atomic(self.current_path, {
            'revision': revision,
            'activated_at': datetime.now(timezone.utc).isoformat(),
        })
        return meta

    def _safe_filename(self, filename: str) -> str:
        if not isinstance(filename, str) or not FILE_PATTERN.fullmatch(filename):
            raise ValueError('Invalid atlas artifact filename')
        return filename

    def _write_json_atomic(self, path: Path, payload: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f'.{path.name}.{uuid.uuid4().hex}.tmp')
        temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        temporary.replace(path)

    def _write_bytes_atomic(self, path: Path, content: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f'.{path.name}.{uuid.uuid4().hex}.tmp')
        temporary.write_bytes(content)
        temporary.replace(path)
