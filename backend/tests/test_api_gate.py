"""Public ERP credential collection must remain disabled pending authorization."""
from fastapi.testclient import TestClient
from app.main import app


def test_public_erp_login_is_disabled():
    client = TestClient(app)
    response = client.post("/api/auth/login", json={
        "student_id": "DEMO", "password": "SYNTHETIC_ONLY",
    })
    assert response.status_code == 503
    assert "not enabled" in response.json()["detail"]


def test_public_erp_captcha_is_disabled():
    client = TestClient(app)
    response = client.get("/api/auth/captcha")
    assert response.status_code == 503


def test_integration_status_reports_disabled():
    client = TestClient(app)
    data = client.get("/api/integration/status").json()
    assert data["enabled"] is False
    assert data["phase"] == "session-engine-offline"
