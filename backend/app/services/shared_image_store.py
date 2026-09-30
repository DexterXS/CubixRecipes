from __future__ import annotations

import base64
import hashlib
import sqlite3
import threading
from contextlib import closing
from pathlib import Path
from typing import Iterable, Optional


class SharedImageStore:
    """Persistent, deduplicated PNG storage shared by all server contexts."""

    _locks_guard = threading.Lock()
    _locks: dict[str, threading.RLock] = {}

    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = self._lock_for(self.db_path)
        self._initialize()

    @classmethod
    def _lock_for(cls, db_path: Path) -> threading.RLock:
        key = str(db_path.resolve(strict=False))
        with cls._locks_guard:
            lock = cls._locks.get(key)
            if lock is None:
                lock = threading.RLock()
                cls._locks[key] = lock
            return lock

    def sync_server_icons(
        self,
        server_id: str,
        icons_dir: Path,
        filenames: Iterable[str],
    ) -> dict[str, int]:
        """Synchronize the current server icon set without rereading unchanged PNGs."""
        self._validate_server_id(server_id)
        icons_root = Path(icons_dir).resolve(strict=False)
        requested = self._safe_filenames(filenames)

        synced = 0
        unchanged = 0
        missing = 0
        removed = 0

        with self._lock, closing(self._connect()) as connection:
            existing = {
                row['filename']: row
                for row in connection.execute(
                    'SELECT filename, asset_key, size, mtime_ns '
                    'FROM image_sources WHERE server_id = ?',
                    (server_id,),
                ).fetchall()
            }

            for filename in set(existing) - requested:
                connection.execute(
                    'DELETE FROM image_sources WHERE server_id = ? AND filename = ?',
                    (server_id, filename),
                )
                removed += 1

            for filename in sorted(requested):
                path = self._safe_icon_path(icons_root, filename)
                try:
                    exists = path is not None and path.is_file()
                except (OSError, ValueError):
                    exists = False
                if not exists:
                    if filename in existing:
                        connection.execute(
                            'DELETE FROM image_sources WHERE server_id = ? AND filename = ?',
                            (server_id, filename),
                        )
                        removed += 1
                    missing += 1
                    continue

                try:
                    stat = path.stat()
                except OSError:
                    if filename in existing:
                        connection.execute(
                            'DELETE FROM image_sources WHERE server_id = ? AND filename = ?',
                            (server_id, filename),
                        )
                        removed += 1
                    missing += 1
                    continue

                previous = existing.get(filename)
                if (
                    previous is not None
                    and previous['size'] == stat.st_size
                    and previous['mtime_ns'] == stat.st_mtime_ns
                ):
                    unchanged += 1
                    continue

                try:
                    content = path.read_bytes()
                except OSError:
                    if filename in existing:
                        connection.execute(
                            'DELETE FROM image_sources WHERE server_id = ? AND filename = ?',
                            (server_id, filename),
                        )
                        removed += 1
                    missing += 1
                    continue

                asset_key = hashlib.sha256(content).hexdigest()
                connection.execute(
                    'INSERT OR IGNORE INTO image_assets '
                    '(asset_key, mime, base64_data, byte_size) VALUES (?, ?, ?, ?)',
                    (
                        asset_key,
                        'image/png',
                        base64.b64encode(content).decode('ascii'),
                        len(content),
                    ),
                )
                connection.execute(
                    'INSERT INTO image_sources '
                    '(server_id, filename, asset_key, size, mtime_ns) VALUES (?, ?, ?, ?, ?) '
                    'ON CONFLICT(server_id, filename) DO UPDATE SET '
                    'asset_key = excluded.asset_key, size = excluded.size, '
                    'mtime_ns = excluded.mtime_ns',
                    (server_id, filename, asset_key, stat.st_size, stat.st_mtime_ns),
                )
                synced += 1

            connection.execute(
                'DELETE FROM image_assets WHERE NOT EXISTS ('
                'SELECT 1 FROM image_sources WHERE image_sources.asset_key = image_assets.asset_key'
                ')'
            )
            connection.commit()

        return {
            'synced': synced,
            'unchanged': unchanged,
            'missing': missing,
            'removed': removed,
        }

    def get_assets(self, server_id: str, filenames: Iterable[str]) -> dict[str, dict[str, str]]:
        """Return stored assets keyed by filename, omitting missing images."""
        self._validate_server_id(server_id)
        requested = sorted(self._safe_filenames(filenames))
        if not requested:
            return {}

        placeholders = ', '.join('?' for _ in requested)
        query = (
            'SELECT sources.filename, assets.mime, assets.base64_data '
            'FROM image_sources AS sources '
            'JOIN image_assets AS assets ON assets.asset_key = sources.asset_key '
            'WHERE sources.server_id = ? AND sources.filename IN ('
            f'{placeholders})'
        )
        with self._lock, closing(self._connect()) as connection:
            rows = connection.execute(query, (server_id, *requested)).fetchall()

        return {
            row['filename']: {
                'filename': row['filename'],
                'mime': row['mime'],
                'data': row['base64_data'],
            }
            for row in rows
        }

    def _initialize(self) -> None:
        with self._lock, closing(self._connect()) as connection:
            connection.executescript(
                '''
                CREATE TABLE IF NOT EXISTS image_assets (
                    asset_key TEXT PRIMARY KEY,
                    mime TEXT NOT NULL,
                    base64_data TEXT NOT NULL,
                    byte_size INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS image_sources (
                    server_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    asset_key TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    mtime_ns INTEGER NOT NULL,
                    PRIMARY KEY (server_id, filename),
                    FOREIGN KEY (asset_key) REFERENCES image_assets(asset_key)
                );
                CREATE INDEX IF NOT EXISTS idx_image_sources_server
                    ON image_sources(server_id);
                CREATE INDEX IF NOT EXISTS idx_image_sources_asset
                    ON image_sources(asset_key);
                CREATE INDEX IF NOT EXISTS idx_image_sources_server_filename
                    ON image_sources(server_id, filename);
                '''
            )
            connection.commit()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(str(self.db_path), timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA journal_mode = WAL')
        connection.execute('PRAGMA synchronous = NORMAL')
        connection.execute('PRAGMA foreign_keys = ON')
        return connection

    def _safe_filenames(self, filenames: Iterable[str]) -> set[str]:
        safe: set[str] = set()
        for filename in filenames:
            if not isinstance(filename, str):
                continue
            normalized = filename.strip()
            if self._safe_icon_path(Path('.').resolve(), normalized) is not None:
                safe.add(normalized)
        return safe

    def _safe_icon_path(self, icons_root: Path, filename: str) -> Optional[Path]:
        try:
            filename_path = Path(filename)
            if not filename or filename_path.is_absolute() or filename_path.suffix.lower() != '.png':
                return None
            candidate = (icons_root / filename).resolve(strict=False)
            candidate.relative_to(icons_root)
        except (OSError, RuntimeError, ValueError):
            return None
        return candidate

    def _validate_server_id(self, server_id: str) -> None:
        if not isinstance(server_id, str) or not server_id.strip():
            raise ValueError('server_id must not be empty')
