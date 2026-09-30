import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class RequestStatus(str, enum.Enum):
    SUBMITTED = "submitted"
    IN_PROGRESS = "in_progress"
    DELIVERED = "delivered"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


ALLOWED_TRANSITIONS: dict[RequestStatus, set[RequestStatus]] = {
    RequestStatus.SUBMITTED: {RequestStatus.IN_PROGRESS},
    RequestStatus.IN_PROGRESS: {RequestStatus.DELIVERED},
    RequestStatus.DELIVERED: {RequestStatus.ACCEPTED, RequestStatus.REJECTED},
    RequestStatus.ACCEPTED: set(),
    RequestStatus.REJECTED: {RequestStatus.IN_PROGRESS},
}


class Request(Base):
    __tablename__ = "requests"
    __table_args__ = (
        CheckConstraint("episodes_requested > 0", name="ck_requests_episodes_requested_positive"),
        Index("ix_requests_client_id", "client_id"),
        Index("ix_requests_status", "status"),
        Index("ix_requests_deadline", "deadline"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    task_name: Mapped[str] = mapped_column(String(255), nullable=False)
    episodes_requested: Mapped[int] = mapped_column(nullable=False)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[RequestStatus] = mapped_column(
        Enum(RequestStatus, name="request_status", native_enum=True),
        nullable=False,
        default=RequestStatus.SUBMITTED,
        server_default="submitted",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    client = relationship("User", foreign_keys=[client_id])
    assignments = relationship(
        "Assignment", back_populates="request", cascade="all, delete-orphan"
    )
    status_history = relationship(
        "RequestStatusHistory", back_populates="request", cascade="all, delete-orphan"
    )
