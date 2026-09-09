from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import DateTime, Float, Integer, JSON, String, Text, UniqueConstraint, create_engine, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from app.auth.database import normalize_database_url


router = APIRouter(prefix='/api/item-intelligence', tags=['item-intelligence'])
logger = logging.getLogger(__name__)


PASSPORT_SCHEMA: list[dict[str, Any]] = [
    {
        'key': 'identity', 'label': 'Основное',
        'fields': [
            ['aliases', 'Алиасы / другие названия', 'list'],
            ['mod_name', 'Название мода', 'text'],
            ['legacy_id', 'Legacy ID', 'text'],
            ['ore_dict', 'OreDict', 'list'],
            ['texture_path', 'Путь к текстуре', 'text'],
            ['item_variant', 'Вариант предмета', 'text'],
        ],
    },
    {
        'key': 'description', 'label': 'Описание и назначение',
        'fields': [
            ['short_description', 'Краткое описание', 'textarea'],
            ['full_description', 'Полное описание', 'textarea'],
            ['purpose', 'Назначение', 'textarea'],
            ['mechanics', 'Как работает', 'textarea'],
            ['special_properties', 'Особые свойства', 'textarea'],
            ['limitations', 'Ограничения', 'textarea'],
            ['warnings', 'Предупреждения', 'textarea'],
            ['lore', 'Лор / дополнительное описание', 'textarea'],
        ],
    },
    {
        'key': 'classification', 'label': 'Классификация',
        'fields': [
            ['item_type', 'Тип предмета', 'text'],
            ['category', 'Категория', 'text'],
            ['subcategory', 'Подкатегория', 'text'],
            ['material', 'Материал / семейство', 'text'],
            ['equipment_slot', 'Слот экипировки', 'text'],
            ['stackable', 'Стакаемый', 'text'],
            ['max_stack_size', 'Макс. стак', 'number'],
            ['durability', 'Прочность', 'number'],
            ['rarity', 'Редкость', 'text'],
            ['tags', 'Теги', 'list'],
        ],
    },
    {
        'key': 'progression', 'label': 'Tier и прогрессия',
        'fields': [
            ['tier', 'Tier', 'text'],
            ['progression_stage', 'Этап прогрессии', 'text'],
            ['unlock_requirements', 'Условия открытия', 'textarea'],
            ['prerequisite_items', 'Предметы-предшественники', 'list'],
            ['supersedes', 'Что заменяет', 'list'],
            ['superseded_by', 'Чем заменяется', 'list'],
            ['progression_value', 'Progression Value', 'number'],
        ],
    },
    {
        'key': 'crafting_usage', 'label': 'Крафты и использование',
        'fields': [
            ['recipe_input_count', 'Крафтов, где используется', 'number'],
            ['recipe_output_count', 'Крафтов получения', 'number'],
            ['usage_quantity_total', 'Суммарное количество в рецептах', 'number'],
            ['crafting_recipe_count', 'Обычных крафтов', 'number'],
            ['machine_recipe_count', 'Машинных рецептов', 'number'],
            ['downstream_item_count', 'Зависимых предметов', 'number'],
            ['usage_score', 'Usage Score', 'number'],
            ['usage_rank', 'Место по использованию', 'number'],
            ['used_in_recipes', 'Используется в', 'list'],
            ['produced_by_recipes', 'Получается из рецептов', 'list'],
        ],
    },
    {
        'key': 'acquisition', 'label': 'Получение',
        'fields': [
            ['acquisition_methods', 'Способы получения', 'list'],
            ['machines_sources', 'Механизмы / машины', 'list'],
            ['world_generation', 'Генерация в мире', 'textarea'],
            ['mobs_loot', 'Мобы / лут', 'list'],
            ['fishing', 'Рыбалка', 'textarea'],
            ['quests', 'Квесты / награды', 'list'],
            ['shops', 'Магазины / обмен', 'list'],
            ['dimensions', 'Измерения', 'list'],
            ['biomes', 'Биомы', 'list'],
            ['drop_chance', 'Шанс выпадения', 'text'],
            ['renewable', 'Возобновляемый', 'text'],
            ['acquisition_difficulty', 'Сложность получения', 'number'],
        ],
    },
    {
        'key': 'economy', 'label': 'Экономика и ценность',
        'fields': [
            ['current_price', 'Актуальная цена', 'number'],
            ['currency', 'Валюта', 'text'],
            ['price_min', 'Минимальная цена', 'number'],
            ['price_max', 'Максимальная цена', 'number'],
            ['price_avg', 'Средняя цена', 'number'],
            ['old_server_price', 'Старая серверная цена', 'number'],
            ['price_history_summary', 'История цены', 'textarea'],
            ['market_value', 'Market Value', 'number'],
            ['craft_value', 'Craft Value', 'number'],
            ['utility_value', 'Utility Value', 'number'],
            ['rarity_value', 'Rarity Value', 'number'],
            ['acquisition_cost', 'Acquisition Cost', 'number'],
            ['final_value_score', 'Final Value Score', 'number'],
            ['priceless_rank', 'Ранг бесценности', 'number'],
        ],
    },
    {
        'key': 'balance_config', 'label': 'Баланс и конфиги',
        'fields': [
            ['config_rules', 'Влияющие конфиги', 'textarea'],
            ['server_overrides', 'Изменения CubixWorld', 'textarea'],
            ['resource_yield', 'Выход ресурсов', 'textarea'],
            ['energy_cost', 'Энергозатраты', 'text'],
            ['time_cost', 'Время / скорость', 'text'],
            ['custom_balance_notes', 'Балансные примечания', 'textarea'],
            ['exploit_risk', 'Риск эксплойта', 'text'],
            ['imbalance_score', 'Imbalance Score', 'number'],
        ],
    },
    {
        'key': 'technical', 'label': 'Техническое',
        'fields': [
            ['unlocalized_name', 'Unlocalized name', 'text'],
            ['class_name', 'Java class', 'text'],
            ['mod_version', 'Версия мода', 'text'],
            ['minecraft_version', 'Версия Minecraft', 'text'],
            ['server_context', 'Сервер / сборка / версия', 'text'],
            ['damage_value', 'Damage value', 'number'],
            ['nbt_raw', 'NBT Raw', 'textarea'],
            ['technical_notes', 'Технические заметки', 'textarea'],
        ],
    },
    {
        'key': 'quality', 'label': 'Источники и качество данных',
        'fields': [
            ['source_count', 'Количество источников', 'number'],
            ['source_summary', 'Источники', 'textarea'],
            ['last_verified_at', 'Последняя проверка', 'text'],
            ['conflicts', 'Конфликты источников', 'textarea'],
            ['manual_review_reason', 'Причина ручной проверки', 'textarea'],
            ['data_revision', 'Ревизия данных', 'text'],
        ],
    },
    {
        'key': 'notes', 'label': 'Заметки',
        'fields': [
            ['admin_notes', 'Заметки администратора', 'textarea'],
            ['player_notes', 'Заметки игроков / сообщества', 'textarea'],
            ['research_todo', 'Что ещё исследовать', 'textarea'],
        ],
    },
]


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


class IntelligencePassport(IntelligenceBase):
    __tablename__ = 'intelligence_passports'
    __table_args__ = (UniqueConstraint('item_id', name='uq_intelligence_passport_item'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    data_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class IntelligenceSource(IntelligenceBase):
    __tablename__ = 'intelligence_sources'
    __table_args__ = (UniqueConstraint('source_type', 'canonical_ref', name='uq_intelligence_source_ref'),)

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
    __table_args__ = (UniqueConstraint('item_id', 'metric_key', 'context_key', name='uq_intelligence_metric_context'),)

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
_session_init_lock = threading.Lock()


def _session():
    global _session_factory, _configuration_error
    if _session_factory is not None:
        return _session_factory

    with _session_init_lock:
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
        except Exception:
            logger.exception('Failed to initialize Item Intelligence database')
            _configuration_error = 'Item Intelligence database initialization failed. Check backend logs.'
            return None

    return _session_factory


def _require_session():
    factory = _session()
    if factory is None:
        raise HTTPException(status_code=503, detail=_configuration_error or 'Item intelligence database unavailable')
    return factory


def _item_payload(record: IntelligenceItem) -> dict[str, Any]:
    return {
        'id': record.id, 'server_id': record.server_id, 'registry_key': record.registry_key,
        'meta': record.meta, 'nbt_hash': record.nbt_hash, 'raw': record.raw, 'mod_id': record.mod_id,
        'display_ru': record.display_ru, 'display_en': record.display_en, 'icon_url': record.icon_url,
        'description': record.description, 'category': record.category, 'tier': record.tier,
        'rarity': record.rarity, 'status': record.status, 'completion_percent': record.completion_percent,
        'confidence': record.confidence,
        'updated_at': record.updated_at.isoformat() if record.updated_at else None,
        'indexed_at': record.indexed_at.isoformat() if record.indexed_at else None,
    }


def _passport(session, item_id: int, create: bool = False) -> IntelligencePassport | None:
    record = session.query(IntelligencePassport).filter(IntelligencePassport.item_id == item_id).one_or_none()
    if record is None and create:
        record = IntelligencePassport(item_id=item_id, data_json={}, updated_at=utc_now())
        session.add(record)
        session.flush()
    return record


@router.get('/schema')
def item_intelligence_schema():
    return {'groups': PASSPORT_SCHEMA}


@router.get('/health')
def item_intelligence_health():
    factory = _session()
    return {'configured': bool(os.environ.get('ITEM_INTELLIGENCE_DATABASE_URL', '').strip()), 'connected': factory is not None, 'error': _configuration_error}


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
        return {'items_total': int(total), 'items_ready': int(ready), 'items_needs_review': int(review), 'sources_total': int(sources), 'evidence_total': int(evidence), 'mods_total': int(mods), 'average_completion': round(float(avg_completion), 1)}


@router.get('/items')
def item_intelligence_items(limit: int = 5000, offset: int = 0, server_id: str | None = None):
    factory = _require_session()
    safe_limit, safe_offset = max(1, min(limit, 10000)), max(0, offset)
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
        passport = _passport(session, item_id)
        payload = _item_payload(record)
        payload['passport'] = passport.data_json if passport else {}
        payload['evidence'] = [{'id': row.id, 'source_id': row.source_id, 'field_name': row.field_name, 'value': row.value_json, 'raw_excerpt': row.raw_excerpt, 'confidence': row.confidence, 'observed_at': row.observed_at.isoformat() if row.observed_at else None} for row in evidence]
        payload['metrics'] = [{'metric_key': row.metric_key, 'context_key': row.context_key, 'value_numeric': row.value_numeric, 'value_text': row.value_text, 'unit': row.unit, 'confidence': row.confidence, 'calculated_at': row.calculated_at.isoformat() if row.calculated_at else None} for row in metrics]
        return payload


@router.patch('/items/{item_id}')
def update_item_intelligence(item_id: int, payload: dict[str, Any]):
    factory = _require_session()
    with factory() as session:
        record = session.get(IntelligenceItem, item_id)
        if record is None:
            raise HTTPException(status_code=404, detail='Item intelligence record not found')

        top_fields = {'display_ru', 'display_en', 'description', 'category', 'tier', 'rarity', 'status', 'completion_percent', 'confidence', 'icon_url'}
        for key in top_fields:
            if key in payload:
                setattr(record, key, payload[key])

        if isinstance(payload.get('passport'), dict):
            passport = _passport(session, item_id, create=True)
            merged = dict(passport.data_json or {})
            for key, value in payload['passport'].items():
                merged[str(key)] = value
            passport.data_json = merged
            passport.updated_at = utc_now()

        record.updated_at = utc_now()
        session.commit()
        session.refresh(record)
        passport = _passport(session, item_id)
        result = _item_payload(record)
        result['passport'] = passport.data_json if passport else {}
        return result
