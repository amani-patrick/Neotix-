"""Pydantic schemas for admin user management."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import UserRole
from app.schemas.auth import UserPublic


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=255)
    role: UserRole
    organization: str | None = Field(default=None, max_length=255)


class UserUpdate(BaseModel):
    """Partial updates allowed by admins (kept intentionally small)."""

    is_active: bool | None = None
    role: UserRole | None = None


class UserCreated(UserPublic):
    created_at: datetime
