from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.auth.permissions import normalize_email


MAX_FAVORITE_TABS = 32
MAX_FAVORITE_ITEMS_PER_TAB = 512
MAX_HIDDEN_PATTERNS = 200
DEFAULT_TAB_ID = 'default'
DEFAULT_TAB_NAME = 'Основное'
DEFAULT_FAVORITE_HOTKEY = 'A'


class NeiFavoritesStore:
    def __init__(self, storage_path: Path) -> None:
        self.storage_path = storage_path
        self._lock = threading.Lock()

    def get_board(self, user_email: str) -> dict[str, Any]:
        payload = self._read_payload()
        users = payload.get('users') if isinstance(payload.get('users'), dict) else {}
        return self._coerce_board(users.get(self._user_key(user_email)))

    def save_board(self, user_email: str, raw_payload: dict[str, Any]) -> dict[str, Any]:
        user_key = self._user_key(user_email)
        with self._lock:
            payload = self._read_payload()
            users = payload.get('users') if isinstance(payload.get('users'), dict) else {}
            next_board = self._coerce_board(raw_payload)
            users[user_key] = next_board
            payload['users'] = users
            self._write_payload(payload)
        return self.get_board(user_email)

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
            self._user_key(email): self._coerce_board(board)
            for email, board in users.items()
            if self._user_key(str(email))
        }
        normalized = {
            'schemaVersion': 1,
            'savedAt': self._now_ms(),
            'users': normalized_users,
        }
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.storage_path.with_suffix(f'{self.storage_path.suffix}.tmp')
        tmp_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        tmp_path.replace(self.storage_path)

    def _coerce_board(self, raw: Any) -> dict[str, Any]:
        payload = raw if isinstance(raw, dict) else {}
        tabs = self._coerce_tabs(payload.get('tabs'))
        active_tab_id = self._coerce_id(payload.get('activeTabId')) or tabs[0]['id']
        if not any(tab['id'] == active_tab_id for tab in tabs):
            active_tab_id = tabs[0]['id']
        return {
            'activeTabId': active_tab_id,
            'favoriteHotkey': self._coerce_hotkey(payload.get('favoriteHotkey')),
            'hiddenPatterns': self._coerce_hidden_patterns(payload.get('hiddenPatterns')),
            'tabs': tabs,
        }

    def _coerce_tabs(self, raw: Any) -> list[dict[str, Any]]:
        values = raw if isinstance(raw, list) else []
        tabs: list[dict[str, Any]] = []
        used_ids: set[str] = set()
        for index, value in enumerate(values[:MAX_FAVORITE_TABS]):
            if not isinstance(value, dict):
                continue
            tab_id = self._coerce_id(value.get('id')) or self._tab_id(str(value.get('name') or ''), index)
            if tab_id in used_ids:
                tab_id = self._tab_id(tab_id, index)
            used_ids.add(tab_id)
            name = str(value.get('name') or '').strip()[:64] or f'Вкладка {index + 1}'
            tabs.append({
                'id': tab_id,
                'name': name,
                'items': self._coerce_items(value.get('items')),
            })
        if not tabs:
            tabs.append({'id': DEFAULT_TAB_ID, 'name': DEFAULT_TAB_NAME, 'items': []})
        return tabs

    def _coerce_items(self, raw: Any) -> list[dict[str, Any]]:
        values = raw if isinstance(raw, list) else []
        result: list[dict[str, Any]] = []
        seen: set[str] = set()
        for value in values[:MAX_FAVORITE_ITEMS_PER_TAB]:
            item = value if isinstance(value, dict) else {'raw': value}
            item_raw = str(item.get('raw') or '').strip()
            if not item_raw or item_raw in seen:
                continue
            seen.add(item_raw)
            result.append({
                'raw': item_raw[:4096],
                'addedAt': self._coerce_int(item.get('addedAt'), 0, self._now_ms()),
            })
        return result

    def _coerce_hidden_patterns(self, raw: Any) -> list[str]:
        if isinstance(raw, str):
            values = raw.replace(',', '\n').splitlines()
        elif isinstance(raw, list):
            values = [str(item) for item in raw]
        else:
            values = []
        result: list[str] = []
        seen: set[str] = set()
        for value in values:
            pattern = value.strip()[:256]
            if not pattern or pattern in seen:
                continue
            seen.add(pattern)
            result.append(pattern)
            if len(result) >= MAX_HIDDEN_PATTERNS:
                break
        return result

    def _coerce_hotkey(self, value: Any) -> str:
        hotkey = str(value or DEFAULT_FAVORITE_HOTKEY).strip()[:32]
        return hotkey or DEFAULT_FAVORITE_HOTKEY

    def _coerce_id(self, value: Any) -> str:
        raw = str(value or '').strip().lower()
        safe = ''.join(char for char in raw if char.isalnum() or char in {'-', '_'})
        return safe[:64]

    def _tab_id(self, label: str, index: int) -> str:
        digest = hashlib.sha1(f'{label}:{index}:{self._now_ms()}'.encode('utf-8')).hexdigest()[:10]
        return f'tab-{digest}'

    def _user_key(self, email: str | None) -> str:
        return normalize_email(str(email or ''))

    def _coerce_int(self, value: Any, minimum: int, fallback: int) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            parsed = fallback
        return max(minimum, parsed)

    def _now_ms(self) -> int:
        return int(datetime.now(timezone.utc).timestamp() * 1000)
