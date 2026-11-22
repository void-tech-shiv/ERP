"""Contract for a future, authorized NewERP integration.

Do not guess ERP endpoints or bypass CAPTCHA.
Passwords and CAPTCHA responses must never be persisted.
Each student's ERP session must remain isolated on the backend.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from .calculator import Course


@dataclass(frozen=True)
class CaptchaChallenge:
    challenge_id: str  # Opaque ID; session secrets stay on server.
    image_bytes: bytes
    mime_type: str


class ErpAdapter(ABC):
    @abstractmethod
    async def new_challenge(self) -> CaptchaChallenge:
        """Create an isolated session and retrieve that session's CAPTCHA."""

    @abstractmethod
    async def authenticate(
        self, challenge_id: str, student_id: str, password: str, captcha: str
    ) -> str:
        """Submit login in the same challenge session; return opaque local handle."""

    @abstractmethod
    async def attendance(self, session_handle: str) -> list[Course]:
        """Retrieve the signed-in student's LTPS conducted and attended counts."""

    @abstractmethod
    async def logout(self, session_handle: str) -> None:
        """Destroy the isolated backend session and invalidate cached access."""
