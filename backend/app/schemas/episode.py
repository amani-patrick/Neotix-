"""Pydantic schemas for episodes and the CSV import report."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import EpisodeQuality


class EpisodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    episode_id: str
    robot_id: str
    task_name: str
    recorded_at: datetime
    duration_seconds: int
    operator_name: str
    quality: EpisodeQuality


class EpisodePage(BaseModel):
    items: list[EpisodeOut]
    total: int
    page: int
    page_size: int
    pages: int


class ImportCounts(BaseModel):
    imported: int = 0
    duplicate: int = 0
    invalid: int = 0


class ImportReport(BaseModel):
    """Clear accounting of what the import did, per spec section 13."""

    total_rows: int
    imported: int
    duplicate: int
    invalid: int
    reasons: dict[str, int] = Field(default_factory=dict)
    examples: dict[str, list[str]] = Field(default_factory=dict)
