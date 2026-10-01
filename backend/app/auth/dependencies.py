"""FastAPI dependencies enforcing authentication and role-based authorization.

Authorization is enforced server-side on every protected endpoint:
  1. validate credentials (Bearer JWT)
  2. identify the current user
  3. ensure the user is active
  4. check the required role
Ownership checks (e.g. client A vs client B) happen in the routers/services
because they depend on the resource being accessed.
"""

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.jwt import InvalidToken, decode_access_token
from app.db.session import get_db
from app.models import User, UserRole

# auto_error=False so we can distinguish "no credentials" (401) from
# "bad credentials" (also 401) without leaking detail differences.
bearer_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)]


def get_current_user(
    request: Request, credentials: Credentials, db: DbSession
) -> User:
    """Resolve the authenticated, active user from the Bearer token."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(credentials.credentials)
    except InvalidToken:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.get(User, uuid.UUID(str(user_id)))
    if user is None:
        # Token valid but user deleted -> force re-authentication.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        # Authenticated but deactivated -> reject protected access (403).
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    # Stash on request.state so logging middleware can report user_id
    # without ever touching the token itself.
    request.state.user_id = str(user.id)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*allowed: UserRole):
    """Dependency factory: allow only users whose role is in `allowed`."""

    def _checker(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user

    return _checker


# Role-guarded dependencies used across routers.
require_client = require_roles(UserRole.CLIENT)
require_operator = require_roles(UserRole.OPERATOR, UserRole.ADMIN)
require_admin = require_roles(UserRole.ADMIN)
