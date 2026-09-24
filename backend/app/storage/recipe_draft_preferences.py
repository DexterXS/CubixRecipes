from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.auth.permissions import normalize_email


DEFAULT_SORT_MODE = 'date-desc'
DEFAULT_GROUP_MODE = 'none'
ALLOWED_SORT_MODES = frozenset({'date-desc', 'date-asc', 'drafts-desc', 'drafts-asc', 'name'})
ALLOWED_GROUP_MODES = frozenset({'none', 'mod', 'author', 'date', 'grid-size'})


class RecipeDraftPreferencesStore:
    def __init__(self, storage_path: Path) -> None:
        self.storage_path = storage_path
        self._lock = threading.Lock()

    def get_for_user(self, email: str) -> dict[str, str]:
        normalized_email = normalize_email(email)
        payload = self._read_payload()
        users = payload.get('users') if isinstance(payload.get('users'), dict) else {}
        return self._coerce_preferences(users.get(normalized_email))

    def save_for_user(self, email: str, preferences: dict[str, Any]) -> dict[str, str]:
        normalized_email = normalize_email(email)
        if not normalized_email:
            raise ValueError('A normalized email is required')
        validated = self._validate_preferences(preferences)

        with self._lock:
            payload = self._read_payload()
            users = payload.get('users') if isinstance(payload.get('users'), dict) else {}
            users[normalized_email] = validated
            payload['users'] = users
            self._write_payload(payload)
        return validated

    def _read_payload(self) -> dict[str, Any]:
        if not self.storage_path.is_file():
            return {'schemaVersion': 1, 'users': {}}
        try:
            payload = json.loads(self.storage_path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return {'schemaVersion': 1, 'users': {}}
        return payload if isinstance(payload, dict) else {'schemaVersion': 1, 'users': {}}

    def _write_payload(self, payload: dict[str, Any]) -> None:
        users = payload.get('users') if isinstance(payload.get('users'), dict) else {}
        normalized_users = {
            normalize_email(str(email)): self._coerce_preferences(preferences)
            for email, preferences in users.items()
            if normalize_email(str(email))
        }
        normalized = {
            'schemaVersion': 1,
            'savedAt': int(datetime.now(timezone.utc).timestamp() * 1000),
            'users': normalized_users,
        }
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.storage_path.with_name(f'.{self.storage_path.name}.{uuid4().hex}.tmp')
        try:
            temporary.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            temporary.replace(self.storage_path)
        finally:
            if temporary.exists():
                temporary.unlink()

    def _coerce_preferences(self, raw: Any) -> dict[str, str]:
        if not isinstance(raw, dict):
            return self._defaults()
        sort_mode = raw.get('sortMode')
        group_mode = raw.get('groupMode')
        return {
            'sortMode': sort_mode if isinstance(sort_mode, str) and sort_mode in ALLOWED_SORT_MODES else DEFAULT_SORT_MODE,
            'groupMode': group_mode if isinstance(group_mode, str) and group_mode in ALLOWED_GROUP_MODES else DEFAULT_GROUP_MODE,
        }

    def _validate_preferences(self, raw: dict[str, Any]) -> dict[str, str]:
        if not isinstance(raw, dict):
            raise ValueError('Recipe draft preferences must be an object')
        sort_mode = raw.get('sortMode')
        group_mode = raw.get('groupMode')
        if not isinstance(sort_mode, str) or sort_mode not in ALLOWED_SORT_MODES:
            raise ValueError('Invalid recipe draft sort mode')
        if not isinstance(group_mode, str) or group_mode not in ALLOWED_GROUP_MODES:
            raise ValueError('Invalid recipe draft group mode')
        return {'sortMode': sort_mode, 'groupMode': group_mode}

    def _defaults(self) -> dict[str, str]:
        return {'sortMode': DEFAULT_SORT_MODE, 'groupMode': DEFAULT_GROUP_MODE}
