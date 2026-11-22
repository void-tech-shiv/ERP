"""Safe local demo API. Live ERP credential collection is strictly disabled."""
import os
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from .calculator import CalculationRequest, calculate
from .demo_sessions import DemoSessions, DemoRateLimited, DemoCapacityReached

DEV_ORIGINS = {
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:8000", "http://127.0.0.1:8000",
}
PRODUCTION = os.getenv("APP_ENV", "development").lower() == "production"
APP_ORIGINS = {
    item.strip().rstrip("/") for item in os.getenv(
        "APP_ORIGINS", "" if PRODUCTION else ",".join(sorted(DEV_ORIGINS))
    ).split(",") if item.strip()
}
COOKIE_NAME = "attendly_demo_session"
COOKIE_MAX_AGE = 3600

app = FastAPI(
    title="KL LTPS Attendance API", version="0.2.0",
    docs_url="/api/docs", openapi_url="/api/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(APP_ORIGINS),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Attendly-CSRF", "X-Attendly-Demo"],
)
app.state.demo_sessions = DemoSessions(ttl_seconds=COOKIE_MAX_AGE)

# These are intentionally fictitious demonstration records.
SAMPLE_COURSES = [
    {"code": "25AI2101", "name": "Machine Learning", "components": {"L": {"attended": 34, "conducted": 40}, "T": {"attended": 11, "conducted": 12}, "P": {"attended": 16, "conducted": 18}}},
    {"code": "25CS2202", "name": "Database Management Systems", "components": {"L": {"attended": 38, "conducted": 42}, "P": {"attended": 14, "conducted": 18}}},
    {"code": "25MA2103", "name": "Probability & Statistics", "components": {"L": {"attended": 29, "conducted": 38}, "T": {"attended": 10, "conducted": 14}}},
    {"code": "25AI2204", "name": "Deep Learning Foundations", "components": {"L": {"attended": 37, "conducted": 40}, "P": {"attended": 17, "conducted": 20}, "S": {"attended": 5, "conducted": 8}}},
    {"code": "25UC2205", "name": "Professional Communication", "components": {"L": {"attended": 26, "conducted": 30}, "S": {"attended": 10, "conducted": 12}}},
]


@app.middleware("http")
async def prevent_sensitive_response_caching(request: Request, call_next):
    result = await call_next(request)
    if request.url.path.startswith(("/api/demo/", "/api/auth/", "/api/attendance")):
        result.headers["Cache-Control"] = "no-store"
        result.headers["Pragma"] = "no-cache"
        result.headers["X-Content-Type-Options"] = "nosniff"
    return result


def check_browser_origin(request: Request) -> None:
    """Require an approved Origin and reject cross-site browser writes."""
    if request.headers.get("sec-fetch-site", "").lower() == "cross-site":
        raise HTTPException(403, "Cross-site request rejected")
    origin = request.headers.get("origin")
    if origin and (origin not in APP_ORIGINS or urlsplit(origin).scheme not in ("http", "https")):
        raise HTTPException(403, "Unapproved request origin")
    # In production a browser POST must supply Origin. This also makes
    # an unconfigured APP_ORIGINS fail closed rather than silently bypassing.
    if PRODUCTION and not origin:
        raise HTTPException(403, "Origin required")


def demo_record(request: Request):
    return request.app.state.demo_sessions.get(request.cookies.get(COOKIE_NAME))


def demo_data() -> dict:
    return {
        "source": "demo",
        "student": {"id": "DEMO", "name": "Demo Student"},
        **calculate(CalculationRequest(courses=SAMPLE_COURSES)),
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/integration/status")
def integration_status():
    return {
        "enabled": False,
        "phase": "session-engine-offline",
        "demoSessionAvailable": True,
        "reason": "Upstream ERP login is not enabled; the browser demo uses only sample attendance",
    }


@app.get("/api/demo/attendance")
def demo():
    """Public synthetic fixture for UI previews; never student data."""
    return demo_data()


@app.post("/api/calculate")
def calculate_api(payload: CalculationRequest):
    return calculate(payload)


@app.post("/api/demo/session")
def create_demo_session(request: Request, response: Response):
    """Explicit opt-in; no username/password fields are accepted."""
    check_browser_origin(request)
    if request.headers.get("X-Attendly-Demo") != "start":
        raise HTTPException(403, "Explicit demo opt-in header required")
    # Reject any request body: never silently accept or log credentials.
    if request.headers.get("content-length", "0") not in ("", "0"):
        raise HTTPException(400, "Demo start does not accept a request body")
    client_id = request.client.host if request.client else "unknown"
    try:
        token, session = request.app.state.demo_sessions.create(
            client_id=client_id, prior_token=request.cookies.get(COOKIE_NAME)
        )
    except DemoRateLimited:
        raise HTTPException(429, "Demo session rate limit exceeded", headers={"Retry-After": "60"}) from None
    except DemoCapacityReached:
        raise HTTPException(503, "Demo capacity reached") from None
    response.set_cookie(
        key=COOKIE_NAME, value=token, httponly=True, secure=PRODUCTION,
        samesite="strict", max_age=COOKIE_MAX_AGE, path="/api",
    )
    return {
        "active": True, "mode": "demo", "student": demo_data()["student"],
        "csrfToken": session.csrf,
    }


@app.get("/api/demo/session")
def current_demo_session(request: Request):
    session = demo_record(request)
    if not session:
        return {"active": False, "mode": "demo"}
    return {
        "active": True, "mode": "demo", "student": demo_data()["student"],
        "csrfToken": session.csrf,
    }


@app.get("/api/demo/session/attendance")
def demo_session_attendance(request: Request):
    if not demo_record(request):
        raise HTTPException(401, "Demo session expired or missing")
    return demo_data()


@app.post("/api/demo/logout")
def logout_demo_session(request: Request, response: Response):
    check_browser_origin(request)
    token = request.cookies.get(COOKIE_NAME)
    if not demo_record(request):
        raise HTTPException(401, "No active demo session")
    if not request.app.state.demo_sessions.verify_csrf(
        token, request.headers.get("X-Attendly-CSRF")
    ):
        raise HTTPException(403, "Invalid CSRF token")
    request.app.state.demo_sessions.revoke(token)
    response.delete_cookie(key=COOKIE_NAME, path="/api", secure=PRODUCTION, samesite="strict")
    return {"active": False, "mode": "demo"}


@app.get("/api/auth/captcha")
def captcha_disabled():
    raise HTTPException(status_code=503, detail="Live ERP integration is not enabled")


@app.post("/api/auth/login")
def login_disabled():
    raise HTTPException(status_code=503, detail="Live ERP integration is not enabled")


@app.get("/api/attendance")
def attendance_disabled():
    raise HTTPException(status_code=401, detail="ERP login integration not configured")
