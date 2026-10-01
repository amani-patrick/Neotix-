"""Request endpoints: create, list, detail, transition.

Ownership rules enforced here:
  - clients see and transition only their own requests (404, not 403, on
    someone else's, to avoid leaking that the id exists)
  - operators/admins see all and own the fulfilment transitions
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.auth.dependencies import CurrentUser, DbSession
from app.models import (
    Assignment,
    Request,
    RequestStatus,
    RequestStatusHistory,
    User,
    UserRole,
)
from app.schemas.request import (
    AssignmentOut,
    RequestCreate,
    RequestDetail,
    RequestOut,
    StatusHistoryOut,
    TransitionRequest,
)
from app.services import request_service

router = APIRouter(prefix="/requests", tags=["requests"])


def get_request_or_404(db: Session, request_id: uuid.UUID) -> Request:
    request = db.get(Request, request_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    return request


def _scoped_request(
    db: Session, request_id: uuid.UUID, user: User, *, for_update: bool = False
) -> Request:
    """Load a request the user is allowed to see, or raise 404."""
    request = get_request_or_404(db, request_id)
    if user.role is UserRole.CLIENT and request.client_id != user.id:
        # Deliberately 404: do not leak other clients' request ids.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    return request


def _detail(db: Session, request: Request) -> RequestDetail:
    """Build the detail view: base fields + DB-computed count + audit trail."""
    data = RequestOut.model_validate(request).model_dump()
    data["assigned_episode_count"] = request_service.assigned_episode_count(db, request.id)
    data["assignments"] = [
        AssignmentOut.model_validate(a)
        for a in db.execute(
            select(Assignment)
            .where(Assignment.request_id == request.id)
            .order_by(Assignment.assigned_at)
        ).scalars()
    ]
    data["status_history"] = [
        StatusHistoryOut.model_validate(h)
        for h in db.execute(
            select(RequestStatusHistory)
            .where(RequestStatusHistory.request_id == request.id)
            .order_by(RequestStatusHistory.changed_at)
        ).scalars()
    ]
    return RequestDetail(**data)


@router.post(
    "",
    response_model=RequestOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a request (clients only; always owned by the caller)",
)
def create_request(body: RequestCreate, db: DbSession, user: CurrentUser) -> Request:
    if user.role is not UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clients can create requests",
        )
    request = Request(
        client_id=user.id,
        task_name=body.task_name,
        episodes_requested=body.episodes_requested,
        deadline=body.deadline,
        notes=body.notes,
        status=RequestStatus.SUBMITTED,
    )
    db.add(request)
    # Record the creation as the first history entry: this is the
    # `submitted_at` timestamp used by the submitted->delivered median.
    db.add(
        RequestStatusHistory(
            request=request,
            from_status=None,
            to_status=RequestStatus.SUBMITTED,
            changed_by=user.id,
        )
    )
    db.commit()
    db.refresh(request)
    return request


@router.get(
    "",
    response_model=list[RequestOut],
    summary="List requests (clients see only their own; operators/admins see all)",
)
def list_requests(db: DbSession, user: CurrentUser) -> list[Request]:
    stmt = select(Request).order_by(Request.created_at.desc())
    if user.role is UserRole.CLIENT:
        stmt = stmt.where(Request.client_id == user.id)
    return list(db.execute(stmt).scalars())


@router.get(
    "/{request_id}",
    response_model=RequestDetail,
    summary="Request detail with assignments and status history",
)
def get_request(request_id: uuid.UUID, db: DbSession, user: CurrentUser) -> RequestDetail:
    request = _scoped_request(db, request_id, user)
    return _detail(db, request)


@router.post(
    "/{request_id}/transition",
    response_model=RequestDetail,
    summary="Move a request through its workflow",
    description=(
        "Operators: submitted->in_progress, in_progress->delivered (delivery "
        "rule enforced), rejected->in_progress. Clients: accept/reject their "
        "own delivered request only. Every change is recorded in status history."
    ),
)
def transition_request(
    request_id: uuid.UUID,
    body: TransitionRequest,
    db: DbSession,
    user: CurrentUser,
) -> RequestDetail:
    request = _scoped_request(db, request_id, user, for_update=True)
    request_service.transition_request(db, request, body.status, user, reason=body.reason)
    return _detail(db, request)
