from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.auth.permissions import normalize_email


MAX_DRAFT_TEMPLATES = 1000
MAX_DRAFT_TEMPLATES_PER_USER = 200


class RecipeDraftTemplateStore:
    def __init__(self, storage_path: Path) -> None:
        self.storage_path = storage_path
        self._lock = threading.Lock()

    def list_for_user(self, email: str, can_view_all: bool) -> list[dict[str, Any]]:
        normalized_email = normalize_email(email)
        templates = self._read_templates()
        visible = templates if can_view_all else [
            item for item in templates
            if normalize_email(str(item.get('createdByEmail', ''))) == normalized_email
        ]
        return sorted(visible, key=lambda item: int(item.get('updatedAt', 0) or 0), reverse=True)

    def create_for_user(self, payload: dict[str, Any], email: str) -> dict[str, Any]:
        normalized_email = normalize_email(email)
        now = int(datetime.now(timezone.utc).timestamp() * 1000)
        source_text = str(payload.get('sourceText') or '')
        output_raw = str(payload.get('outputRaw') or '')
        draft_id = self._draft_id(normalized_email, output_raw, source_text, now)
        template = {
            'id': draft_id,
            'outputRaw': output_raw,
            'recipe': payload.get('recipe') or {},
            'sourceText': source_text,
            'createdByEmail': normalized_email,
            'createdAt': now,
            'updatedAt': now,
            'name': str(payload.get('name') or output_raw or 'Draft template'),
        }
        with self._lock:
            templates = [item for item in self._read_templates() if item.get('id') != draft_id]
            templates.insert(0, template)
            self._write_templates(self._bounded_templates(templates))
        return template

    def delete_for_user(self, draft_id: str, email: str, can_delete_all: bool) -> None:
        normalized_email = normalize_email(email)
        with self._lock:
            templates = self._read_templates()
            target = next((item for item in templates if item.get('id') == draft_id), None)
            if target is None:
                raise KeyError('Draft template not found')
            owner_email = normalize_email(str(target.get('createdByEmail', '')))
            if not can_delete_all and owner_email != normalized_email:
                raise PermissionError('Cannot delete another user draft template')
            self._write_templates([item for item in templates if item.get('id') != draft_id])

    def _read_templates(self) -> list[dict[str, Any]]:
        if not self.storage_path.is_file():
            return []
        try:
            payload = json.loads(self.storage_path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return []
        raw_templates = payload.get('templates') if isinstance(payload, dict) else payload
        if not isinstance(raw_templates, list):
            return []
        return [
            item for item in raw_templates
            if isinstance(item, dict)
            and isinstance(item.get('id'), str)
            and isinstance(item.get('outputRaw'), str)
            and isinstance(item.get('sourceText'), str)
            and isinstance(item.get('createdByEmail'), str)
        ]

    def _write_templates(self, templates: list[dict[str, Any]]) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            'schemaVersion': 1,
            'savedAt': int(datetime.now(timezone.utc).timestamp() * 1000),
            'templates': templates,
        }
        tmp_path = self.storage_path.with_suffix(f'{self.storage_path.suffix}.tmp')
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        tmp_path.replace(self.storage_path)

    def _bounded_templates(self, templates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        per_user_counts: dict[str, int] = {}
        bounded: list[dict[str, Any]] = []
        for template in sorted(templates, key=lambda item: int(item.get('updatedAt', 0) or 0), reverse=True):
            owner = normalize_email(str(template.get('createdByEmail', '')))
            next_count = per_user_counts.get(owner, 0) + 1
            if next_count > MAX_DRAFT_TEMPLATES_PER_USER:
                continue
            per_user_counts[owner] = next_count
            bounded.append(template)
            if len(bounded) >= MAX_DRAFT_TEMPLATES:
                break
        return bounded

    def _draft_id(self, email: str, output_raw: str, source_text: str, timestamp_ms: int) -> str:
        key = f'{email}:{output_raw}:{source_text}:{timestamp_ms}'
        return hashlib.sha1(key.encode('utf-8')).hexdigest()[:16]
