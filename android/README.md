# Attendly Android — Student Workspace

Attendly v0.2.0 is an offline-first mobile dashboard styled after a modern student workspace.

## Implemented screens

- Overview with personalized greeting, sample-data warning, attendance, classes, tasks and privacy-first CGPA
- Expandable navy side drawer and fixed five-tab navigation
- Timetable with weekday selection and editable local class entries
- Attendance with per-subject attended/conducted counts and LTPS-weighted calculations (L=100%, T=50%, P=50%, S=25%)
- Planner with add/complete/delete task actions
- Grades & GPA with default-hidden CGPA
- Settings: nickname, program, university, semester, CGPA, attendance target, theme and sample data toggle
- Separate protected ERP beta link that launches in the phone's external browser

All manually entered information is stored locally on this device, in Android WebView localStorage. Demo records are explicitly labeled as sample data, not fetched ERP records.

## GitHub Actions / APK

Push to main with changes in android/ automatically builds an Android debug APK, uploads it to the workflow, and publishes a public GitHub prerelease with the downloadable APK asset.

Workflow: https://github.com/void-tech-shiv/ERP/actions/workflows/android-apk.yml

## Security

The Android dashboard loads only bundled HTML/CSS/JS from the virtual HTTPS asset origin appassets.androidplatform.net. It does not load remote application JS, collect ERP passwords, or transmit student profile/attendance to a third-party server. External HTTPS pages open in the phone's system browser.

The private ERP beta URL remains behind Cloudflare Access. The APK does not bypass Cloudflare Access or make ERP student sign-in public.

Public use with real ERP credentials remains gated pending university authorization, privacy/security review, rate limits, monitoring and consent controls. This is not an official KL University app or a Play Store release. The APK is debug-signed for testing.
