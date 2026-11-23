# Attendly Cloudflare protected ERP login — staging runbook

This document is for the repository's **private Cloudflare staging Worker**, not for an official university application or a publicly available student login service.

## Cloudflare staging setup (completed)

- Worker: `attendly-cloudflare-preview`
- URL: https://attendly-cloudflare-preview.void-tech-shiv.workers.dev/
- Zero Trust Access application: `Attendly Cloudflare Private Staging`.
- Access protects the **whole Worker** (homepage, CAPTCHA, login, session, attendance, terms, CGPA, timetable and seating APIs), not only `/`.
- Access policy: `Attendly staging - only account owner`. The owner must authenticate using Cloudflare Access's email one-time PIN.
- The other Worker in this account has not been assigned this application policy.
- Automated unauthenticated GET and POST checks: `.github/workflows/cloudflare-smoke.yml`.
- Mobile Expo WebView allows only the trusted Attendly origin plus an explicitly configured Cloudflare Access authentication origin.

## Prerequisites before enabling ERP login

**Do not enable the private ERP login test until ALL of these are satisfied:**

1. Cloudflare Access denies unauthenticated requests to `/`, `/api/erp/session`, `/api/erp/challenge` and `/api/erp/login`. Verify the GitHub staging security workflow is green.
2. In the [Cloudflare Workers dashboard](https://dash.cloudflare.com/?to=/:account/workers-and-pages), choose the `attendly-cloudflare-preview` Worker → **Settings** → **Variables and Secrets** → **Add**. Add a **Secret** called `ERP_SESSION_SECRET` with a fresh, randomly generated **64-character hexadecimal** value. For example, generate one *on your own machine* with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Do not put this value in GitHub, documentation, screenshots, chats, browser localStorage, build variables, or mobile env files.
3. Add a **runtime variable** named `ERP_PRIVATE_TEST_ENABLED` with the value `1` to the same Cloudflare Worker. Use the runtime Worker setting, not only the Cloudflare Builds build environment. **Review Cloudflare Builds' existing `ERP_PRIVATE_TEST_ENABLED=0` build variable** and remove it or update it as needed: that build variable is separate from the running Worker's binding and can make configuration confusing.
4. Deploy the Worker changes. Confirm its **runtime bindings** include `ERP_SESSION_SECRET` (Secret) and `ERP_PRIVATE_TEST_ENABLED` (`1`), without printing their values. Recheck after any automated GitHub build.
5. Obtain university permission if required; only test with your own authorized student account. Solve the university CAPTCHA manually. Do not add a CAPTCHA bypass, unattended solver, or student-password database.

To disable ERP testing immediately, set the Worker's runtime `ERP_PRIVATE_TEST_ENABLED` to `0` and deploy. Keep the Access application enabled.

## Manual end-to-end verification (requires owner and authorized ERP credentials)

1. Open the staging URL in a new private browsing session. Cloudflare Access must request an email OTP. Only the configured owner email should be permitted.
2. After the OTP login, verify `GET /api/erp/session` returns `{ "active": false }` when no ERP session exists. If it still returns HTTP 503, verify runtime variables; do not submit passwords until this is resolved.
3. In the Attendly page, choose **Connect to KL ERP**, request a fresh CAPTCHA, and solve it yourself. Sign in using your own student account. Never send the credentials or CAPTCHA text to a collaborator.
4. After a successful ERP login, verify `GET /api/erp/session` returns `active: true` and an expected student ID, without sharing its CSRF token. Confirm the browser contains an HttpOnly `attendly_private_erp` cookie; do not copy its value.
5. Verify `GET /api/erp/terms` succeeds. Then use the UI to verify attendance, CGPA, timetable and seating requests against your own official ERP pages. All data must correspond to the authenticated identity, not mock data.
6. Log out. Verify a subsequent `GET /api/erp/session` reports `active: false`, and academic APIs require reauthentication.
7. Separately, in an unauthenticated browser, verify the staging URL and login API remain behind Cloudflare Access.

**Do not add ERP passwords, Access session cookies, CAPTCHA images/answers, OTPs, CSRF tokens, or raw ERP HTML to CI logs or GitHub issues.** When reporting failures, use HTTP status, a safe error code, and timestamps only.

## Validation scope

Cloudflare Access and build checks can be automated without student credentials. **Real authenticated ERP login, CAPTCHA and profile/data verification cannot be honestly marked as passed until the account owner completes the manual login steps above.** The Access security test does not replace that live authentication test.
