"""Login endpoint behavior tests (Task 1: authentication)."""

from tests.conftest import auth_header


def _login(client, email: str, password: str):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_login_with_valid_seed_credentials_returns_token_and_user(client):
    res = _login(client, "client-a@example.com", "client123")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["token_type"] == "bearer"
    assert len(body["access_token"]) > 20
    assert body["user"]["email"] == "client-a@example.com"
    assert body["user"]["role"] == "client"
    # The password hash must never appear in any response.
    assert "password_hash" not in body["user"]
    assert "password" not in body["user"]


def test_login_rejects_unknown_email(client):
    res = _login(client, "nobody@example.com", "whatever")
    assert res.status_code == 401
    assert res.json()["detail"] == "Incorrect email or password"


def test_login_rejects_wrong_password(client):
    res = _login(client, "client-a@example.com", "wrong-password")
    assert res.status_code == 401


def test_login_rejects_deactivated_user_with_same_generic_error(client, db_session):
    from app.models import User

    user = db_session.query(User).filter(User.email == "client-a@example.com").one()
    user.is_active = False
    db_session.commit()

    res = _login(client, "client-a@example.com", "client123")
    assert res.status_code == 401
    # Same message as bad credentials -> no account-status oracle.
    assert res.json()["detail"] == "Incorrect email or password"


def test_login_rejects_malformed_email(client):
    res = client.post("/auth/login", json={"email": "not-an-email", "password": "x"})
    assert res.status_code == 422


def test_login_is_case_insensitive_for_email(client):
    res = _login(client, "CLIENT-A@EXAMPLE.COM", "client123")
    assert res.status_code == 200


def test_passwords_stored_hashed_not_plaintext(db_session):
    from app.models import User

    users = db_session.query(User).all()
    assert users, "seed users should exist"
    for u in users:
        assert u.password_hash.startswith("$argon2"), u.email
        assert "client123" != u.password_hash
        assert "admin123" != u.password_hash
