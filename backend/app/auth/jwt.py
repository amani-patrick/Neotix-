"""JWT creation and verification (stateless auth tokens).

Tokens are short-lived bearer tokens carrying the user id. The secret comes
from environment configuration (see app.config). Tokens are never logged.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from jwt.exceptions import InvalidTokenError

from app.config import get_settings


class InvalidToken(Exception):
    """Raised when a bearer token is malformed, expired, or forged."""


def create_access_token(user_id: uuid.UUID, role: str) -> str:
    """Issue a signed access token for an authenticated user."""
    settings = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
        # jti makes every token unique; useful later for revocation lists.
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(
        payload, settings.jwt_secret, algorithm=settings.jwt_algorithm
    )


def decode_access_token(token: str) -> dict[str, Any]:
    """Verify signature and expiry; return the claims or raise InvalidToken."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except InvalidTokenError as exc:  # covers expired, bad signature, etc.
        raise InvalidToken("invalid or expired token") from exc
    if "sub" not in payload:
        raise InvalidToken("token missing subject")
    return payload
