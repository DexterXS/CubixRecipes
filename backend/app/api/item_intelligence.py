from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import DateTime, Float, Integer, JSON, String, Text, UniqueConstraint, create_engine, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from app.auth.database import normalize_database_url


router = APIRouter(prefix='/api/item-intelligence', tags=['item-intelligence'])


class IntelligenceBase(DeclarativeBase):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class IntelligenceItem(IntelligenceBase):
    __tablename__ = 'intelligence_items'
    __table_args__ = (
        UniqueConstraint('server_id', 'registry_key', 'meta', 'nbt_hash', name='uq_intelligence_item_identity'),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    server_id: Mapped[str] = mapped_column(String(96), nullable=False, default='default', index=True)
    registry_key: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    meta: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    nbt_hash: Mapped[str] = mapped_column(String(64), nullable=False, default='')
    raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    mod_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    display_ru: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_en: Mapped[str | None] = mapped_column(String(255), nullable=True)
    icon_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    tier: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    rarity: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default='not_started', index=True)
    completion_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class IntelligenceSource(IntelligenceBase):
    __tablename__ = 'intelligence_sources'
    __table_args__ = (
        UniqueConstraint('source_type', 'canonical_ref', name='uq_intelligence_source_ref'),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    canonical_ref: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    trust_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class IntelligenceEvidence(IntelligenceBase):
    __tablename__ = 'intelligence_evidence'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    source_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    field_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    value_json: Mapped[dict[str, Any] | list[Any] | str | int | float | bool | None] = mapped_column(JSON, nullable=True)
    raw_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class IntelligenceMetric(IntelligenceBase):
    __tablename__ = 'intelligence_metrics'
    __table_args__ = (
        UniqueConstraint('item_id', 'metric_key', 'context_key', name='uq_intelligence_metric_context'),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    metric_key: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    context_key: Mapped[str] = mapped_column(String(255), nullable=False, default='global')
    value_numeric: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(64), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


_session_factory = None
_configuration_error: str | None = None


def _session():
    global _session_factory, _configuration_error
    if _session_factory is not None:
        return _session_factory
    database_url = os.environ.get('ITEM_INTELLIGENCE_DATABASE_URL', '').strip()
    if not database_url:
        _configuration_error = 'ITEM_INTELLIGENCE_DATABASE_URL is not configured'
        return None
    if database_url.startswith('${{'):
        _configuration_error = 'ITEM_INTELLIGENCE_DATABASE_URL is not resolved by Railway'
        return None
    try:
        engine = create_engine(normalize_database_url(database_url), pool_pre_ping=True)
        IntelligenceBase.metadata.create_all(engine)
        _session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        _configuration_error = None
    except Exception as exc:  # pragma: no cover - depends on Railway runtime
        _configuration_error = str(exc)
        return None
    return _session_factory


def _require_session():
    factory = _session()
    if factory is None:
        raise HTTPException(status_code=503, detail=_configuration_error or 'Item intelligence database unavailable')
    return factory


def _item_payload(record: IntelligenceItem) -> dict[str, Any]:
    return {
        'id': record.id,
        'server_id': record.server_id,
        'registry_key': record.registry_key,
        'meta': record.meta,
        'nbt_hash': record.nbt_hash,
        'raw': record.raw,
        'mod_id': record.mod_id,
        'display_ru': record.display_ru,
        'display_en': record.display_en,
        'icon_url': record.icon_url,
        'description': record.description,
        'category': record.category,
        'tier': record.tier,
        'rarity': record.rarity,
        'status': record.status,
        'completion_percent': record.completion_percent,
        'confidence': record.confidence,
        'updated_at': record.updated_at.isoformat() if record.updated_at else None,
        'indexed_at': record.indexed_at.isoformat() if record.indexed_at else None,
    }


@router.get('/health')
def item_intelligence_health():
    factory = _session()
    return {
        'configured': bool(os.environ.get('ITEM_INTELLIGENCE_DATABASE_URL', '').strip()),
        'connected': factory is not None,
        'error': _configuration_error,
    }


@router.get('/summary')
def item_intelligence_summary():
    factory = _require_session()
    with factory() as session:
        total = session.query(func.count(IntelligenceItem.id)).scalar() or 0
        ready = session.query(func.count(IntelligenceItem.id)).filter(IntelligenceItem.status == 'ready').scalar() or 0
        review = session.query(func.count(IntelligenceItem.id)).filter(IntelligenceItem.status == 'needs_review').scalar() or 0
        sources = session.query(func.count(IntelligenceSource.id)).scalar() or 0
        evidence = session.query(func.count(IntelligenceEvidence.id)).scalar() or 0
        avg_completion = session.query(func.avg(IntelligenceItem.completion_percent)).scalar() or 0
        mods = session.query(func.count(func.distinct(IntelligenceItem.mod_id))).filter(IntelligenceItem.mod_id.is_not(None)).scalar() or 0
        return {
            'items_total': int(total),
            'items_ready': int(ready),
            'items_needs_review': int(review),
            'sources_total': int(sources),
            'evidence_total': int(evidence),
            'mods_total': int(mods),
            'average_completion': round(float(avg_completion), 1),
        }


@router.get('/items')
def item_intelligence_items(limit: int = 5000, offset: int = 0, server_id: str | None = None):
    factory = _require_session()
    safe_limit = max(1, min(limit, 10000))
    safe_offset = max(0, offset)
    with factory() as session:
        query = session.query(IntelligenceItem)
        if server_id:
            query = query.filter(IntelligenceItem.server_id == server_id)
        records = query.order_by(IntelligenceItem.mod_id.asc(), IntelligenceItem.registry_key.asc(), IntelligenceItem.meta.asc()).offset(safe_offset).limit(safe_limit).all()
        return {'items': [_item_payload(record) for record in records], 'limit': safe_limit, 'offset': safe_offset}


@router.get('/items/{item_id}')
def item_intelligence_item(item_id: int):
    factory = _require_session()
    with factory() as session:
        record = session.get(IntelligenceItem, item_id)
        if record is None:
            raise HTTPException(status_code=404, detail='Item intelligence record not found')
        evidence = session.query(IntelligenceEvidence).filter(IntelligenceEvidence.item_id == item_id).all()
        metrics = session.query(IntelligenceMetric).filter(IntelligenceMetric.item_id == item_id).all()
        payload = _item_payload(record)
        payload['evidence'] = [
            {
                'id': row.id,
                'source_id': row.source_id,
                'field_name': row.field_name,
                'value': row.value_json,
                'raw_excerpt': row.raw_excerpt,
                'confidence': row.confidence,
                'observed_at': row.observed_at.isoformat() if row.observed_at else None,
            }
            for row in evidence
        ]
        payload['metrics'] = [
            {
                'metric_key': row.metric_key,
                'context_key': row.context_key,
                'value_numeric': row.value_numeric,
                'value_text': row.value_text,
                'unit': row.unit,
                'confidence': row.confidence,
                'calculated_at': row.calculated_at.isoformat() if row.calculated_at else None,
            }
            for row in metrics
        ]
        return payload
