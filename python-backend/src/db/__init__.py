"""
Database Connection and Session Management

Provides async database connection with SQLAlchemy for FastAPI.
Includes connection pooling, session dependency injection, and health checks.
"""

from typing import AsyncGenerator
from contextlib import asynccontextmanager
import logging

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)
from sqlalchemy.pool import NullPool, QueuePool
from sqlalchemy import text

from ..models.database import Base

logger = logging.getLogger(__name__)

# ============================================================================
# Database Engine
# ============================================================================

# Global engine and session maker (initialized at startup)
_engine = None
_async_session_maker = None


def init_database(database_url: str, pool_size: int = 5, max_overflow: int = 10) -> None:
    """
    Initialize the database engine and session maker.

    Called during application startup.

    Args:
        database_url: Async PostgreSQL connection string (postgresql+asyncpg://...)
        pool_size: Number of connections to maintain in the pool
        max_overflow: Maximum overflow connections beyond pool_size
    """
    global _engine, _async_session_maker

    if _engine is not None:
        logger.warning("Database already initialized, skipping")
        return

    # Configure engine with connection pooling
    engine_kwargs = {
        "echo": False,  # Set to True for SQL query logging
        "future": True,
    }

    # For async engines, use NullPool (no pooling) or special async pool
    # The asyncpg driver manages its own connection pool internally
    if "test" in database_url or "localhost" in database_url:
        # Development/test: no pooling (asyncpg manages connections)
        engine_kwargs["poolclass"] = NullPool
    else:
        # Production: let asyncpg manage pooling
        engine_kwargs["poolclass"] = NullPool

    _engine = create_async_engine(database_url, **engine_kwargs)
    _async_session_maker = async_sessionmaker(
        _engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )

    logger.info(f"Database initialized: {database_url.split('@')[1] if '@' in database_url else 'unknown'}")


async def close_database() -> None:
    """
    Close the database engine and dispose of connections.

    Called during application shutdown.
    """
    global _engine, _async_session_maker

    if _engine is None:
        return

    await _engine.dispose()
    _engine = None
    _async_session_maker = None
    logger.info("Database connections closed")


def get_engine():
    """
    Get the database engine.

    Returns:
        SQLAlchemy async engine

    Raises:
        RuntimeError: If database has not been initialized
    """
    if _engine is None:
        raise RuntimeError("Database not initialized. Call init_database() first.")
    return _engine


# ============================================================================
# Session Management
# ============================================================================

async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency injection for FastAPI routes.

    Provides a database session with automatic cleanup.

    Usage in FastAPI:
        @app.get("/projects/{id}")
        async def get_project(id: str, session: AsyncSession = Depends(get_async_session)):
            result = await session.execute(select(Project).where(Project.id == id))
            return result.scalar_one_or_none()

    Yields:
        AsyncSession: SQLAlchemy async session
    """
    if _async_session_maker is None:
        raise RuntimeError("Database not initialized. Call init_database() first.")

    async with _async_session_maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager for database sessions outside FastAPI routes.

    Useful for:
    - Background tasks
    - WebSocket handlers
    - Service layer functions

    Usage:
        async with get_db_context() as session:
            result = await session.execute(select(Project))
            projects = result.scalars().all()

    Yields:
        AsyncSession: SQLAlchemy async session
    """
    if _async_session_maker is None:
        raise RuntimeError("Database not initialized. Call init_database() first.")

    async with _async_session_maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


# ============================================================================
# Database Health Check
# ============================================================================

async def check_database_health() -> dict:
    """
    Check database connection health.

    Returns:
        Dict with health status:
        {
            "status": "healthy" | "unhealthy",
            "message": str,
            "latency_ms": float
        }
    """
    import time

    if _engine is None:
        return {
            "status": "unhealthy",
            "message": "Database not initialized"
        }

    try:
        start = time.time()
        async with get_db_context() as session:
            # Simple query to check connection
            await session.execute(text("SELECT 1"))
        latency_ms = (time.time() - start) * 1000

        return {
            "status": "healthy",
            "message": "Database connection OK",
            "latency_ms": round(latency_ms, 2)
        }
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {
            "status": "unhealthy",
            "message": str(e)
        }


# ============================================================================
# Table Creation (for development/testing)
# ============================================================================

async def create_tables() -> None:
    """
    Create all database tables.

    WARNING: This uses SQLAlchemy's create_all() which is NOT
    recommended for production. Use Alembic migrations instead.

    Only use for:
    - Local development setup
    - Testing environments
    """
    if _engine is None:
        raise RuntimeError("Database not initialized. Call init_database() first.")

    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    logger.info("Database tables created")


async def drop_tables() -> None:
    """
    Drop all database tables.

    WARNING: This will DELETE ALL DATA. Only use for testing.
    """
    if _engine is None:
        raise RuntimeError("Database not initialized. Call init_database() first.")

    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    logger.warning("All database tables dropped")


# ============================================================================
# Transaction Helper
# ============================================================================

@asynccontextmanager
async def transaction(session: AsyncSession):
    """
    Context manager for transactions with automatic rollback on error.

    Usage:
        async with get_db_context() as session:
            async with transaction(session):
                # Database operations here
                session.add(Project(...))

    Args:
        session: The async session to use for the transaction
    """
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
