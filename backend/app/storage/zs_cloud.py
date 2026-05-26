from __future__ import annotations

import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


BACKUP_ID_PATTERN = re.compile(r'^[a-f0-9]{16}$')


class ZsCloudBackupService:
    def __init__(self, backup_dir: Path) -> None:
        self.backup_dir = backup_dir

    def backup_file(self, file_path: Path) -> dict[str, Any] | None:
        if not file_path.is_file() or file_path.suffix.lower() != '.zs':
            return None
        backup_id = self._backup_id(file_path)
        target_dir = self.backup_dir / backup_id
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / file_path.name
        shutil.copy2(file_path, target_path)
        stat = target_path.stat()
        metadata = {
            'id': backup_id,
            'name': file_path.name,
            'originalPath': str(file_path.resolve(strict=False)),
            'backupPath': str(target_path.resolve(strict=False)),
            'size': stat.st_size,
            'updatedAt': datetime.now(timezone.utc).isoformat(),
        }
        (target_dir / 'metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        return self._public_metadata(metadata)

    def backup_many(self, file_paths: Iterable[Path]) -> list[dict[str, Any]]:
        backups: list[dict[str, Any]] = []
        for file_path in file_paths:
            backup = self.backup_file(file_path)
            if backup is not None:
                backups.append(backup)
        return backups

    def list_backups(self) -> list[dict[str, Any]]:
        if not self.backup_dir.is_dir():
            return []
        backups: list[dict[str, Any]] = []
        for metadata_path in sorted(self.backup_dir.glob('*/metadata.json')):
            try:
                metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
            except (OSError, json.JSONDecodeError):
                continue
            backup_path = Path(str(metadata.get('backupPath', '')))
            if not backup_path.is_file():
                continue
            backups.append(self._public_metadata(metadata))
        backups.sort(key=lambda item: str(item.get('originalPath', '')).lower())
        return backups

    def read_backup(self, backup_id: str) -> tuple[str, bytes] | None:
        if not BACKUP_ID_PATTERN.match(backup_id):
            return None
        metadata_path = self.backup_dir / backup_id / 'metadata.json'
        if not metadata_path.is_file():
            return None
        try:
            metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return None
        backup_path = Path(str(metadata.get('backupPath', ''))).resolve(strict=False)
        try:
            backup_path.relative_to(self.backup_dir.resolve(strict=False))
        except ValueError:
            return None
        if not backup_path.is_file():
            return None
        return str(metadata.get('name') or backup_path.name), backup_path.read_bytes()

    def _backup_id(self, file_path: Path) -> str:
        key = str(file_path.resolve(strict=False)).lower()
        return hashlib.sha1(key.encode('utf-8')).hexdigest()[:16]

    def _public_metadata(self, metadata: dict[str, Any]) -> dict[str, Any]:
        return {
            'id': metadata.get('id'),
            'name': metadata.get('name'),
            'originalPath': metadata.get('originalPath'),
            'size': metadata.get('size'),
            'updatedAt': metadata.get('updatedAt'),
        }
