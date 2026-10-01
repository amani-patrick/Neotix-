"""Pydantic schemas for dataset requests."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import RequestStatus


class RequestCreate(BaseModel):
    task_name: str = Field(min_length=1, max_length=255)
    episodes_requested: int = Field(gt=0, le=1_000_000)
    deadline: datetime
    notes: str | None = Field(default=None, max_length=5000)


class TransitionRequest(BaseModel):
    """Body for POST /requests/{id}/transition."""

    status: RequestStatus
    reason: str | None = Field(default=None, max_length=500)


class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    episode_id: uuid.UUID
    assigned_by: uuid.UUID
    assigned_at: datetime


class StatusHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    from_status: RequestStatus | None
    to_status: RequestStatus
    changed_by: uuid.UUID
    changed_at: datetime
    reason: str | None


class RequestOut(BaseModel):
    """List view."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    client_id: uuid.UUID
    task_name: str
    episodes_requested: int
    deadline: datetime
    notes: str | None
    status: RequestStatus
    created_at: datetime
    updated_at: datetime


class RequestDetail(RequestOut):
    """Detail view: includes assigned episodes and the audit trail."""

    assigned_episode_count: int
    assignments: list[AssignmentOut] = []
    status_history: list[StatusHistoryOut] = []
