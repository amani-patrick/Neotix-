from datetime import UTC, datetime

import structlog
from fastapi import FastAPI
from sqlalchemy import text

from app.config import get_settings
from app.db.session import engine
from app.logging_config import configure_logging

logger = structlog.get_logger(__name__)


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=(
            "Backend for the Dataset Request Desk: episode metadata, client "
            "requests, assignment workflow, import and analytics."
        ),
    )

    @app.get("/health", tags=["health"])
    def health() -> dict:
        """Liveness + database connectivity probe (used by Docker health checks)."""
        db_ok = False
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_ok = True
        except Exception:
            logger.warning("health_check_db_unreachable", exc_info=True)

        status = "ok" if db_ok else "degraded"
        return {
            "status": status,
            "database": db_ok,
            "time": datetime.now(UTC).isoformat(),
        }

    return app


app = create_app()
