import os
import logging
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

logger = logging.getLogger(__name__)

_raw_url = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./ocpp16.db")

# Render/Railway provide postgres:// or postgresql:// — convert to asyncpg driver
if _raw_url.startswith("postgres://"):
    DATABASE_URL = _raw_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif _raw_url.startswith("postgresql://") and "+asyncpg" not in _raw_url:
    DATABASE_URL = _raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)
else:
    DATABASE_URL = _raw_url

if "sqlite" in DATABASE_URL:
    db_file = DATABASE_URL.split(":///")[-1]
    if db_file and os.path.dirname(db_file):
        os.makedirs(os.path.dirname(db_file), exist_ok=True)

_connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}

engine = create_async_engine(DATABASE_URL, echo=False, connect_args=_connect_args)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def _add_missing_columns(conn) -> None:
    from sqlalchemy import text
    is_sqlite = "sqlite" in DATABASE_URL

    cols_to_add = [
        ("chargers", "autocharge_enabled", "BOOLEAN NOT NULL DEFAULT 0" if is_sqlite else "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("charging_profiles", "recurrency_kind", "VARCHAR(16)"),
        ("charging_profiles", "charging_rate_unit", "VARCHAR(8) DEFAULT 'A'"),
        ("charging_profiles", "min_charging_rate", "FLOAT"),
        ("charging_profiles", "valid_from", "TIMESTAMP" if not is_sqlite else "DATETIME"),
        ("charging_profiles", "valid_to", "TIMESTAMP" if not is_sqlite else "DATETIME"),
        ("charging_profiles", "duration", "INTEGER"),
        ("charging_profiles", "start_schedule", "TIMESTAMP" if not is_sqlite else "DATETIME"),
        ("charging_profiles", "periods_json", "TEXT"),
        ("charging_profiles", "schedule_json", "TEXT"),
        ("charging_profiles", "name", "VARCHAR(128)"),
        ("charging_profiles", "label", "VARCHAR(128)"),
        ("charging_profiles", "active", "BOOLEAN DEFAULT 1" if is_sqlite else "BOOLEAN DEFAULT TRUE"),
        ("charging_profiles", "is_deployed", "BOOLEAN DEFAULT 0" if is_sqlite else "BOOLEAN DEFAULT FALSE"),
    ]

    for table, column, col_type in cols_to_add:
        try:
            if is_sqlite:
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            else:
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}"))
        except Exception:
            pass  # column already exists or table not yet created


async def _seed_default_tags(session: AsyncSession) -> None:
    from models.authorized_tag import AuthorizedTag
    from sqlalchemy import select
    try:
        result = await session.execute(select(AuthorizedTag))
        if not result.scalars().first():
            defaults = [
                AuthorizedTag(id_tag="VERSICHARGE_TAG", description="Tag Padrão Siemens VersiCharge", is_active=True),
                AuthorizedTag(id_tag="ADMIN_TAG", description="Tag Administrador", is_active=True),
                AuthorizedTag(id_tag="MASTER_RFID", description="Tag Mestre RFID", is_active=True),
            ]
            session.add_all(defaults)
            await session.commit()
    except Exception as e:
        logger.warning(f"Error seeding default tags: {e}")


async def init_db():
    from models import charger, transaction, configuration, auth_token, authorized_tag, charging_profile  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _add_missing_columns(conn)

    async with AsyncSessionLocal() as session:
        await _seed_default_tags(session)
