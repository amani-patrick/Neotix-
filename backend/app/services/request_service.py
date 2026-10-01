"""Request workflow: state machine, role rules, delivery rule, audit trail.

All rules live here (never duplicated in route handlers):
  - the transition map (which statuses may follow which)
  - who may perform which transition (by target status)
  - the delivery rule (enough episodes assigned before `delivered`)
Status update + history row are written in one transaction (succeed or fail
together).
"""

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    ALLOWED_TRANSITIONS,
    Assignment,
    Request,
    RequestStatus,
    RequestStatusHistory,
    User,
    UserRole,
)

# Role ownership of each *target* status. Operators own the fulfilment
# workflow; clients own accept/reject of their own delivered request.
# An operator must never accept on behalf of a client.
TRANSITION_ROLES: dict[RequestStatus, set[UserRole]] = {
    RequestStatus.IN_PROGRESS: {UserRole.OPERATOR, UserRole.ADMIN},
    RequestStatus.DELIVERED: {UserRole.OPERATOR, UserRole.ADMIN},
    RequestStatus.ACCEPTED: {UserRole.CLIENT},
    RequestStatus.REJECTED: {UserRole.CLIENT},
}

# Requests accept new episode assignments only while open for fulfilment.
ASSIGNABLE_STATUSES = {RequestStatus.SUBMITTED, RequestStatus.IN_PROGRESS}


def assigned_episode_count(db: Session, request_id) -> int:
    """Count assignments straight from the database - never trust a client."""
    return int(
        db.execute(
            select(func.count()).where(Assignment.request_id == request_id)
        ).scalar_one()
    )


def validate_transition(
    request: Request,
    target: RequestStatus,
    user: User,
) -> None:
    """Raise HTTPException unless the transition is legal for this user.

    Checks the state machine map and the role that owns the target status.
    (The delivery rule needs a DB count, so it lives in transition_request.)
    """
    current = request.status
    if target not in ALLOWED_TRANSITIONS.get(current, set()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status transition: {current.value} -> {target.value}",
        )
    if user.role not in TRANSITION_ROLES.get(target, set()):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this transition",
        )


def transition_request(
    db: Session,
    request: Request,
    target: RequestStatus,
    user: User,
    reason: str | None = None,
) -> Request:
    """Apply one transition and write its audit row, transactionally."""
    current = request.status

    validate_transition(request, target, user)

    # Delivery rule: the count MUST come from the database.
    if current is RequestStatus.IN_PROGRESS and target is RequestStatus.DELIVERED:
        count = assigned_episode_count(db, request.id)
        if count < request.episodes_requested:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot deliver request: {count} of "
                    f"{request.episodes_requested} required episodes are assigned."
                ),
            )

    history = RequestStatusHistory(
        request_id=request.id,
        from_status=current,
        to_status=target,
        changed_by=user.id,
        reason=reason,
    )
    request.status = target
    db.add(history)
    db.commit()
    db.refresh(request)
    return request
