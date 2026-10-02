"""Assignment rule tests: quality gate, one-request-per-episode, races."""

import uuid

from tests.conftest import auth_header


CSV_ROWS = (
    "episode_id,robot_id,task_name,recorded_at,duration_seconds,operator_name,quality\n"
    "EP-80001,arm-01,pick cup,2026-08-01T10:00:00,50,Aline,good\n"
    "EP-80002,arm-02,pick cup,2026-08-02T10:00:00,60,Eric,usable\n"
    "EP-80003,arm-03,pick cup,2026-08-03T10:00:00,70,Diane,bad\n"
)


def _login(client, email, password):
    res = client.post("/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def _setup(client, ops_token):
    res = client.post(
        "/episodes/import",
        headers=auth_header(ops_token),
        files={"file": ("episodes.csv", CSV_ROWS.encode(), "text/csv")},
    )
    assert res.status_code == 200, res.text
    token = _login(client, "client-a@example.com", "client123")
    res = client.post(
        "/requests",
        headers=auth_header(token),
        json={
            "task_name": "pick cup",
            "episodes_requested": 3,
            "deadline": "2026-12-01T00:00:00Z",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _assign(client, ops_token, request_id, episode_id):
    return client.post(
        f"/requests/{request_id}/assignments",
        headers=auth_header(ops_token),
        json={"episode_id": episode_id},
    )


def test_good_and_usable_assignable_bad_rejected(client):
    ops_token = _login(client, "ops1@example.com", "ops123")
    rid = _setup(client, ops_token)

    assert _assign(client, ops_token, rid, "EP-80001").status_code == 201
    assert _assign(client, ops_token, rid, "EP-80002").status_code == 201

    res = _assign(client, ops_token, rid, "EP-80003")
    assert res.status_code == 400
    assert "bad" in res.json()["detail"]


def test_episode_cannot_be_assigned_twice(client):
    ops_token = _login(client, "ops1@example.com", "ops123")
    rid = _setup(client, ops_token)

    assert _assign(client, ops_token, rid, "EP-80001").status_code == 201
    res = _assign(client, ops_token, rid, "EP-80001")
    assert res.status_code == 409
    assert "already assigned" in res.json()["detail"]


def test_unknown_episode_returns_404(client):
    ops_token = _login(client, "ops1@example.com", "ops123")
    rid = _setup(client, ops_token)
    res = _assign(client, ops_token, rid, "EP-DOES-NOT-EXIST")
    assert res.status_code == 404


def test_client_cannot_assign(client):
    ops_token = _login(client, "ops1@example.com", "ops123")
    rid = _setup(client, ops_token)
    client_token = _login(client, "client-a@example.com", "client123")
    res = _assign(client, client_token, rid, "EP-80001")
    assert res.status_code == 403


def test_cannot_assign_to_closed_request(client):
    ops_token = _login(client, "ops1@example.com", "ops123")
    rid = _setup(client, ops_token)

    extra = CSV_ROWS + "EP-80004,arm-01,pick cup,2026-08-04T10:00:00,55,Aline,good\n"
    res = client.post(
        "/episodes/import",
        headers=auth_header(ops_token),
        files={"file": ("more.csv", extra.encode(), "text/csv")},
    )
    assert res.status_code == 200, res.text

    # Deliver a second request that consumed EP-80004.
    token = _login(client, "client-a@example.com", "client123")
    rid2 = client.post(
        "/requests",
        headers=auth_header(token),
        json={"task_name": "pick cup", "episodes_requested": 1, "deadline": "2026-12-01T00:00:00Z"},
    ).json()["id"]
    assert _assign(client, ops_token, rid2, "EP-80004").status_code == 201
    client.post(f"/requests/{rid2}/transition", headers=auth_header(ops_token), json={"status": "in_progress"})
    client.post(f"/requests/{rid2}/transition", headers=auth_header(ops_token), json={"status": "delivered"})

    # A delivered request is no longer assignable.
    res = _assign(client, ops_token, rid2, "EP-80001")
    assert res.status_code == 409
    assert "assignable state" in res.json()["detail"]

    # ...and an episode already on the delivered request cannot be
    # re-assigned to another one.
    res = _assign(client, ops_token, rid, "EP-80004")
    assert res.status_code == 409


def test_cannot_assign_beyond_requested_capacity(client):
    """The delivery rule stays meaningful: no over-assignment past the ask."""
    ops_token = _login(client, "ops1@example.com", "ops123")
    rid = _setup(client, ops_token)

    extra = CSV_ROWS + "EP-80004,arm-01,pick cup,2026-08-04T10:00:00,55,Aline,good\n"
    res = client.post(
        "/episodes/import",
        headers=auth_header(ops_token),
        files={"file": ("more.csv", extra.encode(), "text/csv")},
    )
    assert res.status_code == 200, res.text

    # Request asks for 3; EP-80003 is bad, so it never gets assigned.
    assert _assign(client, ops_token, rid, "EP-80001").status_code == 201
    assert _assign(client, ops_token, rid, "EP-80002").status_code == 201
    assert _assign(client, ops_token, rid, "EP-80004").status_code == 201

    # Fourth good episode exists but the request is full: 409, not 201.
    res = client.post(
        "/episodes/import",
        headers=auth_header(ops_token),
        files={
            "file": (
                "more2.csv",
                (extra + "EP-80005,arm-02,pick cup,2026-08-05T10:00:00,65,Eric,good\n").encode(),
                "text/csv",
            )
        },
    )
    assert res.status_code == 200, res.text
    res = _assign(client, ops_token, rid, "EP-80005")
    assert res.status_code == 409
    assert "required number" in res.json()["detail"]


def test_unassign_frees_episode_and_writes_history(client):
    ops_token = _login(client, "ops1@example.com", "ops123")
    rid = _setup(client, ops_token)

    assert _assign(client, ops_token, rid, "EP-80001").status_code == 201

    assignment_id = client.get(
        f"/requests/{rid}/episodes", headers=auth_header(ops_token)
    ).json()[0]["id"]

    res = client.delete(
        f"/requests/{rid}/assignments/{assignment_id}", headers=auth_header(ops_token)
    )
    assert res.status_code == 204, res.text

    # The assignment is gone...
    assert client.get(f"/requests/{rid}/episodes", headers=auth_header(ops_token)).json() == []

    # ...and the audit trail recorded the removal.
    detail = client.get(f"/requests/{rid}", headers=auth_header(ops_token)).json()
    assert any(
        "EP-80001" in (h["reason"] or "") for h in detail["status_history"]
    ), detail["status_history"]

    # The freed episode can be assigned again.
    assert _assign(client, ops_token, rid, "EP-80001").status_code == 201


def test_unassign_allows_replacing_an_over_assigned_episode(client):
    """The operator workflow: unassign one, then assign a replacement."""
    ops_token = _login(client, "ops1@example.com", "ops123")
    rid = _setup(client, ops_token)

    for ep in ("EP-80001", "EP-80002"):
        assert _assign(client, ops_token, rid, ep).status_code == 201

    first_id = client.get(f"/requests/{rid}/episodes", headers=auth_header(ops_token)).json()[0]["id"]
    assert client.delete(
        f"/requests/{rid}/assignments/{first_id}", headers=auth_header(ops_token)
    ).status_code == 204

    # Capacity freed: a different episode now fits (request wants 3).
    assert _assign(client, ops_token, rid, "EP-80003").status_code == 400  # bad quality
    extra = CSV_ROWS + "EP-80004,arm-01,pick cup,2026-08-04T10:00:00,55,Aline,good\n"
    client.post(
        "/episodes/import", headers=auth_header(ops_token), files={"file": ("m.csv", extra.encode(), "text/csv")}
    )
    assert _assign(client, ops_token, rid, "EP-80004").status_code == 201


def test_client_cannot_unassign(client):
    ops_token = _login(client, "ops1@example.com", "ops123")
    rid = _setup(client, ops_token)
    assert _assign(client, ops_token, rid, "EP-80001").status_code == 201
    assignment_id = client.get(
        f"/requests/{rid}/episodes", headers=auth_header(ops_token)
    ).json()[0]["id"]

    client_token = _login(client, "client-a@example.com", "client123")
    res = client.delete(
        f"/requests/{rid}/assignments/{assignment_id}", headers=auth_header(client_token)
    )
    assert res.status_code == 403


def test_cannot_unassign_from_delivered_request(client):
    ops_token = _login(client, "ops1@example.com", "ops123")
    rid = _setup(client, ops_token)
    # Deliver properly: import and assign the full 3 requested episodes.
    extra = CSV_ROWS + "EP-80004,arm-01,pick cup,2026-08-04T10:00:00,55,Aline,good\n"
    res = client.post(
        "/episodes/import",
        headers=auth_header(ops_token),
        files={"file": ("more.csv", extra.encode(), "text/csv")},
    )
    assert res.status_code == 200, res.text
    for ep in ("EP-80001", "EP-80002", "EP-80004"):
        assert _assign(client, ops_token, rid, ep).status_code == 201
    client.post(
        f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": "in_progress"}
    )
    res = client.post(
        f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": "delivered"}
    )
    assert res.status_code == 200, res.text
    assignment_id = client.get(
        f"/requests/{rid}/episodes", headers=auth_header(ops_token)
    ).json()[0]["id"]

    res = client.delete(
        f"/requests/{rid}/assignments/{assignment_id}", headers=auth_header(ops_token)
    )
    assert res.status_code == 409


def test_unassign_unknown_assignment_returns_404(client):
    ops_token = _login(client, "ops1@example.com", "ops123")
    rid = _setup(client, ops_token)
    res = client.delete(
        f"/requests/{rid}/assignments/{uuid.uuid4()}", headers=auth_header(ops_token)
    )
    assert res.status_code == 404


def test_concurrent_double_assignment_only_one_wins(client, db_session):
    """Two concurrent assigns of the same episode: exactly one 201, one 409.

    Uses two separate DB sessions and raw service calls to simulate the race
    the DB unique constraint must resolve.
    """
    import threading

    from app.models import Episode, EpisodeQuality
    from app.models import Request as Req
    from app.models import User, UserRole
    from app.services.assignment_service import assign_episode
    from sqlalchemy import select

    ops_token = _login(client, "ops1@example.com", "ops123")
    rid = _setup(client, ops_token)

    from app.db.session import SessionLocal

    results: list[int] = []

    episode_id = db_session.execute(
        select(Episode.id).where(Episode.episode_id == "EP-80001")
    ).scalar_one()
    request_id = db_session.execute(select(Req.id).where(Req.id == rid)).scalar_one()
    user_id = db_session.execute(
        select(User.id).where(User.email == "ops1@example.com")
    ).scalar_one()

    bar = threading.Barrier(2)

    def worker():
        db = SessionLocal()
        try:
            req = db.get(Req, request_id)
            ep = db.get(Episode, episode_id)
            user = db.get(User, user_id)
            bar.wait(timeout=10)
            try:
                assign_episode(db, req, ep, user)
                results.append(201)
            except Exception as exc:  # HTTPException with 409 expected
                status = getattr(exc, "status_code", 500)
                results.append(status)
        finally:
            db.close()

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert sorted(results) == [201, 409], results
    # and exactly one assignment row exists
    from app.models import Assignment

    count = len(
        db_session.execute(select(Assignment).where(Assignment.request_id == request_id)).scalars().all()
    )
    assert count == 1
