from __future__ import annotations

import hashlib
import json
import os
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException

from app.api.item_intelligence import (
    IntelligenceEvidence,
    IntelligenceItem,
    IntelligenceSource,
    _require_session,
    utc_now,
)


router = APIRouter(prefix='/api/item-intelligence', tags=['item-intelligence'])


def _text(value: Any) -> str:
    return str(value or '').strip()


def _source(session, name: str) -> IntelligenceSource:
    source_name = _text(name).lower() or 'catalog'
    canonical_ref = f'cubixrecipes:{source_name}'
    record = (
        session.query(IntelligenceSource)
        .filter(
            IntelligenceSource.source_type == 'local',
            IntelligenceSource.canonical_ref == canonical_ref,
        )
        .one_or_none()
    )
    if record is None:
        record = IntelligenceSource(
            source_type='local',
            name=source_name,
            canonical_ref=canonical_ref,
            trust_weight=0.85,
            last_checked_at=utc_now(),
        )
        session.add(record)
        session.flush()
    else:
        record.last_checked_at = utc_now()
    return record


def _seed_completion(item: dict[str, Any]) -> int:
    score = 10
    if _text(item.get('display_ru')) or _text(item.get('display_en')):
        score += 10
    if item.get('legacy_id') is not None:
        score += 5
    if _text(item.get('icon_url')):
        score += 10
    if _text(item.get('raw')):
        score += 5
    if item.get('ore_groups'):
        score += 5
    if _text(item.get('nbt_raw')):
        score += 5
    return min(score, 50)


def _bootstrap_batch(items: list[dict[str, Any]], server_id: str) -> dict[str, int | str]:
    factory = _require_session()
    created = 0
    updated = 0
    evidence_created = 0

    with factory() as session:
        for raw_item in items:
            if not isinstance(raw_item, dict):
                continue
            registry_key = _text(raw_item.get('key') or raw_item.get('registry_key')).lower()
            if not registry_key:
                continue
            try:
                meta = int(raw_item.get('meta') or 0)
            except (TypeError, ValueError):
                meta = 0
            nbt_raw = _text(raw_item.get('nbt_raw'))
            nbt_hash = hashlib.sha256(nbt_raw.encode('utf-8')).hexdigest() if nbt_raw else ''
            record = (
                session.query(IntelligenceItem)
                .filter(
                    IntelligenceItem.server_id == server_id,
                    IntelligenceItem.registry_key == registry_key,
                    IntelligenceItem.meta == meta,
                    IntelligenceItem.nbt_hash == nbt_hash,
                )
                .one_or_none()
            )
            if record is None:
                record = IntelligenceItem(
                    server_id=server_id,
                    registry_key=registry_key,
                    meta=meta,
                    nbt_hash=nbt_hash,
                    status='seeded',
                    created_at=utc_now(),
                )
                session.add(record)
                session.flush()
                created += 1
            else:
                updated += 1

            record.raw = _text(raw_item.get('raw')) or record.raw
            record.mod_id = registry_key.split(':', 1)[0] if ':' in registry_key else (record.mod_id or 'unknown')
            record.display_ru = _text(raw_item.get('display_ru')) or record.display_ru
            record.display_en = _text(raw_item.get('display_en')) or record.display_en
            record.icon_url = _text(raw_item.get('icon_url')) or record.icon_url
            record.completion_percent = max(record.completion_percent or 0, _seed_completion(raw_item))
            if record.status in {'not_started', 'seeded'}:
                record.status = 'seeded'
            record.updated_at = utc_now()
            record.indexed_at = record.indexed_at or utc_now()

            source_names = raw_item.get('sources') if isinstance(raw_item.get('sources'), list) else []
            if raw_item.get('ore_groups'):
                source_names = [*source_names, 'oredict']
            source_names = [*source_names, 'production-catalog']

            snapshot = {
                'display_ru': raw_item.get('display_ru'),
                'display_en': raw_item.get('display_en'),
                'legacy_id': raw_item.get('legacy_id'),
                'meta': meta,
                'raw': raw_item.get('raw'),
                'icon_url': raw_item.get('icon_url'),
                'ore_groups': raw_item.get('ore_groups') or [],
                'has_nbt': bool(nbt_raw),
                'nbt_raw': nbt_raw or None,
            }
            for source_name in sorted({_text(name).lower() for name in source_names if _text(name)}):
                source = _source(session, source_name)
                existing = (
                    session.query(IntelligenceEvidence)
                    .filter(
                        IntelligenceEvidence.item_id == record.id,
                        IntelligenceEvidence.source_id == source.id,
                        IntelligenceEvidence.field_name == 'catalog_seed',
                    )
                    .one_or_none()
                )
                if existing is None:
                    session.add(IntelligenceEvidence(
                        item_id=record.id,
                        source_id=source.id,
                        field_name='catalog_seed',
                        value_json=snapshot,
                        confidence=0.9,
                        observed_at=utc_now(),
                    ))
                    evidence_created += 1
                else:
                    existing.value_json = snapshot
                    existing.observed_at = utc_now()

        session.commit()

    return {
        'processed': len(items),
        'created': created,
        'updated': updated,
        'evidence_created': evidence_created,
        'server_id': server_id,
    }


@router.post('/bootstrap-catalog')
def bootstrap_catalog(payload: dict[str, Any]):
    items = payload.get('items')
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail='items must be a list')
    if len(items) > 500:
        raise HTTPException(status_code=400, detail='Maximum bootstrap batch is 500 items')
    return _bootstrap_batch(items, _text(payload.get('server_id')) or 'default')


@router.post('/bootstrap-from-production')
def bootstrap_from_production():
    base_url = _text(os.environ.get('ITEM_INTELLIGENCE_SOURCE_URL')).rstrip('/')
    if not base_url:
        raise HTTPException(status_code=503, detail='ITEM_INTELLIGENCE_SOURCE_URL is not configured')
    url = f'{base_url}/api/itempanel/catalog'
    try:
        request = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'CubixRecipes-ItemIntelligence/1.0'})
        with urlopen(request, timeout=60) as response:  # nosec B310 - URL is controlled by Railway env
            payload = json.load(response)
    except (URLError, TimeoutError, ValueError, OSError) as exc:
        raise HTTPException(status_code=502, detail=f'Could not read production catalog: {exc}') from exc

    items = payload.get('entries') if isinstance(payload, dict) else None
    if not isinstance(items, list):
        raise HTTPException(status_code=502, detail='Production catalog response has no entries list')

    total = {'processed': 0, 'created': 0, 'updated': 0, 'evidence_created': 0}
    for start in range(0, len(items), 500):
        result = _bootstrap_batch(items[start:start + 500], 'production')
        for key in total:
            total[key] += int(result[key])

    return {
        **total,
        'server_id': 'production',
        'source_url': base_url,
    }
