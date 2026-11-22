# KL University LTPS Attendance Calculator

Independent, student-focused attendance dashboard (prototype).

## Current status
Phase 1: weighted attendance dashboard. Phase 2: HTML response parsing. Phase 3: isolated session/CAPTCHA/login/attendance engine validated against synthetic ERP responses. **The public API is still disabled and this repository has not been validated against the real KL NewERP login.** Never enter real ERP credentials into an unverified demo.

## Calculation
- Lecture (L): 100%
- Tutorial (T): 50%
- Practical (P): 50%
- Skill (S): 25%

`attendance = 100 * sum(attended[type] * weight[type]) / sum(conducted[type] * weight[type])`

For recovery and bunk predictions, future classes must be simulated by LTPS component; each component contributes a different weight.

## Architecture
- Frontend: mobile-responsive Next.js app
- Backend: Python FastAPI
- Local cache: IndexedDB for attendance data only
- Future ERP adapter: consent-based, server-side per-student sessions; CAPTCHA answered by the student, no permanent ERP password storage

## Before ERP integration
We need authorized, **redacted** Network request/response samples for:
1. Starting an ERP login session and receiving a CAPTCHA.
2. Submitting the student-entered CAPTCHA on the *same* session.
3. ~~Reading the Attendance Register's attended/conducted LTPS records.~~ Confirmed: Yii GridView HTML table from the `courselist` route; parsed by `backend/app/erp_parser.py`.
4. Refreshing/logout, session expiry, and permissions.

**Never commit or share student passwords, cookies, CSRF tokens, or unredacted personal attendance records.**

This is a third-party prototype and is not affiliated with or endorsed by KL University. University authorization and a security/privacy review are required before public student login is enabled.


## Running Phase 1

Backend (Python 3.11+):

```bash
cd backend
python -m venv .venv
# activate the environment
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
pytest -q
```

Frontend (Node.js 20+):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. Backend API docs: http://localhost:8000/api/docs.

Demo subject records are sample data, not from NewERP. Recovery/bunk estimates assume future classes all belong to one selected LTPS component and do not guarantee university eligibility.

## Verified ERP attendance response (November 2026)

From an authorized user's **redacted** DevTools inspection, the Attendance Register invokes
`index.php?r=studentattendance%2Fstudentdailyattendance%2Fcourselist`.
It returns **HTML**, not JSON; rows contain Coursecode, Coursedesc, Ltps, Section,
Year, Semester, Total Conducted and Total Attended. Its form payload has
`_csrf`, `DynamicModel[academicyear]`, and `DynamicModel[semesterid]`.

**Do not hardcode** term IDs or CSRF values. Resolve them from the authenticated
session and the university page, with permission; CSRF tokens and ERP cookies
must remain session-scoped on the backend. Do not log or commit raw responses:
Register links include student-specific opaque identifiers.

`parse_course_list_html(html)` extracts and validates counts, groups L/T/P/S
by course, discards all links, and rejects duplicate rows, malformed counts,
mixed terms and login pages. Use this parser from the future ERP adapter,
after that adapter has obtained an authorized response. There is **no public
HTML-upload endpoint** and no live-login endpoint in this prototype.

Run `cd backend && python -m pytest -q` to test parser and calculator.

## Verified ERP login and CAPTCHA requests (November 2026)

Redacted DevTools evidence suggests the university login POST goes to
`index.php?r=site%2Flogin` with these form **names**:
`_csrf`, `LoginForm[username]`, `LoginForm[password]`,
`LoginForm[captcha]`, optional `LoginForm[qr_code]`, and `login-button`.
The successful observed flow returned HTTP 302 then the student dashboard.

The CAPTCHA image is requested from `index.php?r=site%2Fcaptcha&v=...`;
the `v` value is dynamic and should not be hardcoded. It appears as an image
request (HTTP 200, PNG). `yii.captcha.js` is not the CAPTCHA image.

The next integration requires a university-authorized HTTP session whose
initial login page, CAPTCHA image, login submission, and later attendance request
**all share the correct server-side session cookies**. Never bypass CAPTCHA or
send tokens/passwords to the browser cache. After login, verify the authenticated
user, not merely a redirect status.

`backend/app/erp_login_page.py` offers an offline parser for a same-origin
login form, CSRF field, and CAPTCHA image URL. It does not perform live
requests. Its unit tests use only synthetic HTML.

The public application must **not** accept students' ERP credentials until
University access permission and independent security review are complete.

## Phase 3: isolated session engine (offline-tested)

`backend/app/session_manager.py` implements the *internal* ERP request sequence.
It is **not imported by any public FastAPI authentication route**. No real
student IDs, passwords or CAPTCHA answers were used during development.

- `new_challenge()`: creates a separate HTTP cookie jar for one student,
  fetches login HTML and session-bound CAPTCHA bytes, generates an opaque
  challenge handle (5-minute default lifetime).
- `authenticate(challenge, id, password, student_entered_captcha)`:
  submits the student's input alongside the session CSRF to the observed
  login route. A redirect is insufficient: the resulting dashboard must
  display a matching student ID. The challenge is consumed after one try.
- `available_terms(session)`: dynamically reads semester/year *labels*
  and their internal option IDs. No hardcoded `29` or `2` in application logic.
- `attendance(session, year_label, semester_label)`: reads a fresh
  session CSRF and term IDs; posts the known course-list request in the same
  cookie jar; passes the returned HTML through the safe LTPS parser.
- `logout(session)`: destroys the in-memory session and closes its HTTP
  client. Challenge TTL defaults to 5 minutes; authenticated session TTL to
  30 minutes. Handle values must **never** be saved to localStorage.

**Verification status:** 7 new tests passed locally against an
`httpx.MockTransport` fake ERP. GitHub CI validation and behavior
against the actual university website are **not yet verified**.
Real-world integration may require adjustments to Yii's CAPTCHA/session
behavior, form HTML, dynamic term options and logout semantics.

**Why public login stays disabled:** this is a prototype-level in-process
store, not a production multi-instance session service. It lacks distributed
encrypted storage, app-cookie authentication, cross-site request protections,
rate limiting, operational monitoring, and institution-approved access.
ERP credentials must not be entered into the demo. A real deployment needs
university authorization, privacy notice, student consent, independent security
review and live testing with a specifically approved test account.

Run locally:

```bash
cd backend
python -m pip install -r requirements.txt
python -m pytest -q
```
