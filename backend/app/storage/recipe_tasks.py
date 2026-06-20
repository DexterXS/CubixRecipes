from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.auth.permissions import normalize_email


MAX_RECIPE_TASKS = 2000
TASK_STATUSES = {'planned', 'in_progress', 'review', 'done'}
TASK_PRIORITIES = {'low', 'normal', 'high', 'urgent'}
BOARD_MODES = {'free', 'priority', 'deadline', 'created'}


class RecipeTaskStore:
    def __init__(self, storage_path: Path) -> None:
        self.storage_path = storage_path
        self._lock = threading.Lock()

    def list_board(self) -> dict[str, Any]:
        payload = self._read_payload()
        return {
            'boardMode': self._coerce_board_mode(payload.get('boardMode')),
            'tasks': sorted(self._read_tasks(payload), key=lambda item: (str(item.get('status')), int(item.get('sortOrder', 0) or 0), -int(item.get('updatedAt', 0) or 0))),
        }

    def save_board_mode(self, board_mode: str) -> dict[str, Any]:
        with self._lock:
            payload = self._read_payload()
            payload['boardMode'] = self._coerce_board_mode(board_mode)
            self._write_payload(payload)
        return self.list_board()

    def create(self, raw_payload: dict[str, Any], user_email: str) -> dict[str, Any]:
        normalized_email = normalize_email(user_email)
        now = self._now_ms()
        with self._lock:
            payload = self._read_payload()
            tasks = self._read_tasks(payload)
            task = self._task_from_payload(raw_payload, normalized_email, now, existing=None)
            task['id'] = self._task_id(normalized_email, task['itemRaw'], task['title'], now)
            task['createdByEmail'] = normalized_email
            task['createdAt'] = now
            task['updatedAt'] = now
            task['sortOrder'] = self._next_sort_order(tasks, task['status'])
            tasks.insert(0, task)
            payload['tasks'] = self._bounded_tasks(tasks)
            self._write_payload(payload)
        return task

    def update(self, task_id: str, raw_payload: dict[str, Any], user_email: str) -> dict[str, Any]:
        normalized_email = normalize_email(user_email)
        now = self._now_ms()
        with self._lock:
            payload = self._read_payload()
            tasks = self._read_tasks(payload)
            target = next((item for item in tasks if item.get('id') == task_id), None)
            if target is None:
                raise KeyError('Task not found')
            updated = self._task_from_payload(raw_payload, normalized_email, now, existing=target)
            updated['id'] = task_id
            updated['createdByEmail'] = target.get('createdByEmail') or normalized_email
            updated['createdAt'] = int(target.get('createdAt', now) or now)
            updated['updatedAt'] = now
            updated['sortOrder'] = int(raw_payload.get('sortOrder', target.get('sortOrder', 0)) or 0)
            self._apply_status_audit(target, updated, normalized_email, now)
            payload['tasks'] = self._bounded_tasks([updated if item.get('id') == task_id else item for item in tasks])
            self._write_payload(payload)
        return updated

    def reorder(self, updates: list[dict[str, Any]], user_email: str) -> list[dict[str, Any]]:
        normalized_email = normalize_email(user_email)
        now = self._now_ms()
        update_by_id = {str(item.get('id') or ''): item for item in updates if item.get('id')}
        with self._lock:
            payload = self._read_payload()
            tasks = self._read_tasks(payload)
            next_tasks: list[dict[str, Any]] = []
            for task in tasks:
                task_id = str(task.get('id') or '')
                update = update_by_id.get(task_id)
                if update is None:
                    next_tasks.append(task)
                    continue
                updated = {**task}
                updated['status'] = self._coerce_status(update.get('status', task.get('status')))
                updated['sortOrder'] = int(update.get('sortOrder', task.get('sortOrder', 0)) or 0)
                updated['updatedAt'] = now
                self._apply_status_audit(task, updated, normalized_email, now)
                next_tasks.append(updated)
            payload['tasks'] = self._bounded_tasks(next_tasks)
            self._write_payload(payload)
        return self.list_board()['tasks']

    def delete(self, task_id: str) -> None:
        with self._lock:
            payload = self._read_payload()
            tasks = self._read_tasks(payload)
            if not any(item.get('id') == task_id for item in tasks):
                raise KeyError('Task not found')
            payload['tasks'] = [item for item in tasks if item.get('id') != task_id]
            self._write_payload(payload)

    def _task_from_payload(self, raw_payload: dict[str, Any], user_email: str, now: int, existing: dict[str, Any] | None) -> dict[str, Any]:
        payload = raw_payload if isinstance(raw_payload, dict) else {}
        fallback = existing or {}
        item_raw = str(payload.get('itemRaw', fallback.get('itemRaw', '')) or '').strip()
        title = str(payload.get('title', fallback.get('title', item_raw or 'Task')) or '').strip()
        assignee = normalize_email(str(payload.get('assigneeEmail', fallback.get('assigneeEmail', '')) or ''))
        helper_emails = self._coerce_email_list(payload.get('helperEmails', fallback.get('helperEmails', [])))
        status = self._coerce_status(payload.get('status', fallback.get('status', 'planned')))
        if status == 'in_progress' and not assignee:
            assignee = user_email
        return {
            'id': str(fallback.get('id', '')),
            'itemRaw': item_raw,
            'itemTitle': str(payload.get('itemTitle', fallback.get('itemTitle', '')) or '').strip(),
            'title': title or item_raw or 'Task',
            'description': str(payload.get('description', fallback.get('description', '')) or '').strip()[:8192],
            'status': status,
            'priority': self._coerce_priority(payload.get('priority', fallback.get('priority', 'normal'))),
            'estimatedDays': self._coerce_int(payload.get('estimatedDays', fallback.get('estimatedDays', 1)), 1, 365),
            'deadlineDate': self._coerce_date(payload.get('deadlineDate', fallback.get('deadlineDate', ''))),
            'assigneeEmail': assignee,
            'helperEmails': helper_emails,
            'createdByEmail': str(fallback.get('createdByEmail', user_email)),
            'createdAt': int(fallback.get('createdAt', now) or now),
            'updatedAt': int(payload.get('updatedAt', fallback.get('updatedAt', now)) or now),
            'submittedByEmail': normalize_email(str(payload.get('submittedByEmail', fallback.get('submittedByEmail', '')) or '')),
            'submittedAt': int(payload.get('submittedAt', fallback.get('submittedAt', 0)) or 0),
            'reviewedByEmail': normalize_email(str(payload.get('reviewedByEmail', fallback.get('reviewedByEmail', '')) or '')),
            'approvedAt': int(payload.get('approvedAt', fallback.get('approvedAt', 0)) or 0),
            'sortOrder': int(payload.get('sortOrder', fallback.get('sortOrder', 0)) or 0),
        }

    def _apply_status_audit(self, previous: dict[str, Any], updated: dict[str, Any], user_email: str, now: int) -> None:
        previous_status = str(previous.get('status') or 'planned')
        next_status = str(updated.get('status') or 'planned')
        if next_status == 'review' and previous_status != 'review':
            updated['submittedByEmail'] = user_email
            updated['submittedAt'] = now
        if next_status == 'done' and previous_status != 'done':
            updated['reviewedByEmail'] = user_email
            updated['approvedAt'] = now
        if next_status == 'in_progress' and not updated.get('assigneeEmail'):
            updated['assigneeEmail'] = user_email

    def _read_payload(self) -> dict[str, Any]:
        if not self.storage_path.is_file():
            return {'schemaVersion': 1, 'boardMode': 'free', 'tasks': []}
        try:
            payload = json.loads(self.storage_path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return {'schemaVersion': 1, 'boardMode': 'free', 'tasks': []}
        return payload if isinstance(payload, dict) else {'schemaVersion': 1, 'boardMode': 'free', 'tasks': []}

    def _read_tasks(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        raw_tasks = payload.get('tasks')
        if not isinstance(raw_tasks, list):
            return []
        tasks: list[dict[str, Any]] = []
        for raw in raw_tasks:
            if not isinstance(raw, dict) or not isinstance(raw.get('id'), str):
                continue
            tasks.append(self._task_from_payload(raw, normalize_email(str(raw.get('createdByEmail', ''))), self._now_ms(), existing=raw))
        return tasks

    def _write_payload(self, payload: dict[str, Any]) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        normalized = {
            'schemaVersion': 1,
            'savedAt': self._now_ms(),
            'boardMode': self._coerce_board_mode(payload.get('boardMode')),
            'tasks': self._bounded_tasks(self._read_tasks(payload)),
        }
        tmp_path = self.storage_path.with_suffix(f'{self.storage_path.suffix}.tmp')
        tmp_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        tmp_path.replace(self.storage_path)

    def _bounded_tasks(self, tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return sorted(tasks, key=lambda item: int(item.get('updatedAt', 0) or 0), reverse=True)[:MAX_RECIPE_TASKS]

    def _next_sort_order(self, tasks: list[dict[str, Any]], status: str) -> int:
        status_orders = [int(item.get('sortOrder', 0) or 0) for item in tasks if item.get('status') == status]
        return (max(status_orders) if status_orders else 0) + 1000

    def _coerce_status(self, value: Any) -> str:
        status = str(value or 'planned')
        return status if status in TASK_STATUSES else 'planned'

    def _coerce_priority(self, value: Any) -> str:
        priority = str(value or 'normal')
        return priority if priority in TASK_PRIORITIES else 'normal'

    def _coerce_board_mode(self, value: Any) -> str:
        board_mode = str(value or 'free')
        return board_mode if board_mode in BOARD_MODES else 'free'

    def _coerce_int(self, value: Any, minimum: int, maximum: int) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            parsed = minimum
        return max(minimum, min(parsed, maximum))

    def _coerce_date(self, value: Any) -> str:
        raw = str(value or '').strip()
        if not raw:
            return ''
        try:
            datetime.strptime(raw[:10], '%Y-%m-%d')
        except ValueError:
            return ''
        return raw[:10]

    def _coerce_email_list(self, value: Any) -> list[str]:
        if isinstance(value, str):
            raw_values = value.replace(',', '\n').splitlines()
        elif isinstance(value, list):
            raw_values = [str(item) for item in value]
        else:
            raw_values = []
        result: list[str] = []
        seen: set[str] = set()
        for raw in raw_values:
            email = normalize_email(raw)
            if not email or email in seen:
                continue
            seen.add(email)
            result.append(email)
        return result[:12]

    def _task_id(self, email: str, item_raw: str, title: str, timestamp_ms: int) -> str:
        key = f'{email}:{item_raw}:{title}:{timestamp_ms}'
        return hashlib.sha1(key.encode('utf-8')).hexdigest()[:16]

    def _now_ms(self) -> int:
        return int(datetime.now(timezone.utc).timestamp() * 1000)
