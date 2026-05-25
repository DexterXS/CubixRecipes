from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable

from app.auth.database import UserRecord, build_session_factory, utc_now
from app.auth.permissions import ROOT_ADMIN_EMAIL, is_root_admin_email, normalize_email, normalize_role

DATABASE_ENV_KEYS = ('DATABASE_URL', 'DATABASE_PRIVATE_URL', 'POSTGRES_URL', 'POSTGRES_DATABASE_URL')


@dataclass(frozen=True)
class PublicUser:
    id: int
    email: str
    name: str | None
    avatar_url: str | None
    role: str
    is_root_admin: bool
    created_at: datetime | None = None
    last_login_at: datetime | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'avatar_url': self.avatar_url,
            'role': self.role,
            'is_root_admin': self.is_root_admin,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login_at': self.last_login_at.isoformat() if self.last_login_at else None,
        }


class AuthService:
    def __init__(self, database_url: str | None = None, root_admin_email: str = ROOT_ADMIN_EMAIL):
        self.database_url, self.database_env_key = self._resolve_database_url(database_url)
        self.root_admin_email = normalize_email(root_admin_email)
        self._session_factory: Callable[[], Any] | None = None
        self.configuration_error: str | None = None
        if not self.database_url:
            self.configuration_error = f'One of {", ".join(DATABASE_ENV_KEYS)} is required for authentication'
        elif self.database_url.startswith('${{'):
            self.configuration_error = f'{self.database_env_key} is not resolved by the platform'
        else:
            try:
                self._session_factory = build_session_factory(self.database_url)
            except Exception as exc:
                self.configuration_error = str(exc)

    def _resolve_database_url(self, database_url: str | None) -> tuple[str, str | None]:
        explicit = (database_url or '').strip()
        if explicit:
            return explicit, 'explicit'
        for key in DATABASE_ENV_KEYS:
            value = os.environ.get(key, '').strip()
            if value:
                return value, key
        return '', None

    @property
    def is_configured(self) -> bool:
        return self._session_factory is not None and self.configuration_error is None

    def public_config(self) -> dict[str, Any]:
        return {
            'auth_configured': self.is_configured,
            'root_admin_email': self.root_admin_email,
            'configuration_error': self.configuration_error,
            'database_env_key': self.database_env_key,
            'database_env_present': bool(self.database_url),
        }

    def _require_session_factory(self):
        if self._session_factory is None:
            raise RuntimeError(self.configuration_error or 'DATABASE_URL is required for authentication')
        return self._session_factory

    def _to_public_user(self, record: UserRecord) -> PublicUser:
        email = normalize_email(record.email)
        return PublicUser(
            id=record.id,
            email=email,
            name=record.name,
            avatar_url=record.avatar_url,
            role=normalize_role(record.role, email),
            is_root_admin=is_root_admin_email(email),
            created_at=record.created_at,
            last_login_at=record.last_login_at,
        )

    def get_user(self, user_id: int) -> PublicUser | None:
        session_factory = self._require_session_factory()
        with session_factory() as session:
            record = session.get(UserRecord, user_id)
            if record is None:
                return None
            if is_root_admin_email(record.email) and record.role != 'admin':
                record.role = 'admin'
                session.commit()
            return self._to_public_user(record)

    def upsert_google_user(self, profile: dict[str, Any]) -> PublicUser:
        session_factory = self._require_session_factory()
        google_sub = str(profile.get('sub') or '').strip()
        email = normalize_email(str(profile.get('email') or ''))
        if not google_sub or not email:
            raise ValueError('Google profile does not include sub/email')
        now = utc_now()
        with session_factory() as session:
            record = session.query(UserRecord).filter(UserRecord.google_sub == google_sub).one_or_none()
            if record is None:
                record = session.query(UserRecord).filter(UserRecord.email == email).one_or_none()
            if record is None:
                record = UserRecord(google_sub=google_sub, email=email, role=normalize_role('default', email), created_at=now)
                session.add(record)
            record.google_sub = google_sub
            record.email = email
            record.name = profile.get('name') or profile.get('given_name') or email
            record.avatar_url = profile.get('picture')
            record.last_login_at = now
            record.role = normalize_role(record.role, email)
            session.commit()
            session.refresh(record)
            return self._to_public_user(record)

    def list_users(self) -> list[PublicUser]:
        session_factory = self._require_session_factory()
        with session_factory() as session:
            records = session.query(UserRecord).order_by(UserRecord.email.asc()).all()
            return [self._to_public_user(record) for record in records]

    def set_user_role(self, user_id: int, role: str) -> PublicUser:
        session_factory = self._require_session_factory()
        with session_factory() as session:
            record = session.get(UserRecord, user_id)
            if record is None:
                raise KeyError('User not found')
            if is_root_admin_email(record.email):
                raise ValueError('Root admin role cannot be changed')
            record.role = normalize_role(role, record.email)
            session.commit()
            session.refresh(record)
            return self._to_public_user(record)
