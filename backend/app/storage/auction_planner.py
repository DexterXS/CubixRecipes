from __future__ import annotations

import copy
import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MAX_AUCTION_DAYS = 365
MAX_AUCTIONS_PER_DAY = 120
MAX_ITEMS_PER_AUCTION = 64
MAX_COMMAND_PROFILE_ENTRIES = 80
MAX_CUSTOM_COMMAND_LENGTH = 4000


class AuctionPlannerStore:
    def __init__(self, storage_path: Path) -> None:
        self.storage_path = storage_path
        self._lock = threading.Lock()

    def get_state(self) -> dict[str, Any]:
        payload = self._read_payload()
        return {
            'schemaVersion': 1,
            'savedAt': int(payload.get('savedAt', 0) or 0),
            'state': self._coerce_state(payload.get('state')),
        }

    def save_state(self, raw_state: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            state = self._coerce_state(raw_state)
            payload = {
                'schemaVersion': 1,
                'savedAt': self._now_ms(),
                'state': state,
            }
            self._write_payload(payload)
        return payload

    def _read_payload(self) -> dict[str, Any]:
        if not self.storage_path.is_file():
            return {'schemaVersion': 1, 'savedAt': 0, 'state': self._empty_state()}
        try:
            payload = json.loads(self.storage_path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return {'schemaVersion': 1, 'savedAt': 0, 'state': self._empty_state()}
        if not isinstance(payload, dict):
            return {'schemaVersion': 1, 'savedAt': 0, 'state': self._empty_state()}
        return payload

    def _write_payload(self, payload: dict[str, Any]) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.storage_path.with_suffix(f'{self.storage_path.suffix}.tmp')
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        tmp_path.replace(self.storage_path)

    def _coerce_state(self, raw_state: Any) -> dict[str, Any]:
        if not isinstance(raw_state, dict):
            return self._empty_state()
        state = copy.deepcopy(raw_state)
        folders = state.get('dayFolders')
        if not isinstance(folders, list):
            folders = []
        state['dayFolders'] = folders[:MAX_AUCTION_DAYS]
        for folder in state['dayFolders']:
            if not isinstance(folder, dict):
                continue
            auctions = folder.get('auctions')
            if not isinstance(auctions, list):
                auctions = []
            folder['auctions'] = auctions[:MAX_AUCTIONS_PER_DAY]
            for auction in folder['auctions']:
                if not isinstance(auction, dict):
                    continue
                items = auction.get('items')
                if not isinstance(items, list):
                    items = []
                auction['items'] = items[:MAX_ITEMS_PER_AUCTION]
        state['commandProfile'] = self._coerce_command_profile(state.get('commandProfile'))
        return state

    def _coerce_command_profile(self, raw_profile: Any) -> dict[str, Any]:
        default_entries = [
            {'id': 'create', 'kind': 'builtin', 'block': 'create', 'enabled': True},
            {'id': 'ids', 'kind': 'builtin', 'block': 'ids', 'enabled': False},
            {'id': 'items', 'kind': 'builtin', 'block': 'items', 'enabled': True},
            {'id': 'settings', 'kind': 'builtin', 'block': 'settings', 'enabled': True},
        ]
        if not isinstance(raw_profile, dict):
            return {'mode': 'install', 'entries': default_entries}
        mode = raw_profile.get('mode') if raw_profile.get('mode') in {'install', 'existing'} else 'install'
        entries = raw_profile.get('entries')
        if not isinstance(entries, list):
            entries = default_entries
        safe_entries: list[dict[str, Any]] = []
        seen_builtin: set[str] = set()
        for entry in entries[:MAX_COMMAND_PROFILE_ENTRIES]:
            if not isinstance(entry, dict):
                continue
            kind = entry.get('kind')
            if kind == 'builtin':
                block = entry.get('block')
                if block not in {'create', 'ids', 'items', 'settings'} or block in seen_builtin:
                    continue
                seen_builtin.add(block)
                safe_entries.append({
                    'id': block,
                    'kind': 'builtin',
                    'block': block,
                    'enabled': entry.get('enabled') is not False,
                })
            elif kind == 'custom':
                entry_id = str(entry.get('id') or f'custom-{len(safe_entries) + 1}')[:80]
                safe_entries.append({
                    'id': entry_id,
                    'kind': 'custom',
                    'label': str(entry.get('label') or 'Кастомная команда')[:120],
                    'command': str(entry.get('command') or '')[:MAX_CUSTOM_COMMAND_LENGTH],
                    'enabled': entry.get('enabled') is not False,
                })
        for default_entry in default_entries:
            block = default_entry['block']
            if block not in seen_builtin:
                safe_entries.append(default_entry)
        return {'mode': mode, 'entries': safe_entries[:MAX_COMMAND_PROFILE_ENTRIES]}

    def _empty_state(self) -> dict[str, Any]:
        return {
            'dayFolders': [],
            'selectedDayFolderId': '',
            'selectedAuctionId': '',
            'workflowMode': 'install',
            'uiMode': 'normal',
            'commandStage': 'create',
            'commandProfile': self._coerce_command_profile(None),
        }

    def _now_ms(self) -> int:
        return int(datetime.now(timezone.utc).timestamp() * 1000)
