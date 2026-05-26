from __future__ import annotations

from typing import Any, Callable

from app.auth.database import CustomItemRecord, utc_now
from app.auth.permissions import normalize_email


class CustomItemService:
    def __init__(self, session_factory_provider: Callable[[], Any]):
        self._session_factory_provider = session_factory_provider

    def _session_factory(self):
        return self._session_factory_provider()

    def _serialize(self, record: CustomItemRecord) -> dict[str, Any]:
        return {
            'id': record.id,
            'scope': 'global' if record.is_global else 'user',
            'owner_email': record.owner_email,
            'created_by_email': record.created_by_email,
            'source_raw': record.source_raw,
            'item_raw': record.item_raw,
            'display_name': record.display_name,
            'nbt_raw': record.nbt_raw,
            'created_at': record.created_at.isoformat() if record.created_at else None,
            'updated_at': record.updated_at.isoformat() if record.updated_at else None,
        }

    def list_for_user(self, email: str) -> list[dict[str, Any]]:
        normalized_email = normalize_email(email)
        session_factory = self._session_factory()
        with session_factory() as session:
            records = (
                session.query(CustomItemRecord)
                .filter((CustomItemRecord.is_global.is_(True)) | (CustomItemRecord.owner_email == normalized_email))
                .order_by(CustomItemRecord.is_global.desc(), CustomItemRecord.display_name.asc())
                .all()
            )
            return [self._serialize(record) for record in records]

    def save_for_user(self, payload: dict[str, Any], email: str, is_global: bool) -> dict[str, Any]:
        normalized_email = normalize_email(email)
        owner_email = None if is_global else normalized_email
        now = utc_now()
        session_factory = self._session_factory()
        with session_factory() as session:
            record = None
            item_id = payload.get('id')
            if item_id is not None:
                record = session.get(CustomItemRecord, int(item_id))
                if record is not None:
                    if record.is_global != is_global:
                        raise PermissionError('Custom item scope cannot be changed')
                    if not record.is_global and record.owner_email != normalized_email:
                        raise PermissionError('Cannot edit another user custom item')
            if record is None:
                record = (
                    session.query(CustomItemRecord)
                    .filter(CustomItemRecord.owner_email.is_(owner_email) if owner_email is None else CustomItemRecord.owner_email == owner_email)
                    .filter(CustomItemRecord.item_raw == payload['item_raw'])
                    .one_or_none()
                )
            if record is None:
                record = CustomItemRecord(created_at=now)
                session.add(record)
            record.owner_email = owner_email
            record.created_by_email = normalized_email
            record.source_raw = payload['source_raw']
            record.item_raw = payload['item_raw']
            record.display_name = payload['display_name']
            record.nbt_raw = payload.get('nbt_raw') or None
            record.is_global = is_global
            record.updated_at = now
            session.commit()
            session.refresh(record)
            return self._serialize(record)

    def delete_for_user(self, item_id: int, email: str, can_delete_global: bool) -> None:
        normalized_email = normalize_email(email)
        session_factory = self._session_factory()
        with session_factory() as session:
            record = session.get(CustomItemRecord, item_id)
            if record is None:
                raise KeyError('Custom item not found')
            if record.is_global and not can_delete_global:
                raise PermissionError('Only admins can delete global custom items')
            if not record.is_global and record.owner_email != normalized_email:
                raise PermissionError('Cannot delete another user custom item')
            session.delete(record)
            session.commit()
