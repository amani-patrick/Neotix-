"""Authentication endpoints."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.auth.dependencies import CurrentUser, DbSession
from app.auth.jwt import create_access_token
from app.auth.password import verify_password
from app.models import User
from app.schemas.auth import LoginRequest, TokenResponse, UserPublic

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Log in with email and password, receive a bearer token",
)
def login(body: LoginRequest, db: DbSession) -> TokenResponse:
    """Verify credentials and issue a JWT.

    Returns the same generic 401 for unknown email, wrong password, and
    deactivated accounts, to avoid leaking which emails exist.
    """
    user = db.execute(
        select(User).where(User.email == body.email.lower())
    ).scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    token = create_access_token(user_id=user.id, role=user.role.value)
    return TokenResponse(access_token=token, user=UserPublic.model_validate(user))


@router.get(
    "/me",
    response_model=UserPublic,
    summary="Return the currently authenticated user",
)
def me(user: CurrentUser) -> UserPublic:
    """Handy smoke-test endpoint for the auth flow; requires an active user."""
    return UserPublic.model_validate(user)
