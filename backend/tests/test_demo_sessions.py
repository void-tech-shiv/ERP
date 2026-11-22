"""Security regression tests for the demo-only app session API."""
from fastapi.testclient import TestClient
import pytest

from app.demo_sessions import DemoSessions
from app.main import app


@pytest.fixture()
def client():
    app.state.demo_sessions = DemoSessions()
    with TestClient(app) as c:
        yield c
    app.state.demo_sessions.clear()


def begin(client, *, headers=None):
    return client.post(
        "/api/demo/session",
        headers={"X-Attendly-Demo": "start", **(headers or {})},
    )


def test_demo_is_opt_in_and_erp_login_is_still_disabled(client):
    assert client.get("/api/demo/session").json()["active"] is False
    assert client.get("/api/demo/session/attendance").status_code == 401
    assert client.post("/api/demo/session").status_code == 403
    assert client.post("/api/auth/login", json={"password": "synthetic"}).status_code == 503
    assert client.get("/api/auth/captcha").status_code == 503


def test_start_creates_httponly_strict_demo_cookie_and_no_cache(client):
    response = begin(client)
    assert response.status_code == 200
    assert response.json()["active"] is True
    assert response.json()["mode"] == "demo"
    assert response.json()["student"]["id"] == "DEMO"
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=strict" in cookie
    assert "path=/api" in cookie
    assert response.headers["cache-control"] == "no-store"
    assert "attendly_demo_session" not in str(response.json())
    assert "csrfToken" in response.json()


def test_demo_attendance_requires_browser_session(client):
    begin(client)
    response = client.get("/api/demo/session/attendance")
    assert response.status_code == 200
    assert response.json()["source"] == "demo"
    assert len(response.json()["courses"]) == 5
    assert response.headers["cache-control"] == "no-store"


def test_invalid_csrf_cannot_logout(client):
    begin(client)
    response = client.post("/api/demo/logout", headers={"X-Attendly-CSRF": "wrong"})
    assert response.status_code == 403
    assert client.get("/api/demo/session").json()["active"] is True


def test_valid_logout_revokes_and_deletes_cookie(client):
    csrf = begin(client).json()["csrfToken"]
    logged_out = client.post("/api/demo/logout", headers={"X-Attendly-CSRF": csrf})
    assert logged_out.status_code == 200
    assert logged_out.json()["active"] is False
    assert "max-age=0" in logged_out.headers["set-cookie"].lower()
    assert client.get("/api/demo/session").json()["active"] is False
    assert client.get("/api/demo/session/attendance").status_code == 401


def test_cross_site_browser_requests_rejected(client):
    assert begin(client, headers={"Origin": "https://evil.example"}).status_code == 403
    assert begin(client, headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403


def test_demo_endpoint_rejects_payload_instead_of_collecting_passwords(client):
    response = client.post(
        "/api/demo/session",
        headers={"X-Attendly-Demo": "start"},
        json={"student": "SYNTHETIC", "password": "NEVER_STORE"},
    )
    assert response.status_code == 400
    assert "NEVER_STORE" not in response.text


def test_two_browsers_have_separate_sessions():
    app.state.demo_sessions = DemoSessions()
    with TestClient(app) as first, TestClient(app) as second:
        first_csrf = begin(first).json()["csrfToken"]
        second_csrf = begin(second).json()["csrfToken"]
        assert first_csrf != second_csrf
        assert first.post("/api/demo/logout",
            headers={"X-Attendly-CSRF": second_csrf}).status_code == 403
        assert first.post("/api/demo/logout",
            headers={"X-Attendly-CSRF": first_csrf}).status_code == 200
        assert second.get("/api/demo/session").json()["active"] is True
    app.state.demo_sessions.clear()


def test_rate_limit_restricts_session_starts(client):
    app.state.demo_sessions = DemoSessions(max_starts_per_window=2)
    assert begin(client).status_code == 200
    assert begin(client).status_code == 200
    r = begin(client)
    assert r.status_code == 429
    assert r.headers["retry-after"] == "60"


def test_expiration_and_expired_csrf():
    now = [1.]
    store = DemoSessions(ttl_seconds=5, clock=lambda: now[0])
    cookie, session = store.create("device-1")
    assert store.get(cookie) is session
    now[0] = 7.
    assert store.get(cookie) is None
    assert not store.verify_csrf(cookie, session.csrf)


def test_token_rotation_revokes_old_token():
    store = DemoSessions()
    one, _ = store.create("device-1")
    two, _ = store.create("device-1", prior_token=one)
    assert one != two
    assert store.get(one) is None
    assert store.get(two) is not None


def test_store_capacity_and_invalid_parameters():
    store = DemoSessions(max_sessions=1)
    store.create("device-1")
    with pytest.raises(Exception) as error:
        store.create("device-2")
    assert type(error.value).__name__ == "DemoCapacityReached"
    with pytest.raises(ValueError):
        DemoSessions(ttl_seconds=0)

def test_rotation_at_capacity_reuses_same_browser_slot():
    store = DemoSessions(max_sessions=1)
    old, _ = store.create("browser")
    new, _ = store.create("browser", prior_token=old)
    assert store.get(old) is None
    assert store.get(new) is not None
