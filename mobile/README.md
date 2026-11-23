# Attendly Mobile (Expo SDK 58)

Phase 1 is an Android-first Expo / React Native app that embeds the existing
Attendly Next.js student workspace with a restricted first-party WebView.
Its existing login, Overview, Attendance, CGPA, Exam Seating, Timetable
and Settings views remain functional if the Attendly server is reachable.

This is a mobile starter, not yet a fully native screen-by-screen conversion
and not a public production release.

## Why use a WebView first?

The current Attendly server authenticates with the university ERP using a
same-origin anti-CSRF check and an HttpOnly session cookie. A direct
React Native API client would need a separately designed mobile-auth flow.
The first release keeps these security properties by running the existing
login and authenticated dashboard inside the same origin.

No user passwords, CAPTCHA answers or ERP tokens are sent through a
React Native JavaScript bridge. CAPTCHA is solved manually as usual.

## Run on Android with Expo Go

Requirements: Node.js 22.13 or later; npm; Android phone with Expo Go
matching SDK 58; the existing Attendly Next.js server accessible from phone.

1. Switch the repository to branch attendly-mobile-mvp.
2. In the mobile directory, run:

    npm install
    copy .env.example .env

3. Edit mobile/.env to specify EXPO_PUBLIC_ATTENDLY_URL.
   Use the exact HTTPS URL where your own Attendly web app is hosted,
   not the KL University ERP login URL.

   For temporary Expo Go testing on the same Wi-Fi you can try your
   laptop's private IPv4 address, for example http://10.136.27.1:3000/.
   Your phone must be able to open that address; localhost on a phone
   refers to the phone itself. LAN HTTP may be blocked by a native
   client or platform policy; production builds require HTTPS.

4. In one terminal, start the existing web server from frontend:

    npm run dev

5. In another terminal, from mobile, run:

    npm run check
    npm start

6. Scan the Expo QR code from Expo Go; sign in using your own authorized
   ERP account. The mobile shell must not collect passwords separately.

## Verify before a test APK

- Run npm run typecheck.
- Run npm test.
- Run npx expo install --check.
- Verify login, attendance, CGPA visibility, exam seating, timetable,
  Settings and logout on an actual Android phone.
- Verify navigation cannot leave the configured Attendly origin.
- If login returns ERP_LOGIN_UNAVAILABLE or ERP_LOGIN_TIMEOUT, debug the
  backend ERP proxy, not the mobile screen.

## Build Android test APK

After publishing a stable, HTTPS-accessible Attendly deployment:

1. Configure EXPO_PUBLIC_ATTENDLY_URL in the EAS build environment.
2. Run npx eas-cli@latest login and npx eas-cli@latest build:configure.
3. Run npx eas-cli@latest build -p android --profile preview.
4. Download the build from EAS for private device testing.

Do not upload a public student app until the backend has a reliable
authorized integration and privacy/security review. Attendly is an
independent student project, not endorsed by KL University.

## Technical restrictions

- Trusted site URL is set by the builder, not by student input.
- Release requires HTTPS; unencrypted HTTP only permitted by JavaScript
  policy for private-network Expo development, not Android APK release.
- Third-party cookies, mixed content and extra browser windows disabled.
- External navigations blocked, including arbitrary login sites.
- No native persistence of ERP usernames, passwords or CAPTCHA.
- Use normal first-party server session expiry and manual CAPTCHA.

## Next development phases

Native Overview/attendance UI, a secure dedicated mobile login API with
properly defined sessions, native timetable cards, grade privacy,
exam seating, Settings, and opt-in reminders.
