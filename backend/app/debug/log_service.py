from __future__ import annotations

from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional


@dataclass
class DebugLogEvent:
    event_id: int
    timestamp: str
    source: str
    level: str
    category: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)


class DebugLogService:
    def __init__(self, max_events: int = 5000, verbose: bool = False) -> None:
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
        event = DebugLogEvent(
            event_id=self._next_event_id,
            timestamp=datetime.now(timezone.utc).astimezone().isoformat(timespec='milliseconds'),
            source=source,
            level=level,
            category=category,
            message=message,
            details=details or {},
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

    def list_events(self, source: str = 'All', level: str = 'All') -> list[dict[str, Any]]:
        events = [asdict(item) for item in self._events]
        if source != 'All':
            events = [item for item in events if item['source'] == source or item['category'] == source.upper()]
        if level != 'All':
            events = [item for item in events if item['level'] == level]
        return events

    def export_text(self, source: str = 'All', level: str = 'All') -> str:
        lines = []
        for item in self.list_events(source=source, level=level):
            details = '' if not item['details'] else f" details={item['details']}"
            lines.append(f"[{item['timestamp']}] [{item['source']}] [{item['level']}] [{item['category']}] {item['message']}{details}")
        return '\n'.join(lines)
