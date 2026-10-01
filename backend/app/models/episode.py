import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    Index,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class EpisodeQuality(str, enum.Enum):
    GOOD = "good"
    USABLE = "usable"
    BAD = "bad"


KNOWN_ROBOTS = ("arm-01", "arm-02", "arm-03", "mobile-01", "humanoid-01")


class Episode(Base):
    __tablename__ = "episodes"
    __table_args__ = (
        CheckConstraint("duration_seconds > 0", name="ck_episodes_duration_positive"),
        Index("ix_episodes_robot_id", "robot_id"),
        Index("ix_episodes_task_name", "task_name"),
        Index("ix_episodes_quality", "quality"),
        Index("ix_episodes_recorded_at", "recorded_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    episode_id: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    robot_id: Mapped[str] = mapped_column(String(64), nullable=False)
    task_name: Mapped[str] = mapped_column(String(255), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    operator_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quality: Mapped[EpisodeQuality] = mapped_column(
        Enum(
            EpisodeQuality,
            name="episode_quality",
            native_enum=True,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
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
