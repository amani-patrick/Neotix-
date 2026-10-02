"""Request workflow tests: transitions, roles, delivery rule, audit trail."""

import uuid
from datetime import UTC, datetime, timedelta

from tests.conftest import auth_header


def _login(client, email, password):
    res = client.post("/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def _create_request(client, token, episodes_requested=2, task_name="pick cup"):
    res = client.post(
        "/requests",
        headers=auth_header(token),
        json={
            "task_name": task_name,
            "episodes_requested": episodes_requested,
            "deadline": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def _assign(client, ops_token, request_id, episode_id):
    return client.post(
        f"/requests/{request_id}/assignments",
        headers=auth_header(ops_token),
        json={"episode_id": episode_id},
    )


def _import_episodes(client, ops_token, rows: str):
    res = client.post(
        "/episodes/import",
        headers=auth_header(ops_token),
        files={"file": ("episodes.csv", rows.encode(), "text/csv")},
    )
    assert res.status_code == 200, res.text


_VALID_CSV = (
    "episode_id,robot_id,task_name,recorded_at,duration_seconds,operator_name,quality\n"
    "EP-90001,arm-01,pick cup,2026-08-01T10:00:00,50,Aline,good\n"
    "EP-90002,arm-02,pick cup,2026-08-02T10:00:00,60,Eric,usable\n"
    "EP-90003,arm-03,pick cup,2026-08-03T10:00:00,70,Diane,bad\n"
)


def _happy_path_to_delivered(client, ops, client_a, n_episodes=2):
    token = _login(client, *client_a)
    request = _create_request(client, token, episodes_requested=n_episodes)
    ops_token = _login(client, *ops)
    _import_episodes(client, ops_token, _VALID_CSV)
    _assign(client, ops_token, request["id"], "EP-90001")
    _assign(client, ops_token, request["id"], "EP-90002")
    return token, ops_token, request


# --- creation & ownership ---------------------------------------------------


def test_client_creates_request_and_starts_submitted(client):
    token = _login(client, "client-a@example.com", "client123")
    request = _create_request(client, token)
    assert request["status"] == "submitted"
    assert request["episodes_requested"] == 2


def test_operator_cannot_create_requests(client):
    token = _login(client, "ops1@example.com", "ops123")
    res = client.post(
        "/requests",
        headers=auth_header(token),
        json={
            "task_name": "x",
            "episodes_requested": 1,
            "deadline": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
        },
    )
    assert res.status_code == 403


def test_client_sees_only_own_requests(client):
    a = _login(client, "client-a@example.com", "client123")
    b = _login(client, "client-b@example.com", "client123")
    mine = _create_request(client, a)

    other_list = client.get("/requests", headers=auth_header(b)).json()["items"]
    assert all(r["id"] != mine["id"] for r in other_list)

    # Direct ID access is 404 (not 403) so ids are not enumerable.
    res = client.get(f"/requests/{mine['id']}", headers=auth_header(b))
    assert res.status_code == 404

    res = client.get(f"/requests/{mine['id']}", headers=auth_header(a))
    assert res.status_code == 200


def test_operator_sees_all_requests(client):
    a = _login(client, "client-a@example.com", "client123")
    b = _login(client, "client-b@example.com", "client123")
    _create_request(client, a)
    _create_request(client, b)
    ops = _login(client, "ops1@example.com", "ops123")
    page = client.get("/requests", headers=auth_header(ops)).json()
    assert page["total"] == 2
    assert len(page["items"]) == 2


# --- transition matrix -------------------------------------------------------


def _status(client, ops_token, request_id):
    return client.get(f"/requests/{request_id}", headers=auth_header(ops_token)).json()["status"]


def test_valid_operator_transitions(client):
    ops_token = _login(client, "ops1@example.com", "ops123")
    token, ops_token, request = _happy_path_to_delivered(
        client, ("ops1@example.com", "ops123"), ("client-a@example.com", "client123")
    )
    rid = request["id"]

    assert _status(client, ops_token, rid) == "submitted"
    res = client.post(
        f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": "in_progress"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "in_progress"

    res = client.post(
        f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": "delivered"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "delivered"
    # (rejected -> in_progress rework loop is covered in its own test below)


def test_client_accepts_own_delivered_request(client):
    token, ops_token, request = _happy_path_to_delivered(
        client, ("ops1@example.com", "ops123"), ("client-a@example.com", "client123")
    )
    rid = request["id"]
    client.post(
        f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": "in_progress"}
    )
    client.post(
        f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": "delivered"}
    )
    res = client.post(
        f"/requests/{rid}/transition", headers=auth_header(token), json={"status": "accepted"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "accepted"


def test_client_cannot_accept_someone_elses_request(client):
    token_a, ops_token, request = _happy_path_to_delivered(
        client, ("ops1@example.com", "ops123"), ("client-a@example.com", "client123")
    )
    rid = request["id"]
    client.post(
        f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": "in_progress"}
    )
    client.post(
        f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": "delivered"}
    )
    token_b = _login(client, "client-b@example.com", "client123")
    res = client.post(
        f"/requests/{rid}/transition", headers=auth_header(token_b), json={"status": "accepted"}
    )
    assert res.status_code == 404  # ownership scoping hides the request


def test_invalid_transitions_are_rejected(client):
    ops_token = _login(client, "ops1@example.com", "ops123")
    token, ops_token, request = _happy_path_to_delivered(
        client, ("ops1@example.com", "ops123"), ("client-a@example.com", "client123")
    )
    rid = request["id"]

    # submitted -> delivered / accepted are invalid
    for target in ("delivered", "accepted", "rejected"):
        res = client.post(
            f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": target}
        )
        assert res.status_code == 400, (target, res.text)

    # accepted is terminal: after accept, nothing is allowed
    client.post(
        f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": "in_progress"}
    )
    client.post(
        f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": "delivered"}
    )
    client.post(
        f"/requests/{rid}/transition", headers=auth_header(token), json={"status": "accepted"}
    )
    for target in ("in_progress", "rejected", "delivered"):
        res = client.post(
            f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": target}
        )
        assert res.status_code == 400, (target, res.text)


def test_operator_cannot_accept_on_behalf_of_client(client):
    token, ops_token, request = _happy_path_to_delivered(
        client, ("ops1@example.com", "ops123"), ("client-a@example.com", "client123")
    )
    rid = request["id"]
    client.post(
        f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": "in_progress"}
    )
    client.post(
        f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": "delivered"}
    )
    res = client.post(
        f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": "accepted"}
    )
    assert res.status_code == 403


def test_client_cannot_perform_operator_transitions(client):
    token = _login(client, "client-a@example.com", "client123")
    request = _create_request(client, token)
    res = client.post(
        f"/requests/{request['id']}/transition",
        headers=auth_header(token),
        json={"status": "in_progress"},
    )
    assert res.status_code == 403


# --- delivery rule ------------------------------------------------------------


def test_insufficient_episodes_blocks_delivery(client):
    ops_token = _login(client, "ops1@example.com", "ops123")
    token = _login(client, "client-a@example.com", "client123")
    _import_episodes(client, ops_token, _VALID_CSV)

    # A request wanting 3 episodes but only 2 assigned: delivery must fail.
    big = _create_request(client, token, episodes_requested=3)
    assert _assign(client, ops_token, big["id"], "EP-90001").status_code == 201
    assert _assign(client, ops_token, big["id"], "EP-90002").status_code == 201
    client.post(
        f"/requests/{big['id']}/transition",
        headers=auth_header(ops_token),
        json={"status": "in_progress"},
    )
    res = client.post(
        f"/requests/{big['id']}/transition",
        headers=auth_header(ops_token),
        json={"status": "delivered"},
    )
    assert res.status_code == 400
    assert "Cannot deliver request" in res.json()["detail"]
    assert "2 of 3" in res.json()["detail"]


def test_rejected_request_returns_to_in_progress(client):
    token, ops_token, request = _happy_path_to_delivered(
        client, ("ops1@example.com", "ops123"), ("client-a@example.com", "client123")
    )
    rid = request["id"]
    for status in ("in_progress", "delivered"):
        client.post(
            f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": status}
        )
    client.post(
        f"/requests/{rid}/transition", headers=auth_header(token), json={"status": "rejected", "reason": "wrong task"}
    )
    res = client.post(
        f"/requests/{rid}/transition", headers=auth_header(ops_token), json={"status": "in_progress"}
    )
    assert res.status_code == 200
    assert res.json()["status"] == "in_progress"

    # history recorded the full chain
    detail = client.get(f"/requests/{rid}", headers=auth_header(ops_token)).json()
    chain = [h["to_status"] for h in detail["status_history"]]
    assert chain == ["submitted", "in_progress", "delivered", "rejected", "in_progress"]
    assert any(h["reason"] == "wrong task" for h in detail["status_history"])
    assert all(h["changed_by"] for h in detail["status_history"])
