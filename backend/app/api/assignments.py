"""Assignment endpoints under /requests/{request_id}/..."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.auth.dependencies import DbSession, require_operator
from app.models import Episode, EpisodeQuality, Request, User, UserRole
from app.schemas.request import AssignmentOut
from app.services.assignment_service import assign_episode

router = APIRouter(prefix="/requests", tags=["assignments"])


class AssignmentCreate(BaseModel):
    episode_id: str  # business id, e.g. "EP-00011"


@router.get(
    "/{request_id}/episodes",
    response_model=list[AssignmentOut],
    summary="List episodes assigned to a request",
)
def list_assigned_episodes(
    request_id: uuid.UUID, db: DbSession, user: User = Depends(require_operator)
) -> list[AssignmentOut]:
    from app.models import Assignment

    request = db.get(Request, request_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    rows = db.execute(
        select(Assignment)
        .where(Assignment.request_id == request_id)
        .order_by(Assignment.assigned_at)
        .options(joinedload(Assignment.episode))
    ).scalars()
    return [AssignmentOut.model_validate(a) for a in rows]


@router.post(
    "/{request_id}/assignments",
    response_model=AssignmentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Assign an episode to a request (operator/admin only)",
    description=(
        "Rules: request must be open (submitted/in_progress), episode quality "
        "must be good/usable, and an episode can only ever be assigned to one "
        "request (DB unique constraint makes the concurrent race safe)."
    ),
)
def assign(
    request_id: uuid.UUID,
    body: AssignmentCreate,
    db: DbSession,
    user: User = Depends(require_operator),
) -> AssignmentOut:
    request = db.get(Request, request_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

    episode = db.execute(
        select(Episode).where(Episode.episode_id == body.episode_id)
    ).scalar_one_or_none()
    if episode is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Episode not found"
        )

    assignment = assign_episode(db, request, episode, user)
    db.refresh(assignment)
    out = AssignmentOut.model_validate(assignment)
    # Return with the embedded episode (business id, robot, quality) so the
    # UI can render the assignment without a second fetch.
    out.episode = {
        "episode_id": episode.episode_id,
        "robot_id": episode.robot_id,
        "task_name": episode.task_name,
        "quality": episode.quality.value,
    }
    return out
