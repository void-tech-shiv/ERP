"""Short-lived, demo-only browser sessions.

This module NEVER handles ERP credentials. It provides a security-scaffold
for the attendance dashboard while real university integration remains off.
All state is in-process and must not be used for public production traffic.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
from dataclasses import dataclass
from typing import Callable


class DemoRateLimited(Exception):
    pass


class DemoCapacityReached(Exception):
    pass


@dataclass(frozen=True)
class DemoSession:
    csrf: str
    expires_at: float


class DemoSessions:
    def __init__(
        self,
        *,
        ttl_seconds: int = 3600,
        window_seconds: int = 60,
        max_starts_per_window: int = 12,
        max_sessions: int = 2000,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if min(ttl_seconds, window_seconds, max_starts_per_window, max_sessions) < 1:
            raise ValueError("Demo session settings must be positive")
        self.ttl_seconds = ttl_seconds
        self.window_seconds = window_seconds
        self.max_starts_per_window = max_starts_per_window
        self.max_sessions = max_sessions
        self._clock = clock
        self._lock = threading.RLock()
        self._sessions: dict[str, DemoSession] = {}
        self._starts: dict[str, list[float]] = {}

    @staticmethod
    def _key(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def _prune(self, now: float) -> None:
        self._sessions = {
            key: session for key, session in self._sessions.items()
            if session.expires_at > now
        }
        self._starts = {
            ip: active for ip, history in self._starts.items()
            if (active := [t for t in history if now - t < self.window_seconds])
        }

    def create(self, client_id: str, prior_token: str | None = None) -> tuple[str, DemoSession]:
        """Rotate a demo session and enforce a local per-client start limit."""
        now = self._clock()
        with self._lock:
            self._prune(now)
            attempts = self._starts.get(client_id, [])
            if len(attempts) >= self.max_starts_per_window:
                raise DemoRateLimited()
            if len(self._sessions) >= self.max_sessions:
                raise DemoCapacityReached()
            self._starts.setdefault(client_id, []).append(now)
            if prior_token:
                self._sessions.pop(self._key(prior_token), None)
            token = secrets.token_urlsafe(32)
            session = DemoSession(
                csrf=secrets.token_urlsafe(32),
                expires_at=now + self.ttl_seconds,
            )
            self._sessions[self._key(token)] = session
            return token, session

    def get(self, token: str | None) -> DemoSession | None:
        if not token or len(token) > 256:
            return None
        now = self._clock()
        with self._lock:
            session = self._sessions.get(self._key(token))
            if session is None:
                return None
            if session.expires_at <= now:
                self._sessions.pop(self._key(token), None)
                return None
            return session

    def verify_csrf(self, token: str | None, submitted: str | None) -> bool:
        session = self.get(token)
        return (session is not None and submitted is not None
                and hmac.compare_digest(session.csrf, submitted))

    def revoke(self, token: str | None) -> None:
        if not token:
            return
        with self._lock:
            self._sessions.pop(self._key(token), None)

    def clear(self) -> None:
        with self._lock:
            self._sessions.clear()
            self._starts.clear()
