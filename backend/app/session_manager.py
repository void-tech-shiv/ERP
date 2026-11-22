"""Isolated upstream ERP session engine, NOT connected to public API routes.

Requires university authorization and a security review before enabling any
real credential flow. CAPTCHA is always solved by the human student.

A session owns one httpx cookie jar; no passwords, CSRF values, cookies,
or raw response HTML are returned or persisted by this module.

This in-process store is for offline integration tests and a single-worker
prototype ONLY. Production requires a shared encrypted session store,
rate limiting, audit controls, and explicit user consent.
"""
from __future__ import annotations

import asyncio
import re
import secrets
import time
from dataclasses import dataclass, field
from typing import Callable
from urllib.parse import urlsplit

import httpx
from bs4 import BeautifulSoup

from .calculator import Course
from .erp_adapter import CaptchaChallenge, ErpAdapter
from .erp_login_page import LoginFormMetadata, LoginDiscoveryError, _erp_url, discover_login_form
from .erp_parser import AttendanceParseError, parse_course_list_html

ERP_BASE = "https://newerp.kluniversity.in"
ERP_LOGIN_PAGE = f"{ERP_BASE}/index.php"
ERP_ATTENDANCE_PAGE = f"{ERP_BASE}/index.php?r=studentattendance%2Fstudentdailyattendance%2Fsearchgetinput"
ERP_COURSELIST = f"{ERP_BASE}/index.php?r=studentattendance%2Fstudentdailyattendance%2Fcourselist"


class ErpFlowError(Exception):
    """A safe error without upstream response contents or secrets."""


@dataclass
class _Session:
    client: httpx.AsyncClient = field(repr=False)
    form: LoginFormMetadata = field(repr=False)
    expires_at: float = field(repr=False)
    authenticated: bool = False
    lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)


class ErpSessionManager(ErpAdapter):
    """Opaque challenge/session handles and isolated HTTP clients per student.

    All upstream HTTP calls are restricted to the known HTTPS ERP origin.
    No live transport is invoked just by importing or constructing this class.
    """

    def __init__(
        self,
        client_factory: Callable[[], httpx.AsyncClient] | None = None,
        *,
        challenge_ttl: int = 300,
        session_ttl: int = 1800,
        max_sessions: int = 100,
        clock: Callable[[], float] = time.monotonic,
    ):
        if min(challenge_ttl, session_ttl, max_sessions) < 1:
            raise ValueError("TTL and session limit must be positive")
        self._factory = client_factory or (lambda: httpx.AsyncClient(
            timeout=httpx.Timeout(15.0), follow_redirects=False, trust_env=False,
            limits=httpx.Limits(max_connections=5),
        ))
        self._sessions: dict[str, _Session] = {}
        self._registry_lock = asyncio.Lock()
        self._challenge_ttl = challenge_ttl
        self._session_ttl = session_ttl
        self._max_sessions = max_sessions
        self._clock = clock

    async def _get(self, session: _Session, url: str, **kwargs) -> httpx.Response:
        return await session.client.get(_erp_url(ERP_LOGIN_PAGE, url), follow_redirects=False, **kwargs)

    async def _post(self, session: _Session, url: str, **kwargs) -> httpx.Response:
        return await session.client.post(_erp_url(ERP_LOGIN_PAGE, url), follow_redirects=False, **kwargs)

    async def _reap(self) -> None:
        async with self._registry_lock:
            expired = [key for key, value in self._sessions.items()
                       if value.expires_at <= self._clock()]
            old = [self._sessions.pop(key) for key in expired]
        for session in old:
            async with session.lock:
                await session.client.aclose()

    async def _lookup(self, handle: str, authenticated: bool) -> _Session:
        await self._reap()
        async with self._registry_lock:
            session = self._sessions.get(handle)
        if session is None or session.authenticated is not authenticated:
            raise ErpFlowError("Session expired or invalid")
        return session

    async def new_challenge(self) -> CaptchaChallenge:
        await self._reap()
        async with self._registry_lock:
            if len(self._sessions) >= self._max_sessions:
                raise ErpFlowError("Too many active sessions")
        client = self._factory()
        try:
            response = await client.get(ERP_LOGIN_PAGE, follow_redirects=False)
            if response.status_code != 200 or len(response.content) > 1_000_000:
                raise ErpFlowError("ERP login page unavailable")
            form = discover_login_form(response.text, str(response.url))
            image = await client.get(form.captcha_url, follow_redirects=False)
            mime = image.headers.get("content-type", "").split(";", 1)[0].lower().strip()
            if (image.status_code != 200 or mime not in ("image/png", "image/jpeg")
                    or not (0 < len(image.content) <= 250_000)):
                raise ErpFlowError("ERP CAPTCHA image unavailable")
            handle = secrets.token_urlsafe(32)
            entry = _Session(client=client, form=form,
                             expires_at=self._clock() + self._challenge_ttl)
            async with self._registry_lock:
                if len(self._sessions) >= self._max_sessions:
                    raise ErpFlowError("Too many active sessions")
                self._sessions[handle] = entry
            return CaptchaChallenge(challenge_id=handle, image_bytes=image.content, mime_type=mime)
        except (httpx.HTTPError, LoginDiscoveryError, ErpFlowError):
            await client.aclose()
            raise ErpFlowError("Could not prepare ERP CAPTCHA") from None
        except BaseException:
            await client.aclose()
            raise

    async def authenticate(self, challenge_id: str, student_id: str,
                           password: str, captcha: str) -> str:
        if not (student_id.isdecimal() and 5 <= len(student_id) <= 24
                and 0 < len(password) <= 256 and 1 <= len(captcha) <= 32):
            raise ErpFlowError("Invalid login fields")
        session = await self._lookup(challenge_id, authenticated=False)
        async with session.lock:
            # Consume challenge before submission: no double login or CAPTCHA replay.
            async with self._registry_lock:
                if self._sessions.pop(challenge_id, None) is not session:
                    raise ErpFlowError("Challenge already consumed")
            try:
                payload = {
                    "_csrf": session.form.csrf,
                    "LoginForm[username]": student_id,
                    "LoginForm[password]": password,
                    "LoginForm[captcha]": captcha,
                    "LoginForm[qr_code]": "",
                    "login-button": "",
                }
                response = await self._post(session, session.form.action_url, data=payload)
                # A redirect alone does not establish successful authentication.
                if response.status_code not in (301, 302, 303):
                    raise ErpFlowError("ERP login was not accepted")
                location = response.headers.get("location", "")
                if not location:
                    raise ErpFlowError("ERP login returned no destination")
                target = _erp_url(str(response.url), location)
                if urlsplit(target).path != "/index.php":
                    raise ErpFlowError("Unexpected ERP login redirect")
                dashboard = await self._get(session, target)
                if dashboard.status_code != 200 or len(dashboard.content) > 1_000_000:
                    raise ErpFlowError("ERP dashboard not accessible")
                # Observed NewERP dashboard says "Welcome <student ID>".
                soup = BeautifulSoup(dashboard.text, "html.parser")
                visible = soup.get_text(" ", strip=True)
                if not re.search(r"\bwelcome\s+" + re.escape(student_id) + r"\b", visible, re.I):
                    raise ErpFlowError("Authenticated student identity not verified")
                new_handle = secrets.token_urlsafe(32)
                session.authenticated = True
                session.expires_at = self._clock() + self._session_ttl
                async with self._registry_lock:
                    self._sessions[new_handle] = session
                return new_handle
            except (httpx.HTTPError, LoginDiscoveryError, ErpFlowError):
                await session.client.aclose()
                raise ErpFlowError("ERP login failed or session expired") from None
            except BaseException:
                await session.client.aclose()
                raise

    @staticmethod
    def _terms(page: str) -> tuple[dict[str, str], dict[str, str], str]:
        soup = BeautifulSoup(page, "html.parser")
        selects = []
        for name in ("DynamicModel[academicyear]", "DynamicModel[semesterid]"):
            select = soup.find("select", attrs={"name": name})
            if select is None:
                raise ErpFlowError("ERP term selection unavailable")
            options: dict[str, str] = {}
            for option in select.find_all("option"):
                label = option.get_text(" ", strip=True)
                value = option.get("value", "")
                if label and str(value).isdecimal() and not option.has_attr("disabled"):
                    options[label] = str(value)
            if not options:
                raise ErpFlowError("ERP term options unavailable")
            selects.append(options)
        csrf = soup.find("input", attrs={"name": "_csrf"})
        meta = soup.find("meta", attrs={"name": "csrf-token"})
        token = (csrf.get("value") if csrf else None) or (meta.get("content") if meta else None)
        if not token:
            raise ErpFlowError("ERP attendance CSRF unavailable")
        return selects[0], selects[1], str(token)

    async def available_terms(self, session_handle: str) -> dict[str, list[str]]:
        session = await self._lookup(session_handle, authenticated=True)
        async with session.lock:
            try:
                response = await self._get(session, ERP_ATTENDANCE_PAGE)
                if response.status_code != 200 or len(response.content) > 1_000_000:
                    raise ErpFlowError("ERP attendance form unavailable")
                years, semesters, _ = self._terms(response.text)
                return {"years": list(years), "semesters": list(semesters)}
            except (httpx.HTTPError, ErpFlowError):
                raise ErpFlowError("Could not read ERP attendance term options") from None

    async def attendance(self, session_handle: str, academic_year: str,
                         semester: str) -> list[Course]:
        session = await self._lookup(session_handle, authenticated=True)
        async with session.lock:
            try:
                response = await self._get(session, ERP_ATTENDANCE_PAGE)
                if response.status_code != 200 or len(response.content) > 1_000_000:
                    raise ErpFlowError("ERP attendance form unavailable")
                years, semesters, csrf = self._terms(response.text)
                if academic_year not in years or semester not in semesters:
                    raise ErpFlowError("Unsupported academic year or semester")
                data = {
                    "_csrf": csrf,
                    "DynamicModel[academicyear]": years[academic_year],
                    "DynamicModel[semesterid]": semesters[semester],
                }
                result = await self._post(session, ERP_COURSELIST, data=data,
                                          headers={"X-Requested-With": "XMLHttpRequest"})
                if result.status_code != 200 or len(result.content) > 2_000_000:
                    raise ErpFlowError("ERP attendance unavailable")
                return parse_course_list_html(result.text)
            except (httpx.HTTPError, AttendanceParseError, ErpFlowError):
                raise ErpFlowError("Could not retrieve ERP attendance") from None

    async def logout(self, session_handle: str) -> None:
        async with self._registry_lock:
            session = self._sessions.pop(session_handle, None)
        if session is not None:
            async with session.lock:
                await session.client.aclose()

    async def close_all(self) -> None:
        async with self._registry_lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for session in sessions:
            async with session.lock:
                await session.client.aclose()
