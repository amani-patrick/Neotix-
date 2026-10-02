"""Assignment business rules.

Invariants (enforced by DB constraints as the last line of defense):
  - an episode is assigned to at most one request at a time
    (unique constraint on assignments.episode_id) - this makes the
    concurrent double-assignment race safe
  - only `good`/`usable` episodes may be assigned
  - requests accept assignments only while open (submitted/in_progress)
  - a request never holds more episodes than it asked for (capacity guard
    below; the DB unique constraint alone would happily allow over-assign)
"""

from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import (
    Assignment,
    Episode,
    EpisodeQuality,
    Request,
    RequestStatusHistory,
    User,
)
from app.services.request_service import ASSIGNABLE_STATUSES

# Re-exported for the router module; documents the race strategy in one place.
ASSIGNMENT_RACE_HINT = "unique constraint on assignments.episode_id"


def _capacity_error(request: Request, count: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=(
            f"Request already has the required number of episodes assigned "
            f"({count} of {request.episodes_requested}). Unassign one first "
            f"if you need to replace an episode."
        ),
    )


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

    # Capacity guard: never assign beyond episodes_requested. Count from the
    # DB, not from any loaded collection, so concurrent operators are safe.
    from sqlalchemy import func, select

    count = int(
        db.execute(
            select(func.count()).where(Assignment.request_id == request.id)
        ).scalar_one()
    )
    if count >= request.episodes_requested:
        raise _capacity_error(request, count)

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


def unassign_episode(
    db: Session, request: Request, assignment: Assignment, user: User
) -> None:
    """Remove one assignment, freeing the episode for (re)assignment.

    Allowed while the request is open (submitted/in_progress) - the same
    window in which assigning is allowed. Rejected requests stay untouched
    until an operator resumes work. Every removal is written to the audit
    trail with the actor and an optional reason.
    """
    if request.status not in ASSIGNABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Request is not in an assignable state "
                f"(current status: {request.status.value})"
            ),
        )

    episode = assignment.episode
    episode_label = episode.episode_id if episode is not None else str(assignment.episode_id)
    db.delete(assignment)
    db.add(
        RequestStatusHistory(
            request_id=request.id,
            from_status=request.status,
            to_status=request.status,
            changed_by=user.id,
            reason=f"Episode {episode_label} unassigned",
        )
    )
    db.commit()
