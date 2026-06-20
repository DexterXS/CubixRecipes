from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.auth.permissions import normalize_email


class CustomItemService:
    def __init__(self, store_dir: Path) -> None:
        self.store_dir = store_dir
        self.store_path = store_dir / 'items.json'

    def list_for_user(self, email: str) -> list[dict[str, Any]]:
        normalized_email = normalize_email(email)
        items = [
            self._serialize(item)
            for item in self._read_items()
            if item.get('is_global') is True or item.get('owner_email') == normalized_email
        ]
        items.sort(key=lambda item: (0 if item['scope'] == 'global' else 1, str(item['display_name']).lower()))
        return items

    def save_for_user(self, payload: dict[str, Any], email: str, is_global: bool) -> dict[str, Any]:
        normalized_email = normalize_email(email)
        owner_email = None if is_global else normalized_email
        items = self._read_items()
        item_id = payload.get('id')
        record = None

        if item_id is not None:
            record = next((item for item in items if item.get('id') == int(item_id)), None)
            if record is not None:
                if bool(record.get('is_global')) != is_global:
                    raise PermissionError('Custom item scope cannot be changed')
                if not record.get('is_global') and record.get('owner_email') != normalized_email:
                    raise PermissionError('Cannot edit another user custom item')

        if record is None:
            record = next(
                (
                    item
                    for item in items
                    if item.get('owner_email') == owner_email and item.get('item_raw') == payload['item_raw']
                ),
                None,
            )

        now = datetime.now(timezone.utc).isoformat()
        if record is None:
            record = {
                'id': self._next_id(items),
                'created_at': now,
            }
            items.append(record)

        record.update(
            {
                'owner_email': owner_email,
                'created_by_email': normalized_email,
                'source_raw': payload['source_raw'],
                'item_raw': payload['item_raw'],
                'display_name': payload['display_name'],
                'nbt_raw': payload.get('nbt_raw') or None,
                'comment': payload.get('comment') or '',
                'is_global': is_global,
                'updated_at': now,
            }
        )
        self._write_items(items)
        return self._serialize(record)

    def delete_for_user(self, item_id: int, email: str, can_delete_global: bool) -> None:
        normalized_email = normalize_email(email)
        items = self._read_items()
        record = next((item for item in items if item.get('id') == item_id), None)
        if record is None:
            raise KeyError('Custom item not found')
        if record.get('is_global') and not can_delete_global:
            raise PermissionError('Only admins can delete global custom items')
        if not record.get('is_global') and record.get('owner_email') != normalized_email:
            raise PermissionError('Cannot delete another user custom item')
        self._write_items([item for item in items if item.get('id') != item_id])

    def _read_items(self) -> list[dict[str, Any]]:
        if not self.store_path.is_file():
            return []
        try:
            payload = json.loads(self.store_path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return []
        raw_items = payload.get('items') if isinstance(payload, dict) else payload
        if not isinstance(raw_items, list):
            return []
        return [item for item in raw_items if isinstance(item, dict) and isinstance(item.get('id'), int)]

    def _write_items(self, items: list[dict[str, Any]]) -> None:
        self.store_dir.mkdir(parents=True, exist_ok=True)
        payload = {'schemaVersion': 1, 'items': items}
        tmp_path = self.store_path.with_suffix('.tmp')
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        tmp_path.replace(self.store_path)

    def _serialize(self, item: dict[str, Any]) -> dict[str, Any]:
        return {
            'id': item.get('id'),
            'scope': 'global' if item.get('is_global') else 'user',
            'owner_email': item.get('owner_email'),
            'created_by_email': item.get('created_by_email'),
            'source_raw': item.get('source_raw'),
            'item_raw': item.get('item_raw'),
            'display_name': item.get('display_name'),
            'nbt_raw': item.get('nbt_raw'),
            'comment': item.get('comment') or '',
            'created_at': item.get('created_at'),
            'updated_at': item.get('updated_at'),
            'storage': 'backend',
        }

    def _next_id(self, items: list[dict[str, Any]]) -> int:
        return max((int(item.get('id') or 0) for item in items), default=0) + 1
