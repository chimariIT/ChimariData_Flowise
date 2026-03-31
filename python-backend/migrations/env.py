"""
Alembic Environment Configuration

Configures the migration environment for Chimaridata Python Backend.
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config, create_async_engine
from sqlalchemy.orm import sessionmaker

from alembic import context

# Import database models
from src.models.database import Base

# Import settings
import os
from dotenv import load_dotenv

load_dotenv()

# Database URL from environment
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/chimaridata"
)

# this is the Alembic Config object
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here for 'autogenerate' support
target_metadata = Base.metadata

# Set up SQLAlchemy async engine
engine = None
async_engine = None


def get_engine():
    """Get sync or async engine based on context"""
    global engine, async_engine

    if context.is_offline_mode():
        return engine

    if async_engine is None:
        # Use environment variable directly instead of alembic.ini
        database_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/chimaridata")

        async_engine = create_async_engine(
            database_url,
            poolclass=pool.NullPool,
        )

    return async_engine


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/chimaridata")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    # Configure connection
    context.configure(connection=connection, target_metadata=target_metadata)

    try:
        with context.begin_transaction():
            context.run_migrations()
    finally:
        connection.close()


async def run_async_migrations() -> None:
    """Run migrations in 'online' mode with async engine."""
    connectable = get_engine()

    # For async migrations, we use a custom run_migrations function
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations, connection)


async def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    await run_async_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
