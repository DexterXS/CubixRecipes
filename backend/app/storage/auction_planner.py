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
MAX_COMMAND_TEMPLATE_LENGTH = 4000

AUCTION_COMMAND_STATES = {'SETUP', 'ACTIVE', 'PAUSED', 'CLOSED', 'ENDED'}
AUCTION_COMMAND_SCOPES = {'file', 'auction', 'item'}
AUCTION_COMMAND_TEMPLATES = {
    'create': ('Создать слот', 'auction', '/aca create {startDate} {endDate} {startPrice} {stepPrice} {currency}'),
    'giveItem': ('Выдать предмет', 'item', '/give {player} {itemId} {quantity} {meta}'),
    'addItem': ('Добавить предмет', 'item', '/aca addItem {serverId}'),
    'setName': ('Название', 'auction', '/aca setName {serverId} {auctionName}'),
    'setDescription': ('Описание', 'auction', '/aca setDescription {serverId} {description}'),
    'setStartDate': ('Старт', 'auction', '/aca setStartDate {serverId} {startDate}'),
    'setEndDate': ('Конец', 'auction', '/aca setEndDate {serverId} {endDate}'),
    'setCurrency': ('Валюта', 'auction', '/aca setCurrency {serverId} {currency}'),
    'setStartPrice': ('Стартовая цена', 'auction', '/aca setStartPrice {serverId} {startPrice}'),
    'setStepPrice': ('Шаг ставки', 'auction', '/aca setStepPrice {serverId} {stepPrice}'),
    'setState': ('Статус', 'auction', '/aca setState {serverId} {state}'),
    'scheduleCreate': ('Расписание', 'auction', '/aca scheduleCreate {serverId} {startDate} {scheduleLeadDate} {repeatIntervalSeconds} {durationSeconds}'),
}
INSTALL_COMMAND_ORDER = [
    'create', 'giveItem', 'addItem', 'setName', 'setDescription',
    'setStartDate', 'setEndDate', 'setCurrency', 'setStartPrice', 'setStepPrice', 'setState',
    'scheduleCreate',
]
EXISTING_COMMAND_ORDER = [
    'giveItem', 'addItem', 'setName', 'setDescription', 'setStartDate',
    'setEndDate', 'setCurrency', 'setStartPrice', 'setStepPrice', 'setState', 'scheduleCreate',
    'create',
]


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

    def _default_command_entry(self, command: str, enabled: bool) -> dict[str, Any]:
        label, scope, template = AUCTION_COMMAND_TEMPLATES[command]
        return {
            'id': command,
            'kind': 'template',
            'command': command,
            'label': label,
            'template': template,
            'scope': scope,
            'enabled': enabled,
        }

    def _default_command_entries(self, mode: str) -> list[dict[str, Any]]:
        if mode == 'install':
            enabled = {'create'}
            order = INSTALL_COMMAND_ORDER
        else:
            enabled = {
                'giveItem', 'addItem', 'setName', 'setDescription',
                'setStartDate', 'setEndDate', 'setCurrency', 'setStartPrice', 'setStepPrice',
                'setState', 'scheduleCreate',
            }
            order = EXISTING_COMMAND_ORDER
        return [self._default_command_entry(command, command in enabled) for command in order]

    def _default_command_mode(self, mode: str) -> dict[str, Any]:
        title = 'Новые слоты' if mode == 'install' else 'По готовым ID' if mode == 'existing' else 'Новый режим'
        return {'id': mode, 'title': title, 'orderMode': 'grouped', 'entries': self._default_command_entries(mode)}

    def _coerce_command_entry(self, raw_entry: Any, index: int) -> dict[str, Any] | None:
        if not isinstance(raw_entry, dict):
            return None
        kind = raw_entry.get('kind')
        if kind == 'template':
            command = raw_entry.get('command')
            if command not in AUCTION_COMMAND_TEMPLATES:
                return None
            label, scope, template = AUCTION_COMMAND_TEMPLATES[command]
            return {
                'id': command,
                'kind': 'template',
                'command': command,
                'label': str(raw_entry.get('label') or label)[:120],
                'template': str(raw_entry.get('template') or template)[:MAX_COMMAND_TEMPLATE_LENGTH],
                'scope': scope,
                'enabled': raw_entry.get('enabled') is not False,
            }
        if kind == 'custom':
            scope = raw_entry.get('scope') if raw_entry.get('scope') in AUCTION_COMMAND_SCOPES else 'file'
            return {
                'id': str(raw_entry.get('id') or f'custom-{index + 1}')[:80],
                'kind': 'custom',
                'label': str(raw_entry.get('label') or 'Своя команда')[:120],
                'template': str(raw_entry.get('template') or raw_entry.get('command') or '')[:MAX_COMMAND_TEMPLATE_LENGTH],
                'scope': scope,
                'enabled': raw_entry.get('enabled') is not False,
            }
        return None

    def _legacy_command_entries(self, raw_entries: Any) -> list[dict[str, Any]]:
        if not isinstance(raw_entries, list):
            return []
        migrated: list[dict[str, Any]] = []
        for index, entry in enumerate(raw_entries[:MAX_COMMAND_PROFILE_ENTRIES]):
            if not isinstance(entry, dict):
                continue
            if entry.get('kind') == 'custom':
                custom_entry = self._coerce_command_entry(entry, index)
                if custom_entry is not None:
                    migrated.append(custom_entry)
                continue
            if entry.get('kind') != 'builtin':
                continue
            enabled = entry.get('enabled') is not False
            block = entry.get('block')
            if block == 'create':
                migrated.append(self._default_command_entry('create', enabled))
            elif block == 'items':
                for command in ['giveItem', 'addItem']:
                    migrated.append(self._default_command_entry(command, enabled))
            elif block == 'settings':
                for command in [
                    'setName', 'setDescription', 'setStartDate', 'setEndDate', 'setCurrency',
                    'setStartPrice', 'setStepPrice', 'setState', 'scheduleCreate',
                ]:
                    migrated.append(self._default_command_entry(command, enabled))
        return migrated

    def _coerce_command_entries(self, raw_entries: Any, mode: str) -> list[dict[str, Any]]:
        has_entries = isinstance(raw_entries, list)
        source = raw_entries if has_entries else self._default_command_entries(mode)
        safe_entries: list[dict[str, Any]] = []
        seen_templates: set[str] = set()
        for index, entry in enumerate(source[:MAX_COMMAND_PROFILE_ENTRIES]):
            safe_entry = self._coerce_command_entry(entry, index)
            if safe_entry is None:
                continue
            if safe_entry['kind'] == 'template':
                command = safe_entry['command']
                if command in seen_templates:
                    continue
                seen_templates.add(command)
            safe_entries.append(safe_entry)
        if not has_entries:
            for default_entry in self._default_command_entries(mode):
                command = default_entry['command']
                if command not in seen_templates:
                    safe_entries.append(default_entry)
        return safe_entries[:MAX_COMMAND_PROFILE_ENTRIES]

    def _coerce_command_profile(self, raw_profile: Any) -> dict[str, Any]:
        if not isinstance(raw_profile, dict):
            return {
                'mode': 'install',
                'playerName': '@p',
                'stateFilters': ['ACTIVE'],
                'modeOrder': ['install', 'existing'],
                'modes': {
                    'install': self._default_command_mode('install'),
                    'existing': self._default_command_mode('existing'),
                },
            }
        player_name = str(raw_profile.get('playerName') or '@p')[:80].strip() or '@p'
        raw_state_filters = raw_profile.get('stateFilters')
        state_filters = []
        if isinstance(raw_state_filters, list):
            state_filters = [state for state in raw_state_filters if state in AUCTION_COMMAND_STATES]
        if not state_filters:
            state_filters = ['ACTIVE']
        legacy_entries = self._legacy_command_entries(raw_profile.get('entries'))
        raw_modes = raw_profile.get('modes') if isinstance(raw_profile.get('modes'), dict) else {}
        raw_mode_order = raw_profile.get('modeOrder')
        if isinstance(raw_mode_order, list):
            mode_order = [str(mode_id)[:80] for mode_id in raw_mode_order if str(mode_id) in raw_modes]
        elif raw_modes:
            mode_order = [str(mode_id)[:80] for mode_id in raw_modes.keys()]
        else:
            mode_order = []
        if not mode_order and 'modes' not in raw_profile and 'modeOrder' not in raw_profile:
            mode_order = ['install', 'existing']
        modes: dict[str, dict[str, Any]] = {}
        for profile_mode in list(dict.fromkeys(mode_order)):
            mode_payload = raw_modes.get(profile_mode)
            raw_entries = mode_payload.get('entries') if isinstance(mode_payload, dict) else None
            if legacy_entries and raw_profile.get('mode') == profile_mode:
                raw_entries = legacy_entries
            title = str(mode_payload.get('title') if isinstance(mode_payload, dict) else '')[:80].strip()
            if not title:
                title = 'Новые слоты' if profile_mode == 'install' else 'По готовым ID' if profile_mode == 'existing' else 'Новый режим'
            order_mode = mode_payload.get('orderMode') if isinstance(mode_payload, dict) else ''
            order_mode = 'perLot' if order_mode == 'perLot' else 'grouped'
            modes[profile_mode] = {
                'id': profile_mode,
                'title': title,
                'orderMode': order_mode,
                'entries': self._coerce_command_entries(raw_entries, profile_mode),
            }
        requested_mode = raw_profile.get('mode') if isinstance(raw_profile.get('mode'), str) else ''
        mode = requested_mode if requested_mode in modes else mode_order[0] if mode_order else ''
        return {
            'mode': mode,
            'playerName': player_name,
            'stateFilters': list(dict.fromkeys(state_filters)),
            'modeOrder': list(modes.keys()),
            'modes': modes,
        }

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
