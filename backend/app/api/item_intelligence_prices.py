from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.api.item_intelligence import (
    IntelligenceEvidence,
    IntelligenceItem,
    IntelligenceMetric,
    IntelligencePassport,
    IntelligenceSource,
    _require_session,
    utc_now,
)

router = APIRouter(prefix='/api/item-intelligence', tags=['item-intelligence'])


def _text(value: Any) -> str:
    return str(value or '').strip()


def _source(session, source_name: str) -> IntelligenceSource:
    name = _text(source_name) or 'server-prices.json'
    canonical_ref = f'price-upload:{name.lower()}'
    record = (
        session.query(IntelligenceSource)
        .filter(
            IntelligenceSource.source_type == 'server_price_file',
            IntelligenceSource.canonical_ref == canonical_ref,
        )
        .one_or_none()
    )
    if record is None:
        record = IntelligenceSource(
            source_type='server_price_file',
            name=name,
            canonical_ref=canonical_ref,
            trust_weight=0.95,
            last_checked_at=utc_now(),
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
    factory = _require_session()

    matched_rows = 0
    matched_items = 0
    unmatched: list[dict[str, Any]] = []
    invalid = 0

    with factory() as session:
        source = _source(session, source_name)
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
                price = float(row.get('price'))
            except (TypeError, ValueError):
                invalid += 1
                continue

            flags = row.get('flags') if isinstance(row.get('flags'), list) else []
            nbt = _text(row.get('nbt'))
            candidates = (
                session.query(IntelligenceItem)
                .filter(
                    IntelligenceItem.server_id == server_id,
                    IntelligenceItem.registry_key == registry_key,
                    IntelligenceItem.meta == meta,
                )
                .all()
            )
            if not candidates:
                # Production seed migration can temporarily leave records under an older context.
                candidates = (
                    session.query(IntelligenceItem)
                    .filter(IntelligenceItem.registry_key == registry_key, IntelligenceItem.meta == meta)
                    .all()
                )

            if not candidates:
                unmatched.append({'registryData': row.get('registry_data') or row.get('registryData'), 'metadata': meta, 'price': price})
                continue

            matched_rows += 1
            for item in candidates:
                passport = _passport(session, item.id)
                data = dict(passport.data_json or {})
                previous = data.get('current_price')
                if previous is not None and previous != price:
                    data['old_server_price'] = previous
                data['current_price'] = price
                data['price_min'] = price
                data['currency'] = currency
                data['price_source'] = source_name
                data['price_updated_at'] = utc_now().isoformat()
                data['price_rule_flags'] = flags
                data['price_nbt'] = nbt or None
                passport.data_json = data
                passport.updated_at = utc_now()
                item.updated_at = utc_now()

                metric = (
                    session.query(IntelligenceMetric)
                    .filter(
                        IntelligenceMetric.item_id == item.id,
                        IntelligenceMetric.metric_key == 'server_price',
                        IntelligenceMetric.context_key == server_id,
                    )
                    .one_or_none()
                )
                if metric is None:
                    metric = IntelligenceMetric(
                        item_id=item.id,
                        metric_key='server_price',
                        context_key=server_id,
                        value_numeric=price,
                        unit=currency,
                        confidence=0.95,
                        calculated_at=utc_now(),
                    )
                    session.add(metric)
                else:
                    metric.value_numeric = price
                    metric.unit = currency
                    metric.confidence = 0.95
                    metric.calculated_at = utc_now()

                evidence = (
                    session.query(IntelligenceEvidence)
                    .filter(
                        IntelligenceEvidence.item_id == item.id,
                        IntelligenceEvidence.source_id == source.id,
                        IntelligenceEvidence.field_name == 'server_price',
                    )
                    .one_or_none()
                )
                snapshot = {
                    'price': price,
                    'currency': currency,
                    'registryData': row.get('registry_data') or row.get('registryData'),
                    'metadata': meta,
                    'nbt': nbt or None,
                    'flags': flags,
                    'source_name': source_name,
                }
                if evidence is None:
                    session.add(IntelligenceEvidence(
                        item_id=item.id,
                        source_id=source.id,
                        field_name='server_price',
                        value_json=snapshot,
                        confidence=0.95,
                        observed_at=utc_now(),
                    ))
                else:
                    evidence.value_json = snapshot
                    evidence.confidence = 0.95
                    evidence.observed_at = utc_now()
                matched_items += 1

        session.commit()

    return {
        'processed': len(rows),
        'matched_rows': matched_rows,
        'matched_items': matched_items,
        'unmatched_count': len(unmatched),
        'unmatched': unmatched[:100],
        'invalid': invalid,
        'server_id': server_id,
        'source_name': source_name,
    }
