"""Analytics endpoint (operator/admin only)."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.dependencies import DbSession, require_operator
from app.services.analytics_service import AnalyticsResponse, compute_analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get(
    "",
    response_model=AnalyticsResponse,
    summary="Analytics for a date range (operator/admin only)",
    description=(
        "Range semantics: [from, to) - inclusive start, exclusive end, UTC. "
        "All aggregation happens in PostgreSQL."
    ),
)
def get_analytics(
    db: DbSession,
    user=Depends(require_operator),
    from_date: datetime = Query(alias="from"),
    to_date: datetime = Query(alias="to"),
) -> AnalyticsResponse:
    if to_date <= from_date:
        raise HTTPException(status_code=422, detail="'to' must be after 'from'")
    return compute_analytics(db, from_date, to_date)
