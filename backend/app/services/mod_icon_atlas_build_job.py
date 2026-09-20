from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional


class ModIconAtlasBuildJob:
    """Runs ZIP atlas packing outside HTTP handlers and exposes a small job status."""

    def __init__(self, generator: Callable[[], dict[str, Any]]) -> None:
        self._generator = generator
        self._lock = threading.RLock()
        self._worker: Optional[threading.Thread] = None
        self._job_id: Optional[str] = None
        self._status = 'idle'
        self._started_at: Optional[str] = None
        self._finished_at: Optional[str] = None
        self._error: Optional[str] = None
        self._summary: dict[str, Any] = {}
        self._on_ready: Optional[Callable[[], Any]] = None

    def start(self, on_ready: Optional[Callable[[], Any]] = None) -> dict[str, Any]:
        with self._lock:
            if self._worker is not None and self._worker.is_alive() and self._job_id:
                return self.status()
            self._job_id = f'mod-atlas-{uuid.uuid4().hex[:12]}'
            self._status = 'queued'
            self._started_at = datetime.now(timezone.utc).isoformat()
            self._finished_at = None
            self._error = None
            self._summary = {}
            self._on_ready = on_ready
            self._worker = threading.Thread(target=self._run, name='mod-icon-atlas-build', daemon=True)
            self._worker.start()
            return self.status()

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {
                'jobId': self._job_id,
                'status': self._status,
                'startedAt': self._started_at,
                'finishedAt': self._finished_at,
                'error': self._error,
                'summary': dict(self._summary),
            }

    def _run(self) -> None:
        with self._lock:
            self._status = 'building'
        try:
            manifest = self._generator()
            with self._lock:
                self._status = 'ready'
                self._finished_at = datetime.now(timezone.utc).isoformat()
                self._summary = {
                    'revision': manifest.get('revision'),
                    'totalMods': manifest.get('totalMods'),
                    'totalIcons': manifest.get('totalIcons'),
                    'atlasCount': len(manifest.get('atlases') or []),
                }
                callback = self._on_ready
            if callback:
                try:
                    callback()
                except Exception:
                    # The atlas itself is ready even if the follow-up v2 snapshot is retried later.
                    pass
        except Exception as exc:
            with self._lock:
                self._status = 'error'
                self._finished_at = datetime.now(timezone.utc).isoformat()
                self._error = f'{exc.__class__.__name__}: {exc}'
