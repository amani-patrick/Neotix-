"""Shared fixtures for the API test suite.

Environment variables are set *before* any app import so the engine and
settings bind to the isolated test database. The schema is created once per
session via Alembic (never create_all), and tables are truncated between
tests for isolation.
"""

import os

# Must happen before importing anything from `app`.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://desk:desk@localhost:5439/desk_test",
)
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("LOG_LEVEL", "WARNING")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db.session import SessionLocal, engine
from app.main import app

_TEST_DB = "desk_test"
_ADMIN_DB_URL = "postgresql+psycopg://desk:desk@localhost:5439/postgres"


def _ensure_test_db() -> None:
    """Create the test database if it does not exist yet."""
    from sqlalchemy import create_engine

    admin_engine = create_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    try:
        with admin_engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :d"),
                {"d": _TEST_DB},
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{_TEST_DB}"'))
    finally:
        admin_engine.dispose()


def _truncate_all() -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                TRUNCATE TABLE request_status_history, assignments,
                               requests, episodes, users
                RESTART IDENTITY CASCADE
                """
            )
        )


@pytest.fixture(scope="session", autouse=True)
def _database():
    """Create schema once per test session (via Alembic), drop at the end."""
    _ensure_test_db()
    from alembic import command
    from alembic.config import Config

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
    command.upgrade(cfg, "head")
    yield
    command.downgrade(cfg, "base")


@pytest.fixture(autouse=True)
def _clean_tables():
    """Truncate everything, then restore the standard seed users."""
    from app.seed import seed_users

    _truncate_all()
    seed_users("seed/users.json")
    yield
    _truncate_all()


@pytest.fixture
def client():
    """TestClient with dependency overrides cleared per test."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
