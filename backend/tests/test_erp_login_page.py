"""Synthetic samples only: no ERP passwords, live cookies or CSRF tokens."""
import pytest
from app.erp_login_page import LoginDiscoveryError, discover_login_form


def page(action="/index.php?r=site%2Flogin", captcha="/index.php?r=site%2Fcaptcha&v=sample-random", csrf="TEST_ONLY_CSRF_VALUE"):
    return f"""<html><body><form method="post" action="{action}">
      <input name="_csrf" type="hidden" value="{csrf}">
      <input name="LoginForm[username]">
      <input name="LoginForm[password]" type="password">
      <img id="loginform-captcha-image" src="{captcha}">
      <input name="LoginForm[captcha]">
      <input name="LoginForm[qr_code]">
      <button name="login-button">Login</button>
    </form></body></html>"""


def test_yii_login_metadata():
    form = discover_login_form(page())
    assert form.action_url == "https://newerp.kluniversity.in/index.php?r=site%2Flogin"
    assert form.captcha_url == "https://newerp.kluniversity.in/index.php?r=site%2Fcaptcha&v=sample-random"
    assert form.csrf == "TEST_ONLY_CSRF_VALUE"
    assert "TEST_ONLY_CSRF_VALUE" not in repr(form)


def test_external_action_not_accepted():
    with pytest.raises(LoginDiscoveryError, match="External or insecure"):
        discover_login_form(page(action="https://example.org/steal"))


def test_external_captcha_not_accepted():
    with pytest.raises(LoginDiscoveryError, match="External or insecure"):
        discover_login_form(page(captcha="//example.org/captcha"))


def test_missing_csrf_is_rejected():
    with pytest.raises(LoginDiscoveryError, match="CSRF"):
        discover_login_form(page(csrf=""))


def test_missing_captcha_is_rejected():
    with pytest.raises(LoginDiscoveryError, match="CAPTCHA"):
        discover_login_form(page(captcha="").replace('src=""', ""))


def test_incomplete_login_form_is_rejected():
    with pytest.raises(LoginDiscoveryError, match="fields"):
        discover_login_form("<html><form><input name='LoginForm[username]'></form></html>")


def test_disallow_insecure_origin():
    with pytest.raises(LoginDiscoveryError, match="External or insecure"):
        discover_login_form(page(), "http://newerp.kluniversity.in/index.php")
