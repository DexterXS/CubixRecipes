from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import DateTime, Float, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.api.item_intelligence import (
    IntelligenceBase,
    IntelligenceEvidence,
    IntelligenceItem,
    IntelligenceMetric,
    IntelligencePassport,
    IntelligenceSource,
    _require_session,
    utc_now,
)

router = APIRouter(prefix='/api/item-intelligence', tags=['item-intelligence'])
SALE_RESTRICTED_MARKER = 999999.0


class PriceImportBatch(IntelligenceBase):
    __tablename__ = 'intelligence_price_imports'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    import_id: Mapped[str] = mapped_column(String(96), nullable=False, unique=True, index=True)
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    server_id: Mapped[str] = mapped_column(String(96), nullable=False, default='production', index=True)
    currency: Mapped[str] = mapped_column(String(64), nullable=False, default='server')
    status: Mapped[str] = mapped_column(String(32), nullable=False, default='running')
    total_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    matched_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    matched_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    restricted_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unmatched_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    invalid_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    normal_price_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    normal_price_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    unmatched_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[Any] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    completed_at: Mapped[Any | None] = mapped_column(DateTime(timezone=True), nullable=True)


def _text(value: Any) -> str:
    return str(value or '').strip()


def _source(session, source_name: str) -> IntelligenceSource:
    name = _text(source_name) or 'server-prices.json'
    canonical_ref = f'price-upload:{name.lower()}'
    record = session.query(IntelligenceSource).filter(
        IntelligenceSource.source_type == 'server_price_file',
        IntelligenceSource.canonical_ref == canonical_ref,
    ).one_or_none()
    if record is None:
        record = IntelligenceSource(
            source_type='server_price_file', name=name, canonical_ref=canonical_ref,
            trust_weight=0.95, last_checked_at=utc_now(),
        )
        session.add(record)
        session.flush()
    else:
        record.last_checked_at = utc_now()
    return record


def _passport(session, item_id: int) -> IntelligencePassport:
    record = session.query(IntelligencePassport).filter(IntelligencePassport.item_id == item_id).one_or_none()
    if record is None:
        record = IntelligencePassport(item_id=item_id, data_json={}, updated_at=utc_now())
        session.add(record)
        session.flush()
    return record


def _history_payload(row: PriceImportBatch) -> dict[str, Any]:
    return {
        'import_id': row.import_id,
        'source_name': row.source_name,
        'server_id': row.server_id,
        'currency': row.currency,
        'status': row.status,
        'total_rows': row.total_rows,
        'processed_rows': row.processed_rows,
        'matched_rows': row.matched_rows,
        'matched_items': row.matched_items,
        'restricted_rows': row.restricted_rows,
        'unmatched_rows': row.unmatched_rows,
        'invalid_rows': row.invalid_rows,
        'normal_price_min': row.normal_price_min,
        'normal_price_max': row.normal_price_max,
        'created_at': row.created_at.isoformat() if row.created_at else None,
        'completed_at': row.completed_at.isoformat() if row.completed_at else None,
    }


@router.get('/price-imports')
def price_imports(limit: int = 10):
    factory = _require_session()
    with factory() as session:
        rows = session.query(PriceImportBatch).order_by(PriceImportBatch.id.desc()).limit(max(1, min(limit, 50))).all()
        return {'imports': [_history_payload(row) for row in rows]}


@router.post('/import-prices')
def import_prices(payload: dict[str, Any]):
    rows = payload.get('items')
    if not isinstance(rows, list):
        raise HTTPException(status_code=400, detail='items must be a list')
    if len(rows) > 500:
        raise HTTPException(status_code=400, detail='Maximum price import batch is 500 items')

    server_id = _text(payload.get('server_id')) or 'production'
    source_name = _text(payload.get('source_name')) or 'server-prices.json'
    currency = _text(payload.get('currency')) or 'server'
    import_id = _text(payload.get('import_id')) or f'{source_name}:{utc_now().isoformat()}'
    total_rows = max(int(payload.get('total_rows') or len(rows)), len(rows))
    finalize = bool(payload.get('finalize'))
    factory = _require_session()

    matched_rows = 0
    matched_items = 0
    restricted_rows = 0
    unmatched: list[dict[str, Any]] = []
    invalid = 0
    normal_prices: list[float] = []

    with factory() as session:
        source = _source(session, source_name)
        history = session.query(PriceImportBatch).filter(PriceImportBatch.import_id == import_id).one_or_none()
        if history is None:
            history = PriceImportBatch(
                import_id=import_id, source_name=source_name, server_id=server_id,
                currency=currency, total_rows=total_rows, created_at=utc_now(),
            )
            session.add(history)
            session.flush()

        for row in rows:
            if not isinstance(row, dict):
                invalid += 1
                continue
            registry_key = _text(row.get('registry_data') or row.get('registryData')).lower()
            if not registry_key:
                invalid += 1
                continue
            try:
                meta = int(row.get('metadata') or 0)
                raw_price = float(row.get('price'))
            except (TypeError, ValueError):
                invalid += 1
                continue

            restricted = raw_price == SALE_RESTRICTED_MARKER
            if restricted:
                restricted_rows += 1
            else:
                normal_prices.append(raw_price)

            flags = row.get('flags') if isinstance(row.get('flags'), list) else []
            nbt = _text(row.get('nbt'))
            candidates = session.query(IntelligenceItem).filter(
                IntelligenceItem.server_id == server_id,
                IntelligenceItem.registry_key == registry_key,
                IntelligenceItem.meta == meta,
            ).all()
            if not candidates:
                candidates = session.query(IntelligenceItem).filter(
                    IntelligenceItem.registry_key == registry_key,
                    IntelligenceItem.meta == meta,
                ).all()
            if not candidates:
                unmatched.append({'registryData': row.get('registry_data') or row.get('registryData'), 'metadata': meta, 'price': raw_price})
                continue

            matched_rows += 1
            for item in candidates:
                passport = _passport(session, item.id)
                data = dict(passport.data_json or {})
                previous = data.get('current_price')
                if previous is not None and previous != raw_price:
                    data['old_server_price'] = previous

                data['raw_server_price'] = raw_price
                data['price_source'] = source_name
                data['price_updated_at'] = utc_now().isoformat()
                data['price_rule_flags'] = flags
                data['price_nbt'] = nbt or None

                if restricted:
                    data['trade_allowed'] = False
                    data['sale_restricted'] = True
                    data['restriction_reason'] = 'Продажа запрещена правилами сервера'
                    data['market_price_eligible'] = False
                    data['exclude_from_market_calculations'] = True
                    data['current_price'] = None
                    data['price_min'] = None
                    data['price_max'] = None
                    data['price_avg'] = None
                    data['server_overrides'] = 'Продажа предмета запрещена правилами сервера (маркер цены 999999).'
                else:
                    data['trade_allowed'] = True
                    data['sale_restricted'] = False
                    data['restriction_reason'] = None
                    data['market_price_eligible'] = True
                    data['exclude_from_market_calculations'] = False
                    data['current_price'] = raw_price
                    data['price_min'] = raw_price
                    if data.get('server_overrides') == 'Продажа предмета запрещена правилами сервера (маркер цены 999999).':
                        data['server_overrides'] = None

                passport.data_json = data
                passport.updated_at = utc_now()
                item.updated_at = utc_now()

                metric = session.query(IntelligenceMetric).filter(
                    IntelligenceMetric.item_id == item.id,
                    IntelligenceMetric.metric_key == 'server_price',
                    IntelligenceMetric.context_key == server_id,
                ).one_or_none()
                if metric is None:
                    metric = IntelligenceMetric(
                        item_id=item.id, metric_key='server_price', context_key=server_id,
                        unit=currency, confidence=0.95, calculated_at=utc_now(),
                    )
                    session.add(metric)
                metric.value_numeric = None if restricted else raw_price
                metric.value_text = 'sale_restricted' if restricted else None
                metric.unit = currency
                metric.confidence = 0.95
                metric.calculated_at = utc_now()

                field_name = 'server_sale_restriction' if restricted else 'server_price'
                snapshot = {
                    'raw_price': raw_price,
                    'price': None if restricted else raw_price,
                    'sale_restricted': restricted,
                    'trade_allowed': not restricted,
                    'restriction_reason': 'Продажа запрещена правилами сервера' if restricted else None,
                    'currency': currency,
                    'registryData': row.get('registry_data') or row.get('registryData'),
                    'metadata': meta,
                    'nbt': nbt or None,
                    'flags': flags,
                    'source_name': source_name,
                    'import_id': import_id,
                }
                evidence = session.query(IntelligenceEvidence).filter(
                    IntelligenceEvidence.item_id == item.id,
                    IntelligenceEvidence.source_id == source.id,
                    IntelligenceEvidence.field_name == field_name,
                ).one_or_none()
                if evidence is None:
                    session.add(IntelligenceEvidence(
                        item_id=item.id, source_id=source.id, field_name=field_name,
                        value_json=snapshot, confidence=0.95, observed_at=utc_now(),
                    ))
                else:
                    evidence.value_json = snapshot
                    evidence.confidence = 0.95
                    evidence.observed_at = utc_now()
                matched_items += 1

        history.total_rows = max(history.total_rows, total_rows)
        history.processed_rows += len(rows)
        history.matched_rows += matched_rows
        history.matched_items += matched_items
        history.restricted_rows += restricted_rows
        history.unmatched_rows += len(unmatched)
        history.invalid_rows += invalid
        if normal_prices:
            batch_min, batch_max = min(normal_prices), max(normal_prices)
            history.normal_price_min = batch_min if history.normal_price_min is None else min(history.normal_price_min, batch_min)
            history.normal_price_max = batch_max if history.normal_price_max is None else max(history.normal_price_max, batch_max)
        old_unmatched = list(history.unmatched_json or [])
        history.unmatched_json = (old_unmatched + unmatched)[:100]
        if finalize:
            history.status = 'completed'
            history.completed_at = utc_now()
        session.commit()

        history_payload = _history_payload(history)

    return {
        'processed': len(rows),
        'matched_rows': matched_rows,
        'matched_items': matched_items,
        'restricted_rows': restricted_rows,
        'unmatched_count': len(unmatched),
        'unmatched': unmatched[:100],
        'invalid': invalid,
        'server_id': server_id,
        'source_name': source_name,
        'import_id': import_id,
        'history': history_payload,
    }
