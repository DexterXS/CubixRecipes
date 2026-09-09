from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.api.item_intelligence import (
    IntelligenceBase,
    IntelligenceEvidence,
    IntelligenceItem,
    IntelligencePassport,
    IntelligenceSource,
    _passport,
    _require_session,
    utc_now,
)

router = APIRouter(prefix='/api/item-intelligence/enrichment', tags=['item-intelligence'])

STAGE_A_REVISION = 'stage-a-basic-v1'


class IntelligenceEnrichmentRun(IntelligenceBase):
    __tablename__ = 'intelligence_enrichment_runs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stage: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    server_id: Mapped[str] = mapped_column(String(96), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default='running', index=True)
    total_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    changed_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cursor_id: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


def _run_payload(run: IntelligenceEnrichmentRun | None) -> dict[str, Any]:
    if run is None:
        return {
            'stage': 'basic', 'revision': STAGE_A_REVISION, 'status': 'not_started',
            'total_items': 0, 'processed_items': 0, 'changed_items': 0,
            'skipped_items': 0, 'cursor_id': 0, 'progress_percent': 0.0,
        }
    progress = (run.processed_items / run.total_items * 100.0) if run.total_items else 100.0
    return {
        'id': run.id, 'stage': run.stage, 'revision': STAGE_A_REVISION,
        'server_id': run.server_id, 'status': run.status,
        'total_items': run.total_items, 'processed_items': run.processed_items,
        'changed_items': run.changed_items, 'skipped_items': run.skipped_items,
        'cursor_id': run.cursor_id, 'message': run.message,
        'progress_percent': round(progress, 1),
        'started_at': run.started_at.isoformat() if run.started_at else None,
        'updated_at': run.updated_at.isoformat() if run.updated_at else None,
        'completed_at': run.completed_at.isoformat() if run.completed_at else None,
    }


def _latest_run(session, server_id: str) -> IntelligenceEnrichmentRun | None:
    return (
        session.query(IntelligenceEnrichmentRun)
        .filter(
            IntelligenceEnrichmentRun.stage == 'basic',
            IntelligenceEnrichmentRun.server_id == server_id,
        )
        .order_by(IntelligenceEnrichmentRun.id.desc())
        .first()
    )


def _stage_source(session) -> IntelligenceSource:
    canonical_ref = f'cubixrecipes:{STAGE_A_REVISION}'
    source = (
        session.query(IntelligenceSource)
        .filter(
            IntelligenceSource.source_type == 'derived',
            IntelligenceSource.canonical_ref == canonical_ref,
        )
        .one_or_none()
    )
    if source is None:
        source = IntelligenceSource(
            source_type='derived',
            name='Stage A Basic Enrichment',
            canonical_ref=canonical_ref,
            trust_weight=0.95,
            last_checked_at=utc_now(),
        )
        session.add(source)
        session.flush()
    else:
        source.last_checked_at = utc_now()
    return source


def _is_empty(value: Any) -> bool:
    return value is None or value == '' or value == [] or value == {}


def _upsert_stage_evidence(session, item_id: int, source_id: int, field_name: str, value: Any, confidence: float, note: str) -> None:
    row = (
        session.query(IntelligenceEvidence)
        .filter(
            IntelligenceEvidence.item_id == item_id,
            IntelligenceEvidence.source_id == source_id,
            IntelligenceEvidence.field_name == field_name,
        )
        .one_or_none()
    )
    if row is None:
        row = IntelligenceEvidence(
            item_id=item_id,
            source_id=source_id,
            field_name=field_name,
            value_json=value,
            raw_excerpt=note,
            confidence=confidence,
            observed_at=utc_now(),
        )
        session.add(row)
    else:
        row.value_json = value
        row.raw_excerpt = note
        row.confidence = confidence
        row.observed_at = utc_now()


def _catalog_snapshot(evidence_rows: list[IntelligenceEvidence]) -> dict[str, Any]:
    for row in evidence_rows:
        if row.field_name == 'catalog_seed' and isinstance(row.value_json, dict):
            return row.value_json
    return {}


def _enrich_item(session, item: IntelligenceItem, evidence_rows: list[IntelligenceEvidence], source: IntelligenceSource) -> bool:
    passport = _passport(session, item.id, create=True)
    data = dict(passport.data_json or {})
    snapshot = _catalog_snapshot(evidence_rows)
    changed = False

    aliases = []
    for value in (item.display_ru, item.display_en):
        text = str(value or '').strip()
        if text and text not in aliases:
            aliases.append(text)

    derived: dict[str, tuple[Any, float, str]] = {
        'aliases': (aliases, 0.98, 'Normalized from display_ru/display_en in the production item catalog.'),
        'legacy_id': (snapshot.get('legacy_id'), 0.98, 'Copied from production catalog evidence.'),
        'ore_dict': (snapshot.get('ore_groups') or [], 0.98, 'Copied from OreDictionary/catalog evidence.'),
        'server_context': (item.server_id, 1.0, 'Taken from the Item Intelligence record server_id.'),
        'data_revision': (STAGE_A_REVISION, 1.0, 'Stage A enrichment revision.'),
    }

    source_ids = {row.source_id for row in evidence_rows}
    source_names: list[str] = []
    if source_ids:
        source_names = [
            name for (name,) in session.query(IntelligenceSource.name)
            .filter(IntelligenceSource.id.in_(source_ids))
            .order_by(IntelligenceSource.name.asc())
            .all()
            if name
        ]
    verified = max((row.observed_at for row in evidence_rows if row.observed_at), default=item.updated_at)
    confidences = [float(row.confidence) for row in evidence_rows if row.confidence is not None]
    avg_confidence = round(sum(confidences) / len(confidences), 3) if confidences else None

    # System quality fields are refreshed every run because they describe current evidence state.
    quality_values: dict[str, tuple[Any, float, str]] = {
        'source_count': (len(source_ids), 1.0, 'Count of distinct evidence sources currently linked to this item.'),
        'source_summary': (', '.join(source_names), 1.0, 'Names of evidence sources currently linked to this item.'),
        'last_verified_at': (verified.isoformat() if verified else None, 1.0, 'Latest evidence observation timestamp.'),
    }

    for key, (value, confidence, note) in derived.items():
        if _is_empty(value):
            continue
        if _is_empty(data.get(key)):
            data[key] = value
            changed = True
            _upsert_stage_evidence(session, item.id, source.id, f'passport.{key}', value, confidence, note)

    for key, (value, confidence, note) in quality_values.items():
        if _is_empty(value):
            continue
        if data.get(key) != value:
            data[key] = value
            changed = True
        _upsert_stage_evidence(session, item.id, source.id, f'passport.{key}', value, confidence, note)

    if avg_confidence is not None and item.confidence is None:
        item.confidence = avg_confidence
        changed = True
        _upsert_stage_evidence(
            session, item.id, source.id, 'core.confidence', avg_confidence, 0.95,
            'Average confidence of currently attached evidence; only set when core confidence was empty.',
        )

    if item.status in {'not_started', 'seeded'}:
        item.status = 'partial'
        changed = True
    item.indexed_at = item.indexed_at or utc_now()
    item.updated_at = utc_now()
    passport.data_json = data
    passport.updated_at = utc_now()
    return changed


@router.get('/basic/status')
def basic_enrichment_status(server_id: str = 'production'):
    factory = _require_session()
    with factory() as session:
        return _run_payload(_latest_run(session, server_id))


@router.post('/basic/start')
def basic_enrichment_start(server_id: str = 'production', restart: bool = False):
    factory = _require_session()
    with factory() as session:
        current = _latest_run(session, server_id)
        if current and current.status == 'running' and not restart:
            return _run_payload(current)
        total = session.query(func.count(IntelligenceItem.id)).filter(IntelligenceItem.server_id == server_id).scalar() or 0
        run = IntelligenceEnrichmentRun(
            stage='basic', server_id=server_id, status='running', total_items=int(total),
            processed_items=0, changed_items=0, skipped_items=0, cursor_id=0,
            message='Stage A Basic Enrichment', started_at=utc_now(), updated_at=utc_now(),
        )
        session.add(run)
        session.commit()
        session.refresh(run)
        return _run_payload(run)


@router.post('/basic/run-batch')
def basic_enrichment_run_batch(server_id: str = 'production', limit: int = 500):
    factory = _require_session()
    safe_limit = max(10, min(limit, 1000))
    with factory() as session:
        run = _latest_run(session, server_id)
        if run is None:
            raise HTTPException(status_code=409, detail='Stage A has not been started')
        if run.status == 'completed':
            return _run_payload(run)
        if run.status != 'running':
            raise HTTPException(status_code=409, detail=f'Stage A is {run.status}')

        items = (
            session.query(IntelligenceItem)
            .filter(
                IntelligenceItem.server_id == server_id,
                IntelligenceItem.id > run.cursor_id,
            )
            .order_by(IntelligenceItem.id.asc())
            .limit(safe_limit)
            .all()
        )
        if not items:
            run.status = 'completed'
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            session.commit()
            return _run_payload(run)

        item_ids = [item.id for item in items]
        evidence_map: dict[int, list[IntelligenceEvidence]] = defaultdict(list)
        for row in session.query(IntelligenceEvidence).filter(IntelligenceEvidence.item_id.in_(item_ids)).all():
            evidence_map[row.item_id].append(row)

        source = _stage_source(session)
        changed = 0
        for item in items:
            if _enrich_item(session, item, evidence_map.get(item.id, []), source):
                changed += 1

        run.processed_items += len(items)
        run.changed_items += changed
        run.skipped_items += len(items) - changed
        run.cursor_id = items[-1].id
        run.updated_at = utc_now()
        if run.processed_items >= run.total_items:
            run.status = 'completed'
            run.completed_at = utc_now()
        session.commit()
        session.refresh(run)
        return _run_payload(run)
