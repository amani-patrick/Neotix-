"""Password hashing (Argon2id).

Passwords are never stored in plaintext and never logged. Verification is
constant-time over the encoded hash via passlib.
"""

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Return an Argon2id hash for a plaintext password."""
    return pwd_context.hash(plain)


def verify_password(plain: str, password_hash: str) -> bool:
    """Constant-time check of a plaintext password against its stored hash."""
    try:
        return pwd_context.verify(plain, password_hash)
    except ValueError:
        # Malformed hash in the DB (e.g. seeded wrongly) -> treat as no match.
        return False
