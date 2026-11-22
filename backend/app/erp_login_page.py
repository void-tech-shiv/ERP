"""Discover login form metadata from a *locally supplied* NewERP HTML page.

This is deliberately a pure parser: it does not send requests, accept student
passwords or enable any live ERP login route. The CSRF token never appears in
logs or API responses. A future authorized backend adapter can use this result
within the same isolated upstream cookie jar.
"""
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

ERP_HOST = "newerp.kluniversity.in"
LOGIN_FIELDS = ("LoginForm[username]", "LoginForm[password]", "LoginForm[captcha]")


class LoginDiscoveryError(ValueError):
    """The login HTML cannot be safely interpreted."""


@dataclass(frozen=True)
class LoginFormMetadata:
    action_url: str
    captcha_url: str
    csrf: str = field(repr=False, compare=False)
    login_fields: tuple[str, ...] = LOGIN_FIELDS


def _erp_url(base_url: str, path: str) -> str:
    url = urljoin(base_url, path)
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.hostname != ERP_HOST or parts.username or parts.password or parts.port not in (None, 443):
        raise LoginDiscoveryError("External or insecure ERP URL rejected")
    return url


def discover_login_form(html: str, page_url: str = "https://newerp.kluniversity.in/index.php") -> LoginFormMetadata:
    """Inspect a login page; keep CSRF and CAPTCHA challenge server-side only."""
    if not isinstance(html, str) or len(html) > 1_000_000:
        raise LoginDiscoveryError("Invalid login HTML size")
    safe_page_url = _erp_url(page_url, "")
    soup = BeautifulSoup(html, "html.parser")
    form = None
    for candidate in soup.find_all("form"):
        names = {el.get("name") for el in candidate.find_all("input")}
        if set(LOGIN_FIELDS).issubset(names):
            form = candidate
            break
    if form is None:
        raise LoginDiscoveryError("Student login form fields not found")
    csrf_el = form.find("input", attrs={"name": "_csrf"})
    if csrf_el is None:
        csrf_el = soup.find("input", attrs={"name": "_csrf"})
    if csrf_el is None or not csrf_el.get("value"):
        raise LoginDiscoveryError("Session CSRF field not found")
    image = next(
        (img for img in soup.find_all("img")
         if "captcha" in str(img.get("src", "")).lower()), None
    )
    if image is None:
        raise LoginDiscoveryError("CAPTCHA image source not found")
    action_url = _erp_url(safe_page_url, str(form.get("action") or safe_page_url))
    captcha_url = _erp_url(safe_page_url, str(image["src"]))
    return LoginFormMetadata(
        action_url=action_url, captcha_url=captcha_url,
        csrf=str(csrf_el["value"]),
    )
