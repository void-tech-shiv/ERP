"""Contract for authorized, session-isolated NewERP integrations."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from .calculator import Course


@dataclass(frozen=True)
class CaptchaChallenge:
    challenge_id: str
    image_bytes: bytes
    mime_type: str


class ErpAdapter(ABC):
    @abstractmethod
    async def new_challenge(self) -> CaptchaChallenge:
        """Start a new isolated session; return human-solvable CAPTCHA image."""

    @abstractmethod
    async def authenticate(self, challenge_id: str, student_id: str,
                           password: str, captcha: str) -> str:
        """Authenticate within the same upstream cookie jar; return opaque handle."""

    @abstractmethod
    async def available_terms(self, session_handle: str) -> dict[str, list[str]]:
        """Return permitted academic year/semester labels, not internal IDs."""

    @abstractmethod
    async def attendance(self, session_handle: str, academic_year: str,
                         semester: str) -> list[Course]:
        """Get authenticated student's LTPS rows for a validated term."""

    @abstractmethod
    async def logout(self, session_handle: str) -> None:
        """Destroy a server-side session and its credentials/cookies."""
