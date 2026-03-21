from __future__ import annotations

import json
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional


MAX_DETAIL_TEXT = 240
MAX_DETAIL_ITEMS = 20
DEDUP_WINDOW = 5


@dataclass
class DebugLogEvent:
    event_id: int
    timestamp: str
    source: str
    level: str
    category: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)
    repeat_count: int = 1


class DebugLogService:
    def __init__(self, max_events: int = 2000, verbose: bool = False) -> None:
        self.max_events = max_events
        self.verbose = verbose
        self._next_event_id = 1
        self._events: deque[DebugLogEvent] = deque(maxlen=max_events)

    def set_verbose(self, verbose: bool) -> None:
        self.verbose = verbose
        self.log('SYSTEM', 'INFO', 'CONFIG', 'Verbose debug logging updated', {'verbose': verbose}, force=True)

    def clear(self) -> None:
        self._events.clear()
        self._next_event_id = 1
        self.log('SYSTEM', 'INFO', 'LOG', 'Unified debug log cleared', force=True)

    def log(self, source: str, level: str, category: str, message: str, details: Optional[dict[str, Any]] = None, verbose_only: bool = False, force: bool = False) -> dict[str, Any]:
        if verbose_only and not self.verbose and not force:
            return {}
        normalized_details = self._sanitize_details(details or {})
        signature = self._signature(source, level, category, message, normalized_details)
        deduplicated = self._deduplicate(signature)
        if deduplicated is not None:
            return asdict(deduplicated)
        event = DebugLogEvent(
            event_id=self._next_event_id,
            timestamp=datetime.now(timezone.utc).astimezone().isoformat(timespec='milliseconds'),
            source=source,
            level=level,
            category=category,
            message=message,
            details=normalized_details,
        )
        self._next_event_id += 1
        self._events.append(event)
        return asdict(event)

    def ingest(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.log(
            source=str(payload.get('source', 'FRONTEND')),
            level=str(payload.get('level', 'INFO')),
            category=str(payload.get('category', 'CLIENT')),
            message=str(payload.get('message', 'frontend event')),
            details=dict(payload.get('details') or {}),
            verbose_only=bool(payload.get('verbose_only', False)),
        )

    def list_events(
        self,
        source: str = 'All',
        level: str = 'All',
        since_id: int = 0,
        limit: int = 200,
        include_details: bool = False,
    ) -> list[dict[str, Any]]:
        events = [item for item in self._events if item.event_id > since_id]
        if source != 'All':
            events = [item for item in events if item.source == source or item.category == source.upper()]
        if level != 'All':
            events = [item for item in events if item.level == level]
        if limit > 0:
            events = events[-limit:]
        return [self._serialize_event(item, include_details=include_details) for item in events]

    def export_text(self, events: Optional[list[dict[str, Any]]] = None) -> str:
        rows = events if events is not None else self.list_events(include_details=True)
        lines = []
        for item in rows:
            repeated = '' if item.get('repeat_count', 1) <= 1 else f" x{item['repeat_count']}"
            details = '' if not item.get('details') else f" details={item['details']}"
            lines.append(f"[{item['timestamp']}] [{item['source']}] [{item['level']}] [{item['category']}] {item['message']}{repeated}{details}")
        return '\n'.join(lines)

    def _serialize_event(self, event: DebugLogEvent, include_details: bool) -> dict[str, Any]:
        payload = {
            'event_id': event.event_id,
            'timestamp': event.timestamp,
            'source': event.source,
            'level': event.level,
            'category': event.category,
            'message': event.message,
            'repeat_count': event.repeat_count,
        }
        if include_details:
            payload['details'] = event.details
        return payload

    def _sanitize_details(self, details: dict[str, Any]) -> dict[str, Any]:
        sanitized: dict[str, Any] = {}
        for key, value in list(details.items())[:MAX_DETAIL_ITEMS]:
            sanitized[str(key)] = self._preview_value(value)
        if len(details) > MAX_DETAIL_ITEMS:
            sanitized['_trimmed_keys'] = len(details) - MAX_DETAIL_ITEMS
        return sanitized

    def _preview_value(self, value: Any) -> Any:
        if isinstance(value, str):
            compact = ' '.join(value.split())
            return compact if len(compact) <= MAX_DETAIL_TEXT else f"{compact[:MAX_DETAIL_TEXT]}…"
        if isinstance(value, dict):
            return {str(key): self._preview_value(item) for key, item in list(value.items())[:10]}
        if isinstance(value, list):
            preview = [self._preview_value(item) for item in value[:10]]
            if len(value) > 10:
                preview.append(f"…(+{len(value) - 10})")
            return preview
        return value

    def _signature(self, source: str, level: str, category: str, message: str, details: dict[str, Any]) -> str:
        return json.dumps({'source': source, 'level': level, 'category': category, 'message': message, 'details': details}, sort_keys=True, ensure_ascii=False)

    def _deduplicate(self, signature: str) -> Optional[DebugLogEvent]:
        for event in reversed(list(self._events)[-DEDUP_WINDOW:]):
            if self._signature(event.source, event.level, event.category, event.message, event.details) == signature:
                event.repeat_count += 1
                return event
        return None
