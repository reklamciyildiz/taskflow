# Axiom Mobile foundation

This package is the local Capacitor client target. It deliberately does not use `server.url` and does not embed server secrets.

## Commands

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run android:sync
npm.cmd run android:debug
```

The shell includes native network state, Android Keystore-backed refresh-session storage, credentials login, system-browser Google OAuth/PKCE wiring, session restore, logout, and the first ACL-filtered Process/Action workspace screen. The backend remains the existing Next.js application and the feature is disabled unless `AXIOM_MOBILE_AUTH_ENABLED=true`.

Before a real staging login, apply `20261021010000_mobile_auth_foundation.sql` to staging only and configure the server-only mobile auth variables shown in the root `.env.example`. Build the client with an exact HTTPS `VITE_AXIOM_API_ORIGIN`; this public origin is not a secret.

## Security boundary

- Do not add `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, OAuth secrets, or other server secrets to `VITE_*` variables.
- The API origin must be HTTPS and allow only the app's explicit origin/app identity.
- OAuth must use the system browser, PKCE, an HTTPS App/Universal Link, and a one-time server-side code exchange.
- Session refresh material must be stored with Android Keystore / iOS Keychain-backed storage, not localStorage.

Google OAuth requires an approved HTTPS host, an Android App Link intent filter, and matching `/.well-known/assetlinks.json`. Those deployment-bound files are intentionally not fabricated in the foundation build; add them after the staging host and signing certificate fingerprint are approved.
