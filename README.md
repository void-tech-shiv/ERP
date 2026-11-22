# KL University LTPS Attendance Calculator

Independent, student-focused attendance dashboard (prototype).

## Current status
Phase 1: weighted attendance calculator and demo dashboard. **This repository does not yet connect to KL NewERP.** Never enter real ERP credentials into an unverified demo.

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
3. Reading the Attendance Register's attended/conducted LTPS records.
4. Refreshing/logout, session expiry, and permissions.

**Never commit or share student passwords, cookies, CSRF tokens, or unredacted personal attendance records.**

This is a third-party prototype and is not affiliated with or endorsed by KL University. University authorization and a security/privacy review are required before public student login is enabled.
