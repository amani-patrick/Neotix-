"""Idempotent CSV episode import.

Behaviors are documented decisions (see NOTES.md):
  - normalize whitespace/casing for quality and robot ids; task names keep
    source casing but are trimmed
  - dates: ISO 8601 (with/without seconds), `YYYY-MM-DD HH:MM(:SS)`, and
    DD/MM/YYYY HH:MM as found in the seed export; anything else is invalid
  - unknown robots are INVALID and skipped (reported), never invented
  - duplicate episode_id (in file or already in DB) -> 'duplicate'
  - one bad row never stops the import; reasons are counted and exemplified
  - safe to run repeatedly: unique episode_id + on-conflict-do-nothing
"""

import csv
import uuid
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import Episode, EpisodeQuality
from app.schemas.episode import ImportReport

KNOWN_ROBOTS = {"arm-01", "arm-02", "arm-03", "mobile-01", "humanoid-01"}
REQUIRED_COLUMNS = (
    "episode_id",
    "robot_id",
    "task_name",
    "recorded_at",
    "duration_seconds",
    "operator_name",
    "quality",
)

_REASON_EXAMPLE_CAP = 5  # example raw rows kept per reason for the report
_CHUNK_SIZE = 500


class RowInvalid(Exception):
    """Raised internally; the message is the report's reason key."""


def _parse_datetime(raw: str) -> datetime:
    """Accept the formats actually seen in the export; else invalid.

    The recording system exports naive local timestamps (the company is in
    Kigali, UTC+2), so we anchor them to UTC and store timezone-aware
    datetimes consistently (spec section 22).
    """
    value = raw.strip()
    for fmt in (
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y",
    ):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    raise RowInvalid("invalid recorded_at")


def _parse_duration(raw: str) -> int:
    """Whole positive seconds only. '45.5' and 'banana' are rejected."""
    value = raw.strip()
    if not value:
        raise RowInvalid("missing duration")
    if value.lstrip("-").isdigit():
        seconds = int(value)
    else:
        # A fractional duration is fundamentally invalid data for a
        # whole-seconds column - do not silently round or truncate.
        raise RowInvalid("invalid duration")
    if seconds <= 0:
        raise RowInvalid("invalid duration")
    return seconds


def _parse_quality(raw: str) -> EpisodeQuality:
    """' good ' / 'GOOD' / 'USABLE' normalize to the canonical value."""
    value = raw.strip().lower()
    try:
        return EpisodeQuality(value)
    except ValueError:
        raise RowInvalid("invalid quality") from None


def parse_row(raw: dict) -> dict:
    """Normalize + validate one raw CSV row into model kwargs.

    Raises RowInvalid with a reportable reason key.
    """
    if None in raw or any(v is None for v in raw.values()):
        # csv.DictReader signals a wrong column count this way.
        raise RowInvalid("malformed row")
    if any(col not in raw for col in REQUIRED_COLUMNS):
        # Missing columns entirely (vs. blank values) is malformed.
        raise RowInvalid("malformed row")

    get = raw.get
    episode_id = (get("episode_id") or "").strip()
    robot_id = (get("robot_id") or "").strip().lower()
    task_name = (get("task_name") or "").strip()
    operator_name = (get("operator_name") or "").strip()
    recorded_raw = get("recorded_at") or ""
    duration_raw = get("duration_seconds") or ""
    quality_raw = get("quality") or ""

    if not episode_id:
        raise RowInvalid("missing episode_id")
    if len(episode_id) > 64:
        raise RowInvalid("invalid episode_id")
    if not robot_id:
        raise RowInvalid("missing robot_id")
    if robot_id not in KNOWN_ROBOTS:
        # Documented decision: unknown robots are invalid for import.
        raise RowInvalid("unknown robot")
    if not task_name:
        raise RowInvalid("missing task_name")
    if not operator_name:
        raise RowInvalid("missing operator_name")

    return {
        "id": uuid.uuid4(),
        "episode_id": episode_id,
        "robot_id": robot_id,
        "task_name": task_name,
        "recorded_at": _parse_datetime(recorded_raw),
        "duration_seconds": _parse_duration(duration_raw),
        "operator_name": operator_name,
        "quality": _parse_quality(quality_raw),
    }


def import_episode_rows(db: Session, raw_rows: list[dict]) -> ImportReport:
    """Import parsed CSV rows idempotently and report exactly what happened."""
    reasons: Counter[str] = Counter()  # INVALID rows only (duplicates are
    # counted separately so imported + duplicate + invalid == total always).
    examples: dict[str, list[str]] = {}
    valid: list[dict] = []
    in_file_seen: set[str] = set()
    duplicate = 0
    total = len(raw_rows)

    def note(reason: str, raw_row: dict | None = None) -> None:
        reasons[reason] += 1
        _add_example(reason, raw_row)

    def _add_example(reason: str, raw_row: dict | None) -> None:
        if raw_row is not None and len(examples.setdefault(reason, [])) < _REASON_EXAMPLE_CAP:
            examples[reason].append(str((raw_row.get("episode_id") or "<blank>")).strip())

    for raw_row in raw_rows:
        try:
            parsed = parse_row(raw_row)
        except RowInvalid as exc:
            note(str(exc), raw_row)
            continue

        eid = parsed["episode_id"]
        if eid in in_file_seen:
            duplicate += 1
            _add_example("duplicate episode_id (in file)", raw_row)
            continue
        in_file_seen.add(eid)
        valid.append(parsed)

    # Which of these already exist in the database?
    existing: set[str] = set()
    for start in range(0, len(valid), _CHUNK_SIZE):
        chunk_ids = [v["episode_id"] for v in valid[start : start + _CHUNK_SIZE]]
        found = db.execute(
            select(Episode.episode_id).where(Episode.episode_id.in_(chunk_ids))
        ).scalars()
        existing.update(found)

    to_insert = [v for v in valid if v["episode_id"] not in existing]
    duplicate += len(valid) - len(to_insert)

    # Insert with ON CONFLICT DO NOTHING: even if a concurrent import races
    # us, no duplicates are possible. We reconcile the counts afterwards so
    # the report stays honest.
    inserted = 0
    for start in range(0, len(to_insert), _CHUNK_SIZE):
        chunk = to_insert[start : start + _CHUNK_SIZE]
        stmt = pg_insert(Episode).values(chunk).on_conflict_do_nothing(index_elements=["episode_id"])
        db.execute(stmt)
        inserted += len(chunk)
    db.commit()

    if to_insert:
        # Reconcile in chunks: a single IN (...) with hundreds of thousands of
        # ids blows past Postgres' 65,535-parameter protocol limit.
        actually_there: set[str] = set()
        for start in range(0, len(to_insert), _CHUNK_SIZE):
            chunk_ids = [v["episode_id"] for v in to_insert[start : start + _CHUNK_SIZE]]
            found = db.execute(
                select(Episode.episode_id).where(Episode.episode_id.in_(chunk_ids))
            ).scalars()
            actually_there.update(found)
        # Any row we tried to insert that is present was imported (by us or,
        # in a race, by the other transaction - still not a duplicate record).
        inserted = len(actually_there)

    return ImportReport(
        total_rows=total,
        imported=inserted,
        duplicate=duplicate,
        invalid=sum(reasons.values()),
        reasons=dict(sorted(reasons.items(), key=lambda kv: -kv[1])),
        examples=dict(examples),
    )


def import_episodes_csv(db: Session, path: str | Path) -> ImportReport:
    """Stream a CSV file and import it idempotently."""
    with open(path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        raw_rows = list(reader)
    return import_episode_rows(db, raw_rows)
