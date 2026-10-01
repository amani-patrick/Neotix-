"""Import tests: idempotency, normalization, validation, honest reporting."""

from app.services.import_service import import_episode_rows


def _db(db_session):
    return db_session


def test_valid_row_imports(db_session):
    rows = [
        {
            "episode_id": "EP-70001",
            "robot_id": "arm-01",
            "task_name": "pick cup",
            "recorded_at": "2026-08-01T10:00:00",
            "duration_seconds": "50",
            "operator_name": "Aline",
            "quality": "good",
        }
    ]
    report = import_episode_rows(db_session, rows)
    assert (report.imported, report.duplicate, report.invalid) == (1, 0, 0)


def test_same_file_twice_is_idempotent(db_session):
    rows = [
        {
            "episode_id": "EP-70002",
            "robot_id": "arm-02",
            "task_name": "pour water",
            "recorded_at": "2026-08-02T10:00:00",
            "duration_seconds": "45",
            "operator_name": "Eric",
            "quality": "usable",
        }
    ]
    first = import_episode_rows(db_session, rows)
    assert first.imported == 1
    second = import_episode_rows(db_session, rows)
    assert (second.imported, second.duplicate) == (0, 1)
    # And the DB really holds exactly one row.
    from sqlalchemy import func, select

    from app.models import Episode

    n = db_session.execute(
        select(func.count()).where(Episode.episode_id == "EP-70002")
    ).scalar_one()
    assert n == 1


def test_quality_normalization(db_session):
    rows = [
        {
            "episode_id": "EP-70003",
            "robot_id": " arm-01 ",
            "task_name": " open drawer ",
            "recorded_at": "2026-08-03T10:00:00",
            "duration_seconds": " 30 ",
            "operator_name": "Diane",
            "quality": " GOOD ",
        },
        {
            "episode_id": "EP-70004",
            "robot_id": "mobile-01",
            "task_name": "wipe table",
            "recorded_at": "14/08/2026 09:15",
            "duration_seconds": "21",
            "operator_name": "Patrick",
            "quality": "USABLE",
        },
    ]
    report = import_episode_rows(db_session, rows)
    assert report.imported == 2, report.reasons

    from sqlalchemy import select

    from app.models import Episode

    e1 = db_session.execute(
        select(Episode).where(Episode.episode_id == "EP-70003")
    ).scalar_one()
    assert e1.quality.value == "good" and e1.robot_id == "arm-01"
    assert e1.task_name == " open drawer ".strip()

    e2 = db_session.execute(
        select(Episode).where(Episode.episode_id == "EP-70004")
    ).scalar_one()
    assert e2.quality.value == "usable"
    assert e2.recorded_at.month == 8 and e2.recorded_at.day == 14  # DD/MM parsed


def test_invalid_rows_are_skipped_with_reasons(db_session):
    base = {
        "robot_id": "arm-01",
        "task_name": "pick cup",
        "recorded_at": "2026-08-01T10:00:00",
        "duration_seconds": "50",
        "operator_name": "Aline",
        "quality": "good",
    }
    rows = [
        {**base, "episode_id": "EP-70010"},
        {**base, "episode_id": ""},  # missing episode_id
        {**base, "episode_id": "EP-70011", "quality": "excellent"},  # invalid quality
        {**base, "episode_id": "EP-70012", "duration_seconds": "banana"},  # invalid duration
        {**base, "episode_id": "EP-70013", "duration_seconds": "45.5"},  # fractional
        {**base, "episode_id": "EP-70014", "duration_seconds": "-5"},  # negative
        {**base, "episode_id": "EP-70015", "recorded_at": "not a date"},  # invalid date
        {**base, "episode_id": "EP-70016", "robot_id": "arm-99"},  # unknown robot
    ]
    report = import_episode_rows(db_session, rows)
    assert report.imported == 1
    assert report.invalid == 7
    assert report.reasons["unknown robot"] == 1
    assert report.reasons["invalid quality"] == 1
    assert report.reasons["invalid duration"] == 3
    assert report.reasons["invalid recorded_at"] == 1
    assert report.reasons["missing episode_id"] == 1
    assert report.total_rows == 8


def test_duplicate_ids_within_one_file(db_session):
    base = {
        "robot_id": "arm-02",
        "task_name": "fold towel",
        "recorded_at": "2026-08-04T10:00:00",
        "duration_seconds": "33",
        "operator_name": "Jeanne",
        "quality": "good",
    }
    rows = [
        {**base, "episode_id": "EP-70020"},
        {**base, "episode_id": "EP-70020"},
    ]
    report = import_episode_rows(db_session, rows)
    assert (report.imported, report.duplicate) == (1, 1)


def test_malformed_row_does_not_crash_import(db_session):
    rows = [
        {"episode_id": "EP-70030", "robot_id": "arm-01", "task_name": "x", "oops": 1},
        {
            "episode_id": "EP-70031",
            "robot_id": "arm-01",
            "task_name": "pick cup",
            "recorded_at": "2026-08-05T10:00:00",
            "duration_seconds": "40",
            "operator_name": "Aline",
            "quality": "good",
        },
    ]
    report = import_episode_rows(db_session, rows)
    assert report.imported == 1
    assert report.invalid == 1
    assert report.reasons["malformed row"] == 1


def test_messy_seed_file_end_to_end(db_session):
    """The real 190-row messy export: known totals, second run adds nothing.

    Verified breakdown (from the analyzed file):
      173 imported, 3 in-file duplicates, 14 invalid rows by reason:
        invalid duration 3, invalid quality 2, invalid recorded_at 2,
        malformed row 2, missing episode_id 1, missing duration 1,
        unknown robot 1, missing robot_id 1, missing operator_name 1
    """
    import csv

    with open("seed/episodes.csv", newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))

    first = import_episode_rows(db_session, rows)
    assert first.total_rows == 190
    assert first.imported + first.duplicate + first.invalid == 190
    assert first.imported == 173, first.reasons
    assert first.duplicate == 3
    assert first.invalid == 14
    assert first.reasons["unknown robot"] == 1
    assert first.reasons["invalid duration"] == 3

    second = import_episode_rows(db_session, rows)
    assert second.imported == 0
    assert second.duplicate == 176
    assert second.invalid == 14
