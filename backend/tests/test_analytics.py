"""Analytics tests: the four metrics with controlled seed data."""

from datetime import UTC, datetime

from app.services.analytics_service import compute_analytics
from tests.conftest import auth_header

CSV = (
    "episode_id,robot_id,task_name,recorded_at,duration_seconds,operator_name,quality\n"
    "EP-60001,arm-01,pick cup,2026-08-01T10:00:00,50,Aline,good\n"
    "EP-60002,arm-01,pick cup,2026-08-01T11:00:00,51,Aline,good\n"
    "EP-60003,arm-02,pick cup,2026-08-02T10:00:00,52,Eric,good\n"
    "EP-60004,arm-02,fold towel,2026-08-05T10:00:00,53,Eric,good\n"
    "EP-60005,arm-03,pick cup,2026-08-06T10:00:00,54,Diane,bad\n"  # bad: excluded from top tasks
    "EP-60006,arm-03,fold towel,2026-09-01T10:00:00,55,Diane,good\n"  # outside [from,to)
)


def _login(client, email, password):
    res = client.post("/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def _seed_world(client, db_session):
    ops = _login(client, "ops1@example.com", "ops123")
    res = client.post(
        "/episodes/import", headers=auth_header(ops), files={"file": ("e.csv", CSV.encode(), "text/csv")}
    )
    assert res.status_code == 200, res.text

    # Two requests driven through the workflow at controlled times.
    client_a = _login(client, "client-a@example.com", "client123")
    client_b = _login(client, "client-b@example.com", "client123")

    r1 = client.post(
        "/requests",
        headers=auth_header(client_a),
        json={"task_name": "pick cup", "episodes_requested": 2, "deadline": "2026-12-01T00:00:00Z"},
    ).json()
    client.post(f"/requests/{r1['id']}/assignments", headers=auth_header(ops), json={"episode_id": "EP-60001"})
    client.post(f"/requests/{r1['id']}/assignments", headers=auth_header(ops), json={"episode_id": "EP-60002"})
    client.post(f"/requests/{r1['id']}/transition", headers=auth_header(ops), json={"status": "in_progress"})
    client.post(f"/requests/{r1['id']}/transition", headers=auth_header(ops), json={"status": "delivered"})

    r2 = client.post(
        "/requests",
        headers=auth_header(client_b),
        json={"task_name": "fold towel", "episodes_requested": 1, "deadline": "2026-12-01T00:00:00Z"},
    ).json()  # stays submitted

    r3 = client.post(
        "/requests",
        headers=auth_header(client_a),
        json={"task_name": "open drawer", "episodes_requested": 1, "deadline": "2026-12-01T00:00:00Z"},
    ).json()
    client.post(f"/requests/{r3['id']}/assignments", headers=auth_header(ops), json={"episode_id": "EP-60004"})
    client.post(f"/requests/{r3['id']}/transition", headers=auth_header(ops), json={"status": "in_progress"})

    return ops


def test_analytics_metrics(client, db_session):
    _seed_world(client, db_session)
    ops = _login(client, "ops1@example.com", "ops123")
    res = client.get(
        "/analytics",
        headers=auth_header(ops),
        params={"from": "2026-08-01T00:00:00Z", "to": "2026-12-31T23:59:59Z"},
    )
    assert res.status_code == 200, res.text
    data = res.json()

    # 1. per-day per-robot counts aggregate in SQL across the whole range
    per_day = {(d["day"], d["robot_id"]): d["episodes"] for d in data["episodes_per_day_robot"]}
    assert per_day[("2026-08-01", "arm-01")] == 2
    assert per_day[("2026-08-02", "arm-02")] == 1
    assert sum(per_day.values()) == 6

    # Exclusive end: [from, to) must exclude the Sept 1 episode.
    res_aug = client.get(
        "/analytics",
        headers=auth_header(ops),
        params={"from": "2026-08-01T00:00:00Z", "to": "2026-09-01T00:00:00Z"},
    ).json()
    aug_days = {(d["day"], d["robot_id"]) for d in res_aug["episodes_per_day_robot"]}
    assert ("2026-09-01", "arm-03") not in aug_days
    assert sum(d["episodes"] for d in res_aug["episodes_per_day_robot"]) == 5

    # 2. requests by status
    by_status = data["requests_by_status"]
    assert by_status["delivered"] == 1
    assert by_status["in_progress"] == 1
    assert by_status["submitted"] == 1

    # 3. median submitted -> delivered only counts delivered requests
    median = data["median_submitted_to_delivered"]
    assert median["count_requests"] == 1
    assert median["median_seconds"] is not None and median["median_seconds"] > 0

    # 4. top tasks by *good* episodes in range, bad excluded
    top = data["top_tasks_by_good_episodes"]
    assert top[0] == {"task_name": "pick cup", "good_episodes": 3}
    assert {"task_name": "fold towel", "good_episodes": 2} in top


def test_analytics_requires_operator(client):
    client_a = _login(client, "client-a@example.com", "client123")
    res = client.get(
        "/analytics",
        headers=auth_header(client_a),
        params={"from": "2026-08-01T00:00:00Z", "to": "2026-09-01T00:00:00Z"},
    )
    assert res.status_code == 403
    res = client.get("/analytics", params={"from": "2026-08-01T00:00:00Z", "to": "2026-09-01T00:00:00Z"})
    assert res.status_code == 401


def test_analytics_range_validation(client):
    ops = _login(client, "ops1@example.com", "ops123")
    res = client.get(
        "/analytics",
        headers=auth_header(ops),
        params={"from": "2026-09-01T00:00:00Z", "to": "2026-08-01T00:00:00Z"},
    )
    assert res.status_code == 422
