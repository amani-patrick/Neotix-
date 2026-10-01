"""Role-based authorization tests (Task 1: RBAC).

Uses a probe endpoint (/auth/me) plus the admin user-management endpoints to
verify that role and active-state rules are enforced server-side.
"""

import uuid

from tests.conftest import auth_header


def _login(client, email: str, password: str) -> str:
    res = client.post("/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


# --- every role can authenticate and identify itself -----------------------


def test_me_requires_authentication(client):
    assert client.get("/auth/me").status_code == 401
    # Malformed header is also rejected.
    assert client.get("/auth/me", headers={"Authorization": "garbage"}).status_code == 401


def test_me_rejects_forged_or_garbage_token(client):
    res = client.get("/auth/me", headers=auth_header("not.a.jwt"))
    assert res.status_code == 401


def test_me_returns_current_user_for_each_role(client):
    for email, password, role in [
        ("admin@example.com", "admin123", "admin"),
        ("ops1@example.com", "ops123", "operator"),
        ("client-a@example.com", "client123", "client"),
    ]:
        res = client.get("/auth/me", headers=auth_header(_login(client, email, password)))
        assert res.status_code == 200, res.text
        assert res.json()["role"] == role


# --- admin-only user management --------------------------------------------


def test_client_cannot_create_users(client):
    token = _login(client, "client-a@example.com", "client123")
    res = client.post(
        "/users",
        headers=auth_header(token),
        json={
            "email": "new@example.com",
            "password": "password1",
            "name": "New User",
            "role": "client",
        },
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "You do not have permission to perform this action"


def test_operator_cannot_create_users(client):
    token = _login(client, "ops1@example.com", "ops123")
    res = client.post(
        "/users",
        headers=auth_header(token),
        json={
            "email": "new@example.com",
            "password": "password1",
            "name": "New User",
            "role": "client",
        },
    )
    assert res.status_code == 403


def test_admin_can_create_deactivate_and_change_roles(client):
    admin = _login(client, "admin@example.com", "admin123")

    res = client.post(
        "/users",
        headers=auth_header(admin),
        json={
            "email": "client-c@example.com",
            "password": "password1",
            "name": "Gamma Robotics",
            "role": "client",
            "organization": "Gamma",
        },
    )
    assert res.status_code == 201, res.text
    created = res.json()
    user_id = created["id"]
    assert created["is_active"] is True
    assert created["organization"] == "Gamma"

    # Change role client -> operator
    res = client.patch(
        f"/users/{user_id}", headers=auth_header(admin), json={"role": "operator"}
    )
    assert res.status_code == 200
    assert res.json()["role"] == "operator"

    # Deactivate
    res = client.patch(
        f"/users/{user_id}", headers=auth_header(admin), json={"is_active": False}
    )
    assert res.status_code == 200
    assert res.json()["is_active"] is False

    # Deactivated user's token no longer grants protected access (403).
    # Their old token is still cryptographically valid; the active check stops it.


def test_duplicate_email_conflicts(client):
    admin = _login(client, "admin@example.com", "admin123")
    res = client.post(
        "/users",
        headers=auth_header(admin),
        json={
            "email": "client-a@example.com",
            "password": "password1",
            "name": "Dup",
            "role": "client",
        },
    )
    assert res.status_code == 409


def test_admin_cannot_deactivate_themself(client):
    admin = _login(client, "admin@example.com", "admin123")
    me = client.get("/auth/me", headers=auth_header(admin)).json()
    res = client.patch(
        f"/users/{me['id']}", headers=auth_header(admin), json={"is_active": False}
    )
    assert res.status_code == 400


def test_unknown_user_returns_404(client):
    admin = _login(client, "admin@example.com", "admin123")
    res = client.get(f"/users/{uuid.uuid4()}", headers=auth_header(admin))
    assert res.status_code == 404


# --- inactive users cannot perform protected actions -----------------------


def test_deactivated_user_with_valid_token_is_rejected(client, db_session):
    token = _login(client, "client-a@example.com", "client123")

    from app.models import User

    user = db_session.query(User).filter(User.email == "client-a@example.com").one()
    user.is_active = False
    db_session.commit()

    res = client.get("/auth/me", headers=auth_header(token))
    assert res.status_code == 403
    assert "deactivated" in res.json()["detail"].lower()


# --- token tampering --------------------------------------------------------


def test_token_signed_with_wrong_secret_is_rejected(client):
    import jwt as pyjwt

    forged = pyjwt.encode(
        {"sub": "00000000-0000-0000-0000-000000000000", "role": "admin"},
        "totally-wrong-secret",
        algorithm="HS256",
    )
    res = client.get("/auth/me", headers=auth_header(forged))
    assert res.status_code == 401


def test_expired_token_is_rejected(client):
    import time

    import jwt as pyjwt

    from app.config import get_settings

    settings = get_settings()
    token = pyjwt.encode(
        {
            "sub": "00000000-0000-0000-0000-000000000000",
            "role": "admin",
            "iat": int(time.time()) - 7200,
            "exp": int(time.time()) - 3600,
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    res = client.get("/auth/me", headers=auth_header(token))
    assert res.status_code == 401
