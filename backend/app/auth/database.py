from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

try:
    from sqlalchemy import Boolean, DateTime, Integer, String, Text, UniqueConstraint, create_engine
    from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
except Exception:  # pragma: no cover - lets local tools import the app before deps are installed.
    Boolean = DateTime = Integer = String = Text = UniqueConstraint = create_engine = None  # type: ignore[assignment]
    DeclarativeBase = object  # type: ignore[assignment,misc]
    Mapped = Any  # type: ignore[assignment]
    Session = Any  # type: ignore[assignment]
    mapped_column = sessionmaker = None  # type: ignore[assignment]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_database_url(database_url: str) -> str:
    value = database_url.strip()
    if value.startswith('postgres://'):
        return f'postgresql+psycopg://{value[len("postgres://"):]}'
    if value.startswith('postgresql://') and '+psycopg' not in value:
        return f'postgresql+psycopg://{value[len("postgresql://"):]}'
    return value


if create_engine is not None:
    class Base(DeclarativeBase):  # type: ignore[misc,no-redef]
        pass


    class UserRecord(Base):  # type: ignore[misc,valid-type]
        __tablename__ = 'users'
        __table_args__ = (
            UniqueConstraint('google_sub', name='uq_users_google_sub'),
            UniqueConstraint('email', name='uq_users_email'),
        )

        id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)  # type: ignore[misc,operator]
        google_sub: Mapped[str] = mapped_column(String(255), nullable=False, index=True)  # type: ignore[misc,operator]
        email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)  # type: ignore[misc,operator]
        name: Mapped[str | None] = mapped_column(String(255), nullable=True)  # type: ignore[misc,operator]
        avatar_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)  # type: ignore[misc,operator]
        role: Mapped[str] = mapped_column(String(32), nullable=False, default='default')  # type: ignore[misc,operator]
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)  # type: ignore[misc,operator]
        last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # type: ignore[misc,operator]


    class CustomItemRecord(Base):  # type: ignore[misc,valid-type]
        __tablename__ = 'custom_items'
        __table_args__ = (
            UniqueConstraint('owner_email', 'item_raw', name='uq_custom_items_owner_raw'),
        )

        id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)  # type: ignore[misc,operator]
        owner_email: Mapped[str | None] = mapped_column(String(320), nullable=True, index=True)  # type: ignore[misc,operator]
        created_by_email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)  # type: ignore[misc,operator]
        source_raw: Mapped[str] = mapped_column(String(1024), nullable=False)  # type: ignore[misc,operator]
        item_raw: Mapped[str] = mapped_column(String(1024), nullable=False, index=True)  # type: ignore[misc,operator]
        display_name: Mapped[str] = mapped_column(String(255), nullable=False)  # type: ignore[misc,operator]
        nbt_raw: Mapped[str | None] = mapped_column(Text, nullable=True)  # type: ignore[misc,operator]
        is_global: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # type: ignore[misc,operator]
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)  # type: ignore[misc,operator]
        updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)  # type: ignore[misc,operator]
else:
    class Base:  # type: ignore[no-redef]
        metadata = None


    class UserRecord:  # type: ignore[no-redef]
        pass


    class CustomItemRecord:  # type: ignore[no-redef]
        pass


def build_session_factory(database_url: str):
    if create_engine is None or sessionmaker is None:
        raise RuntimeError('SQLAlchemy is not installed')
    engine = create_engine(normalize_database_url(database_url), pool_pre_ping=True)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
