"""Assignment business rules.

Invariants (enforced by DB constraints as the last line of defense):
  - an episode is assigned to at most one request at a time
    (unique constraint on assignments.episode_id) - this makes the
    concurrent double-assignment race safe
  - only `good`/`usable` episodes may be assigned
  - requests accept assignments only while open (submitted/in_progress)
"""

from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import (
    Assignment,
    Episode,
    EpisodeQuality,
    Request,
    User,
)
from app.services.request_service import ASSIGNABLE_STATUSES

# Re-exported for the router module; documents the race strategy in one place.
ASSIGNMENT_RACE_HINT = "unique constraint on assignments.episode_id"


def assign_episode(db: Session, request: Request, episode: Episode, user: User) -> Assignment:
    """Create one assignment after validating business rules.

    The unique constraint on assignments.episode_id is the real guarantee:
    if a concurrent request slips past the pre-checks, the INSERT fails and
    we surface a clean 409 instead of a 500.
    """
    if request.status not in ASSIGNABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Request is not in an assignable state "
                f"(current status: {request.status.value})"
            ),
        )
    if episode.quality is EpisodeQuality.BAD:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Episodes with quality 'bad' cannot be assigned",
        )

    assignment = Assignment(
        request_id=request.id,
        episode_id=episode.id,
        assigned_by=user.id,
    )
    db.add(assignment)
    try:
        db.commit()
    except IntegrityError:
        # Race lost: another transaction assigned this episode first.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Episode is already assigned to a request",
        ) from None
    db.refresh(assignment)
    return assignment
