"""Offline HTTP tests: every request is intercepted, nothing reaches real ERP."""
from urllib.parse import parse_qs
import httpx
import pytest
from app.session_manager import ErpFlowError, ErpSessionManager

LOGIN_HTML = '''<html><form method="post" action="/index.php?r=site%2Flogin">
<input name="_csrf" value="SYNTHETIC-CSRF">
<input name="LoginForm[username]"><input name="LoginForm[password]">
<input name="LoginForm[captcha]"><input name="LoginForm[qr_code]">
<img id="loginform-captcha-image" src="/index.php?r=site%2Fcaptcha&amp;v=123">
</form></html>'''
TERM_HTML = '''<form><input name="_csrf" value="ATTENDANCE-ONLY-CSRF" />
<select name="DynamicModel[academicyear]">
<option value="">Choose</option><option value="29">2026-2027</option></select>
<select name="DynamicModel[semesterid]">
<option value="1">Odd Sem</option><option value="2">Even Sem</option></select></form>'''
TABLE_HTML = '''<table><thead><tr><th>#</th><th>Coursecode</th><th>Coursedesc</th><th>Ltps</th>
<th>Section</th><th>Year</th><th>Semester</th><th>Fr Date</th><th>Total Conducted</th>
<th>Total Attended</th><th>Total Absent</th><th>Tcbr</th><th>Percentage</th>
<th>Attendance Register</th></tr></thead><tbody>
<tr><td>1</td><td>EX101</td><td>Demo Data Science</td><td>L</td><td>A</td><td>2026-2027</td><td>Even Sem</td><td>N</td><td>10</td><td>8</td><td>2</td><td>0</td><td>80%</td><td><a href="/private?token=NEVER-RETURN">Register</a></td></tr>
<tr><td>2</td><td>EX101</td><td>Demo Data Science</td><td>P</td><td>B</td><td>2026-2027</td><td>Even Sem</td><td>N</td><td>4</td><td>4</td><td>0</td><td>0</td><td>100%</td><td>Register</td></tr>
</tbody></table>'''


class FakeERP:
    def __init__(self):
        self.counter = 0
        self.logged_in = set()
        self.login_attempts = []
        self.captcha_cookies = []
        self.attendance_cookies = []
        self.force_bad_login = False
        self.force_external_redirect = False
        self.fail_terms = False

    def client_factory(self):
        return httpx.AsyncClient(
            transport=httpx.MockTransport(self.handle), follow_redirects=False
        )

    def handle(self, req: httpx.Request) -> httpx.Response:
        path = req.url.path
        route = req.url.params.get("r", "")
        cookie = req.headers.get("cookie", "")
        if path != "/index.php":
            return httpx.Response(404)
        if not route:
            self.counter += 1
            return httpx.Response(
                200, content=LOGIN_HTML,
                headers={
                    "set-cookie": f"ERPSESSION=s{self.counter}; Path=/; Secure; HttpOnly",
                    "content-type": "text/html"
                },
            )
        if route == "site/captcha":
            self.captcha_cookies.append(cookie)
            assert "ERPSESSION=s" in cookie
            return httpx.Response(
                200, content=b"\x89PNG\r\n\x1a\nFAKE",
                headers={"content-type": "image/png"},
            )
        if route == "site/login" and req.method == "POST":
            data = parse_qs(req.content.decode("utf-8"), keep_blank_values=True)
            self.login_attempts.append((cookie, data))
            if (self.force_bad_login or data["_csrf"] != ["SYNTHETIC-CSRF"]
                    or data["LoginForm[captcha]"] != ["human"]):
                return httpx.Response(200, content=LOGIN_HTML)
            if self.force_external_redirect:
                return httpx.Response(
                    302, headers={"location": "https://evil.example/private"}
                )
            self.logged_in.add(cookie)
            return httpx.Response(
                302, headers={"location": "/index.php?r=site%2Findexindi"}
            )
        if route == "site/indexindi":
            if cookie not in self.logged_in:
                return httpx.Response(200, content=LOGIN_HTML)
            user = self.login_attempts[-1][1]["LoginForm[username]"][0]
            return httpx.Response(200, content=f"<div>Welcome {user}</div>")
        if route == "studentattendance/studentdailyattendance/searchgetinput":
            if cookie not in self.logged_in:
                return httpx.Response(200, content=LOGIN_HTML)
            if self.fail_terms:
                return httpx.Response(200, content="<html>Oops</html>")
            return httpx.Response(200, content=TERM_HTML)
        if route == "studentattendance/studentdailyattendance/courselist":
            self.attendance_cookies.append(cookie)
            data = parse_qs(req.content.decode("utf-8"))
            assert cookie in self.logged_in
            assert data["_csrf"] == ["ATTENDANCE-ONLY-CSRF"]
            assert data["DynamicModel[academicyear]"] == ["29"]
            assert data["DynamicModel[semesterid]"] == ["2"]
            assert req.headers.get("x-requested-with") == "XMLHttpRequest"
            return httpx.Response(200, content=TABLE_HTML)
        return httpx.Response(404)


@pytest.mark.asyncio
async def test_complete_two_student_flow_and_isolation():
    fake = FakeERP()
    manager = ErpSessionManager(fake.client_factory)
    one = await manager.new_challenge()
    two = await manager.new_challenge()
    assert one.challenge_id != two.challenge_id
    assert one.mime_type == "image/png"
    assert len(set(fake.captcha_cookies)) == 2
    token1 = await manager.authenticate(
        one.challenge_id, "2500000001", "PRIVATE_PASSWORD_1", "human"
    )
    token2 = await manager.authenticate(
        two.challenge_id, "2500000002", "PRIVATE_PASSWORD_2", "human"
    )
    assert token1 != token2
    with pytest.raises(ErpFlowError, match="invalid"):
        await manager.authenticate(
            one.challenge_id, "2500000001", "PRIVATE_PASSWORD_1", "human"
        )
    terms = await manager.available_terms(token1)
    assert terms["years"] == ["2026-2027"]
    assert terms["semesters"] == ["Odd Sem", "Even Sem"]
    c1 = await manager.attendance(token1, "2026-2027", "Even Sem")
    c2 = await manager.attendance(token2, "2026-2027", "Even Sem")
    assert c1[0].components["L"].attended == 8
    assert c1[0].components["P"].conducted == 4
    assert "NEVER-RETURN" not in repr(c1)
    assert c1 == c2
    assert len(set(fake.attendance_cookies)) == 2
    await manager.logout(token1)
    with pytest.raises(ErpFlowError, match="invalid"):
        await manager.attendance(token1, "2026-2027", "Even Sem")
    assert len(await manager.attendance(token2, "2026-2027", "Even Sem")) == 1
    await manager.close_all()


@pytest.mark.asyncio
async def test_authentication_failed_and_challenge_consumed():
    fake = FakeERP()
    fake.force_bad_login = True
    manager = ErpSessionManager(fake.client_factory)
    challenge = await manager.new_challenge()
    with pytest.raises(ErpFlowError, match="login failed"):
        await manager.authenticate(challenge.challenge_id, "2500000001", "bad", "human")
    with pytest.raises(ErpFlowError, match="invalid"):
        await manager.authenticate(challenge.challenge_id, "2500000001", "bad", "human")


@pytest.mark.asyncio
async def test_reject_upstream_external_redirect():
    fake = FakeERP()
    fake.force_external_redirect = True
    manager = ErpSessionManager(fake.client_factory)
    challenge = await manager.new_challenge()
    with pytest.raises(ErpFlowError, match="login failed"):
        await manager.authenticate(challenge.challenge_id, "2500000001", "password", "human")


@pytest.mark.asyncio
async def test_expiry_cleanup_and_invalid_handle():
    fake = FakeERP()
    now = [10.0]
    manager = ErpSessionManager(
        fake.client_factory, challenge_ttl=10, clock=lambda: now[0]
    )
    challenge = await manager.new_challenge()
    now[0] = 21.0
    with pytest.raises(ErpFlowError, match="expired"):
        await manager.authenticate(challenge.challenge_id, "2500000001", "password", "human")


@pytest.mark.asyncio
async def test_capacity_limit():
    fake = FakeERP()
    manager = ErpSessionManager(fake.client_factory, max_sessions=1)
    await manager.new_challenge()
    with pytest.raises(ErpFlowError, match="Too many"):
        await manager.new_challenge()
    await manager.close_all()


@pytest.mark.asyncio
async def test_only_known_academic_options_accepted():
    fake = FakeERP()
    manager = ErpSessionManager(fake.client_factory)
    challenge = await manager.new_challenge()
    token = await manager.authenticate(challenge.challenge_id, "2500000001", "password", "human")
    with pytest.raises(ErpFlowError, match="retrieve"):
        await manager.attendance(token, "2023-2024", "Even Sem")
    assert fake.attendance_cookies == []
    await manager.close_all()


@pytest.mark.asyncio
async def test_missing_term_selection_fails_closed():
    fake = FakeERP()
    fake.fail_terms = True
    manager = ErpSessionManager(fake.client_factory)
    challenge = await manager.new_challenge()
    token = await manager.authenticate(challenge.challenge_id, "2500000001", "password", "human")
    with pytest.raises(ErpFlowError, match="term options"):
        await manager.available_terms(token)
    await manager.close_all()
