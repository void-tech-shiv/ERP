# Attendly Android (debug wrapper)

A minimal Android WebView wrapper for the live Attendly Cloudflare Worker.

The in-app URL is currently the **owner-only Cloudflare Access staging environment**. This APK does **not** bypass Cloudflare Access. It is **not a public student release**; the ERP integration must be reviewed and authorized before it can accept credentials from the general public.

## GitHub Actions APK
Open **Actions → Attendly Android debug APK → latest successful run → Artifacts → Attendly-Android-debug-apk**. The ZIP contains `app-debug.apk`. The workflow runs when these Android files change or through **Run workflow**.

## Local build
Use Android Studio with JDK 17 or Gradle 8.11.1 and Android SDK 35:

```bash
gradle -p android :app:assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

## Security
- No passwords, keys, or ERP session tokens are embedded in the APK.
- Only the known Attendly host and Cloudflare Access login host open inside the WebView; other links open in the Android browser.
- Invalid TLS certificates are rejected; mixed-content and file access are disabled.
- Cookies belong to Android WebView and are managed by the underlying Android system.
- This is a **debug-signed test APK**, not a Play Store release. Create and protect a stable release keystore before distributing to students.

Before enabling public ERP logins, confirm university authorization, an independent privacy/security review, account-level rate limiting, anti-abuse monitoring, a privacy notice, and a verified per-student consent flow.
