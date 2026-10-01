"""Analytics computed in the database (never in Python).

Spec section 21: these queries must behave reasonably with millions of
episodes, so all aggregation is pushed to PostgreSQL:
  - GROUP BY / COUNT / percentile_cont (median) / ORDER BY / LIMIT
  - date ranges are half-open [from, to) in UTC (documented in NOTES.md)
  - median submitted->delivered uses status_history timestamps, since the
    requests table does not store per-status timestamps
"""

from datetime import UTC, datetime

from pydantic import BaseModel
from sqlalchemy import Integer, cast, func, select, text
from sqlalchemy.dialects.postgresql import INTERVAL
from sqlalchemy.orm import Session

from app.models import (
    Episode,
    EpisodeQuality,
    Request,
    RequestStatus,
    RequestStatusHistory,
)


class EpisodesPerDayRobot(BaseModel):
    day: str
    robot_id: str
    episodes: int


class MedianSubmittedToDelivered(BaseModel):
    count_requests: int
    median_seconds: float | None
    median_hours: float | None


class TopTaskGoodEpisodes(BaseModel):
    task_name: str
    good_episodes: int


class AnalyticsResponse(BaseModel):
    range_start: datetime
    range_end: datetime
    episodes_per_day_robot: list[EpisodesPerDayRobot]
    requests_by_status: dict[str, int]
    median_submitted_to_delivered: MedianSubmittedToDelivered
    top_tasks_by_good_episodes: list[TopTaskGoodEpisodes]


def _median_submitted_to_delivered(db: Session, start, end) -> MedianSubmittedToDelivered:
    """Median of (delivered_at - submitted_at) from status history.

    Only requests actually *delivered* within [start, end) contribute.
    submitted_at = the request's creation (first `submitted` history row);
    delivered_at = the `in_progress -> delivered` transition timestamp.
    """
    # Requests *delivered* within [start, end) contribute; their age is
    # measured from the original submission (creation) timestamp.
    submitted = (
        select(
            RequestStatusHistory.request_id,
            func.min(RequestStatusHistory.changed_at).label("submitted_at"),
        )
        .where(RequestStatusHistory.to_status == RequestStatus.SUBMITTED)
        .group_by(RequestStatusHistory.request_id)
        .subquery()
    )

    delivered = (
        select(
            RequestStatusHistory.request_id,
            func.min(RequestStatusHistory.changed_at).label("delivered_at"),
        )
        .where(
            RequestStatusHistory.to_status == RequestStatus.DELIVERED,
            RequestStatusHistory.changed_at >= start,
            RequestStatusHistory.changed_at < end,
        )
        .group_by(RequestStatusHistory.request_id)
        .subquery()
    )

    joined = (
        select(
            func.count().label("n"),
            func.percentile_cont(0.5)
            .within_group(delivered.c.delivered_at - submitted.c.submitted_at)
            .label("median"),
        )
        .select_from(
            submitted.join(
                delivered, delivered.c.request_id == submitted.c.request_id
            )
        )
    )
    row = db.execute(joined).one()
    median_seconds = row.median.total_seconds() if row.median else None
    return MedianSubmittedToDelivered(
        count_requests=row.n,
        median_seconds=median_seconds,
        median_hours=(median_seconds / 3600) if median_seconds is not None else None,
    )


def compute_analytics(db: Session, start: datetime, end: datetime) -> AnalyticsResponse:
    """All four metrics, computed by PostgreSQL in [start, end)."""
    # 1. Episodes recorded per day, per robot.
    day = func.date_trunc("day", Episode.recorded_at).label("day")
    per_day_robot_rows = db.execute(
        select(day, Episode.robot_id, func.count())
        .where(Episode.recorded_at >= start, Episode.recorded_at < end)
        .group_by(day, Episode.robot_id)
        .order_by(day, Episode.robot_id)
    ).all()
    episodes_per_day_robot = [
        EpisodesPerDayRobot(day=d.date().isoformat(), robot_id=robot, episodes=n)
        for d, robot, n in per_day_robot_rows
    ]

    # 2. Request count by status (all requests, not range-limited: status is
    # current state; the spec asks for fulfilment overview).
    status_rows = db.execute(
        select(Request.status, func.count()).group_by(Request.status)
    ).all()
    requests_by_status = {s.value: n for s, n in status_rows}

    # 3. Median submitted -> delivered.
    median = _median_submitted_to_delivered(db, start, end)

    # 4. Top 5 task names by number of *good* episodes in range.
    top_rows = db.execute(
        select(Episode.task_name, func.count())
        .where(
            Episode.quality == EpisodeQuality.GOOD,
            Episode.recorded_at >= start,
            Episode.recorded_at < end,
        )
        .group_by(Episode.task_name)
        .order_by(func.count().desc(), Episode.task_name)
        .limit(5)
    ).all()
    top_tasks = [
        TopTaskGoodEpisodes(task_name=t, good_episodes=n) for t, n in top_rows
    ]

    return AnalyticsResponse(
        range_start=start,
        range_end=end,
        episodes_per_day_robot=episodes_per_day_robot,
        requests_by_status=requests_by_status,
        median_submitted_to_delivered=median,
        top_tasks_by_good_episodes=top_tasks,
    )
