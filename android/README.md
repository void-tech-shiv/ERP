# Attendly Android — original ERP app with a mobile theme

This Android v0.3.0 restores the **existing Attendly ERP-connected application**, replacing the mistakenly added offline/sample dashboard from v0.2.0.

The WebView opens the existing protected Attendly Cloudflare staging application, with its authentic login and manually completed CAPTCHA. After authentication, the existing ERP Overview, Attendance, CGPA, Exam Seating, Timetable and Settings are unchanged.

The Android app adds **presentation-only** assets:
- A navy slide-out drawer using the original six navigation entries
- Mint highlights, rounded cards and navy page accents inspired by the reference screenshots
- A hamburger menu and tap-outside/Android-back dismissal

It **does not** add tasks, invented attendance, local grade inputs or mock data. The original ERP session, attendance cache, settings (nickname, semester and default-hidden CGPA), API requests, logout and CAPTCHA all remain in the hosted app.

Only the trusted Attendly app origin receives the appearance JavaScript. The Cloudflare Access identity page is never modified, and other external links open in the device browser. TLS errors are blocked. No passwords or ERP secrets are embedded in the APK.

This is still a **debug APK for private testing**. Cloudflare Access remains enabled and public student ERP login is not authorized.
