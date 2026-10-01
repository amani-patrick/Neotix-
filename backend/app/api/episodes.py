"""Episode endpoints: filterable, paginated listing (never the whole table).

Also exposes the CSV import as an operator-only API endpoint (a CLI is also
provided via `python -m app.cli import-episodes`).
"""

import math

from fastapi import APIRouter, Depends, HTTPException, UploadFile, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.dependencies import DbSession, require_operator
from app.db.session import SessionLocal
from app.models import Episode, EpisodeQuality
from app.schemas.episode import EpisodeOut, EpisodePage, ImportReport
from app.services.import_service import import_episode_rows

router = APIRouter(prefix="/episodes", tags=["episodes"])

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100


@router.get(
    "",
    response_model=EpisodePage,
    summary="List episodes with filtering and pagination (operator/admin only)",
)
def list_episodes(
    db: DbSession,
    user=Depends(require_operator),
    task_name: str | None = Query(default=None, description="Case-insensitive substring"),
    quality: EpisodeQuality | None = Query(default=None),
    robot_id: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> EpisodePage:
    stmt = select(Episode)
    if task_name:
        stmt = stmt.where(Episode.task_name.ilike(f"%{task_name}%"))
    if quality:
        stmt = stmt.where(Episode.quality == quality)
    if robot_id:
        stmt = stmt.where(Episode.robot_id == robot_id)

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    pages = max(1, math.ceil(total / page_size))
    items = db.execute(
        stmt.order_by(Episode.recorded_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars()

    return EpisodePage(
        items=[EpisodeOut.model_validate(e) for e in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.post(
    "/import",
    response_model=ImportReport,
    summary="Import episodes from a CSV upload (operator/admin only)",
    description=(
        "Idempotent: repeated imports of the same file never create "
        "duplicates. Unknown robots and invalid rows are skipped and "
        "reported with reasons." 
    ),
)
def import_episodes_csv_endpoint(
    file: UploadFile,
    user=Depends(require_operator),
) -> ImportReport:
    import csv

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="Upload a .csv file")
    try:
        text = file.file.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=422, detail="File must be UTF-8 encoded") from None
    reader = csv.DictReader(text.splitlines())
    db = SessionLocal()
    try:
        return import_episode_rows(db, list(reader))
    finally:
        db.close()
