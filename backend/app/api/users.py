"""Admin user-management endpoints (kept intentionally small per spec)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.auth.dependencies import DbSession, require_admin
from app.auth.password import hash_password
from app.models import User, UserRole
from app.schemas.auth import UserPublic
from app.schemas.user import UserCreate, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])

_ADMIN_ONLY_NOTE = (
    "Only admins can manage users. Admins cannot deactivate or demote "
    "themselves, to avoid locking the last admin out."
)


@router.post(
    "",
    response_model=UserPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a user (admin only)",
)
def create_user(
    body: UserCreate, db: DbSession, admin: User = Depends(require_admin)
) -> User:
    if db.execute(
        select(User).where(User.email == body.email.lower())
    ).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        name=body.name,
        role=body.role,
        organization=body.organization,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get(
    "",
    response_model=list[UserPublic],
    summary="List users (admin only)",
)
def list_users(db: DbSession, admin: User = Depends(require_admin)) -> list[User]:
    return list(db.execute(select(User).order_by(User.created_at)).scalars())


@router.get(
    "/{user_id}",
    response_model=UserPublic,
    summary="Get one user (admin only)",
)
def get_user(
    user_id: uuid.UUID, db: DbSession, admin: User = Depends(require_admin)
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.patch(
    "/{user_id}",
    response_model=UserPublic,
    summary="Deactivate/reactivate a user or change their role (admin only)",
    description=_ADMIN_ONLY_NOTE,
)
def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    db: DbSession,
    admin: User = Depends(require_admin),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.id == admin.id and (
        body.is_active is False or (body.role is not None and body.role != UserRole.ADMIN)
    ):
        # Privilege-escalation guard is irrelevant here, but locking yourself
        # (or the only admin) out is an availability hazard we avoid.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot deactivate or demote themselves",
        )

    if body.is_active is not None:
        user.is_active = body.is_active
    if body.role is not None:
        user.role = body.role

    db.commit()
    db.refresh(user)
    return user
