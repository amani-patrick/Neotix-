import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.request import RequestStatus

# Shared kwargs so both columns reuse the same PG enum type created for
# requests.status (Alembic creates the type on the first table that uses it).
_STATUS_ENUM_ARGS = dict(
    name="request_status",
    native_enum=True,
    # Store the lowercase .value ('submitted'), not the .name ('SUBMITTED').
    values_callable=lambda e: [m.value for m in e],
)


class RequestStatusHistory(Base):
    """Audit trail entry for a request status change."""

    __tablename__ = "request_status_history"
    __table_args__ = (
        Index("ix_request_status_history_request_id", "request_id"),
        Index("ix_request_status_history_changed_at", "changed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("requests.id", ondelete="CASCADE"), nullable=False
    )
    from_status: Mapped[RequestStatus | None] = mapped_column(
        Enum(RequestStatus, **_STATUS_ENUM_ARGS),
        nullable=True,
    )
    to_status: Mapped[RequestStatus] = mapped_column(
        Enum(RequestStatus, **_STATUS_ENUM_ARGS),
        nullable=False,
    )
    changed_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    request = relationship("Request", back_populates="status_history")
    changed_by_user = relationship("User")
