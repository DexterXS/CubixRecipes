from __future__ import annotations

import json
import threading
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from time import perf_counter
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
        self._lock = threading.RLock()

    def set_verbose(self, verbose: bool) -> None:
        self.verbose = verbose
        self.log('SYSTEM', 'INFO', 'CONFIG', 'Verbose debug logging updated', {'verbose': verbose}, force=True)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()
            self._next_event_id = 1
        self.log('SYSTEM', 'INFO', 'LOG', 'Unified debug log cleared', force=True)

    def log(self, source: str, level: str, category: str, message: str, details: Optional[dict[str, Any]] = None, verbose_only: bool = False, force: bool = False) -> dict[str, Any]:
        if verbose_only and not self.verbose and not force:
            return {}
        normalized_details = self._sanitize_details(details or {})
        signature = self._signature(source, level, category, message, normalized_details)
        with self._lock:
            deduplicated = self._deduplicate(signature)
            if deduplicated is not None:
                return self._serialize_event(deduplicated, include_details=True)
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
            return self._serialize_event(event, include_details=True)

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
        return self.query_events(source=source, level=level, since_id=since_id, limit=limit, include_details=include_details)['events']

    def query_events(
        self,
        source: str = 'All',
        level: str = 'All',
        since_id: int = 0,
        limit: int = 100,
        include_details: bool = False,
    ) -> dict[str, Any]:
        total_started = perf_counter()
        with self._lock:
            snapshot = list(self._events)
            newest_event_id = snapshot[-1].event_id if snapshot else 0
        snapshot_ms = round((perf_counter() - total_started) * 1000, 3)

        filter_started = perf_counter()
        matched: list[DebugLogEvent] = []
        scanned = 0
        matched_total = 0
        has_more = False
        if limit > 0:
            extra_match_seen = False
            for event in reversed(snapshot):
                if event.event_id <= since_id:
                    break
                scanned += 1
                if not self._matches_source(event, source) or not self._matches_level(event, level):
                    continue
                matched_total += 1
                if len(matched) < limit:
                    matched.append(event)
                else:
                    extra_match_seen = True
                    break
            matched.reverse()
            has_more = extra_match_seen
        else:
            for event in snapshot:
                if event.event_id <= since_id:
                    continue
                scanned += 1
                if self._matches_source(event, source) and self._matches_level(event, level):
                    matched.append(event)
                    matched_total += 1
        filter_ms = round((perf_counter() - filter_started) * 1000, 3)

        serialize_started = perf_counter()
        events = [self._serialize_event(item, include_details=include_details) for item in matched]
        serialize_ms = round((perf_counter() - serialize_started) * 1000, 3)
        total_ms = round((perf_counter() - total_started) * 1000, 3)

        phase_map = {
            'snapshot': snapshot_ms,
            'filter': filter_ms,
            'serialize': serialize_ms,
        }
        bottleneck = max(phase_map, key=phase_map.get) if phase_map else 'none'
        return {
            'events': events,
            'next_since_id': events[-1]['event_id'] if events else since_id,
            'has_more': has_more,
            'diagnostics': {
                'total_ms': total_ms,
                'snapshot_ms': snapshot_ms,
                'filter_ms': filter_ms,
                'serialize_ms': serialize_ms,
                'bottleneck': bottleneck,
                'scanned': scanned,
                'matched': matched_total,
                'returned': len(events),
                'since_id': since_id,
                'limit': limit,
                'include_details': include_details,
                'newest_event_id': newest_event_id,
                'buffer_size': len(snapshot),
            },
        }

    def export_text(self, events: Optional[list[dict[str, Any]]] = None) -> str:
        rows = events if events is not None else self.list_events(include_details=True, limit=0)
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

    def _matches_source(self, event: DebugLogEvent, source: str) -> bool:
        if source == 'All':
            return True
        source_upper = source.upper()
        return event.source == source_upper or event.category == source_upper

    def _matches_level(self, event: DebugLogEvent, level: str) -> bool:
        return level == 'All' or event.level == level
