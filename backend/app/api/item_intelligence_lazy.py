from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, or_

from app.api.item_intelligence import (
    IntelligenceEvidence,
    IntelligenceItem,
    IntelligenceMetric,
    _item_payload,
    _passport,
    _require_session,
)

router = APIRouter(prefix='/api/item-intelligence', tags=['item-intelligence'])


def _index_payload(record: IntelligenceItem) -> dict:
    return {
        'id': record.id,
        'server_id': record.server_id,
        'registry_key': record.registry_key,
        'meta': record.meta,
        'mod_id': record.mod_id,
        'display_ru': record.display_ru,
        'display_en': record.display_en,
        'icon_url': record.icon_url,
        'status': record.status,
        'completion_percent': record.completion_percent,
        'updated_at': record.updated_at.isoformat() if record.updated_at else None,
    }


@router.get('/index')
def item_intelligence_index(
    q: str | None = None,
    mod_id: str | None = None,
    server_id: str | None = None,
    limit: int = 250,
    offset: int = 0,
):
    factory = _require_session()
    safe_limit = max(1, min(limit, 500))
    safe_offset = max(0, offset)
    needle = (q or '').strip().lower()

    with factory() as session:
        query = session.query(IntelligenceItem)
        if server_id:
            query = query.filter(IntelligenceItem.server_id == server_id)
        if mod_id and mod_id != 'all':
            query = query.filter(IntelligenceItem.mod_id == mod_id)
        if needle:
            like = f'%{needle}%'
            query = query.filter(or_(
                func.lower(IntelligenceItem.registry_key).like(like),
                func.lower(func.coalesce(IntelligenceItem.display_ru, '')).like(like),
                func.lower(func.coalesce(IntelligenceItem.display_en, '')).like(like),
                func.lower(func.coalesce(IntelligenceItem.mod_id, '')).like(like),
            ))

        total = query.with_entities(func.count(IntelligenceItem.id)).scalar() or 0
        records = (
            query.order_by(
                IntelligenceItem.mod_id.asc(),
                IntelligenceItem.registry_key.asc(),
                IntelligenceItem.meta.asc(),
            )
            .offset(safe_offset)
            .limit(safe_limit)
            .all()
        )
        return {
            'items': [_index_payload(record) for record in records],
            'total': int(total),
            'limit': safe_limit,
            'offset': safe_offset,
            'has_more': safe_offset + len(records) < int(total),
        }


@router.get('/mods')
def item_intelligence_mods(server_id: str | None = None):
    factory = _require_session()
    with factory() as session:
        query = session.query(IntelligenceItem.mod_id, func.count(IntelligenceItem.id))
        if server_id:
            query = query.filter(IntelligenceItem.server_id == server_id)
        rows = (
            query.filter(IntelligenceItem.mod_id.is_not(None))
            .group_by(IntelligenceItem.mod_id)
            .order_by(IntelligenceItem.mod_id.asc())
            .all()
        )
        return {'mods': [{'mod_id': mod_id, 'count': int(count)} for mod_id, count in rows if mod_id]}


@router.get('/items/{item_id}/passport')
def item_intelligence_passport(item_id: int):
    factory = _require_session()
    with factory() as session:
        record = session.get(IntelligenceItem, item_id)
        if record is None:
            raise HTTPException(status_code=404, detail='Item intelligence record not found')
        passport = _passport(session, item_id)
        payload = _item_payload(record)
        payload['passport'] = passport.data_json if passport else {}
        return payload


@router.get('/items/{item_id}/evidence')
def item_intelligence_evidence(item_id: int, limit: int = 100, offset: int = 0):
    factory = _require_session()
    safe_limit = max(1, min(limit, 500))
    safe_offset = max(0, offset)
    with factory() as session:
        total = session.query(func.count(IntelligenceEvidence.id)).filter(IntelligenceEvidence.item_id == item_id).scalar() or 0
        rows = (
            session.query(IntelligenceEvidence)
            .filter(IntelligenceEvidence.item_id == item_id)
            .order_by(IntelligenceEvidence.observed_at.desc(), IntelligenceEvidence.id.desc())
            .offset(safe_offset)
            .limit(safe_limit)
            .all()
        )
        return {
            'items': [{
                'id': row.id,
                'source_id': row.source_id,
                'field_name': row.field_name,
                'value': row.value_json,
                'raw_excerpt': row.raw_excerpt,
                'confidence': row.confidence,
                'observed_at': row.observed_at.isoformat() if row.observed_at else None,
            } for row in rows],
            'total': int(total),
            'limit': safe_limit,
            'offset': safe_offset,
            'has_more': safe_offset + len(rows) < int(total),
        }


@router.get('/items/{item_id}/metrics')
def item_intelligence_metrics(item_id: int):
    factory = _require_session()
    with factory() as session:
        rows = (
            session.query(IntelligenceMetric)
            .filter(IntelligenceMetric.item_id == item_id)
            .order_by(IntelligenceMetric.metric_key.asc())
            .all()
        )
        return {'metrics': [{
            'metric_key': row.metric_key,
            'context_key': row.context_key,
            'value_numeric': row.value_numeric,
            'value_text': row.value_text,
            'unit': row.unit,
            'confidence': row.confidence,
            'calculated_at': row.calculated_at.isoformat() if row.calculated_at else None,
        } for row in rows]}
