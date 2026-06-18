from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.auth.permissions import normalize_email, role_has_permission


@dataclass
class AccessControlConfig:
    whitelist_enabled: bool = False
    whitelist_emails: list[str] = field(default_factory=list)


class AccessControlStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> AccessControlConfig:
        if not self.path.is_file():
            return AccessControlConfig()
        try:
            payload = json.loads(self.path.read_text(encoding='utf-8'))
        except Exception:
            return AccessControlConfig()
        return self._coerce(payload)

    def save(self, raw: dict[str, Any]) -> AccessControlConfig:
        config = self._coerce(raw)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.as_dict(config), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        return config

    def as_dict(self, config: AccessControlConfig | None = None) -> dict[str, Any]:
        current = config or self.load()
        return {
            'whitelist_enabled': current.whitelist_enabled,
            'whitelist_emails': list(current.whitelist_emails),
        }

    def is_allowed(self, user: dict[str, Any]) -> bool:
        config = self.load()
        if not config.whitelist_enabled:
            return True
        email = normalize_email(str(user.get('email') or ''))
        if user.get('is_root_admin') or role_has_permission(user.get('role'), 'roles:manage', email):
            return True
        return email in set(config.whitelist_emails)

    def _coerce(self, raw: Any) -> AccessControlConfig:
        payload = raw if isinstance(raw, dict) else {}
        emails = payload.get('whitelist_emails', [])
        if isinstance(emails, str):
            raw_emails = emails.replace(',', '\n').splitlines()
        elif isinstance(emails, list):
            raw_emails = [str(item) for item in emails]
        else:
            raw_emails = []
        normalized: list[str] = []
        seen: set[str] = set()
        for item in raw_emails:
            email = normalize_email(item)
            if not email or '@' not in email or email in seen:
                continue
            seen.add(email)
            normalized.append(email)
        return AccessControlConfig(
            whitelist_enabled=bool(payload.get('whitelist_enabled', False)),
            whitelist_emails=normalized,
        )
