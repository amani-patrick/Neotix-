"""Idempotent seed user creation from a users.json file.

Safe to run repeatedly: existing emails are left untouched (their password
hash and role are NOT overwritten), missing users are created with hashed
passwords. Only password hashes are ever stored.

Usage:
    python -m app.seed seed/users.json
"""

import argparse
import json
import sys
from pathlib import Path

from app.auth.password import hash_password
from app.db.session import SessionLocal
from app.models import User, UserRole

# Map JSON seed keys ("organisation" / "organization") to the model field.
_ORG_KEYS = ("organization", "organisation")

_ROLE_BY_VALUE = {r.value: r for r in UserRole}


def seed_users(path: str | Path, db=None) -> dict[str, int]:
    """Create missing users from a seed JSON file; return counts."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    owns_db = db is None
    db = db or SessionLocal()
    created = skipped = 0
    try:
        for entry in data:
            role_value = str(entry.get("role", "")).lower()
            role = _ROLE_BY_VALUE.get(role_value)
            if role is None:
                print(f"skip {entry.get('email')!r}: unknown role {role_value!r}", file=sys.stderr)
                skipped += 1
                continue

            email = str(entry["email"]).lower()
            existing = db.query(User).filter(User.email == email).one_or_none()
            if existing is not None:
                skipped += 1
                continue

            organization = next(
                (entry[k] for k in _ORG_KEYS if entry.get(k)), None
            )
            db.add(
                User(
                    email=email,
                    password_hash=hash_password(str(entry["password"])),
                    name=str(entry["name"]),
                    role=role,
                    organization=organization,
                    is_active=True,
                )
            )
            created += 1
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        if owns_db:
            db.close()
    return {"created": created, "skipped": skipped}


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed users (idempotently)")
    parser.add_argument(
        "seed_file", nargs="?", default="seed/users.json",
        help="Path to users.json (default: seed/users.json)",
    )
    args = parser.parse_args()
    counts = seed_users(args.seed_file)
    print(f"Seed users complete: {counts['created']} created, {counts['skipped']} already present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
