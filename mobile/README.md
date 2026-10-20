# Axiom Mobile foundation

This package is the local Capacitor client target. It deliberately does not use `server.url` and does not embed server secrets.

## Commands

```powershell
npm.cmd install
npm.cmd run android:sync:staging
npm.cmd run android:debug:staging
```

Generic `cap:sync`, `android:sync`, and `android:debug` commands intentionally fail. Android bundles must always name their environment so a generic Vite build cannot silently replace the configured staging bundle.

## Local Android staging bridge

The checked-in `android-staging` Vite mode uses `https://localhost:3443`. This address is only for local Android emulator development, where `adb reverse tcp:3443 tcp:3443` connects the emulator's localhost to a developer-machine HTTPS proxy backed by the isolated staging server.

It is **not** a physical-device, shared-staging, release, or production endpoint. A physical device and every release build require a separately reviewed, publicly reachable HTTPS staging/production origin and a distinct explicit build target. Do not substitute the production URL into the local staging file.

The local proxy certificate, private key, staging credentials, and other machine-specific files stay under ignored local paths and must never be committed. `VITE_*` values are public build-time configuration and must never contain API keys, passwords, refresh tokens, service-role credentials, or OAuth secrets.

Typical local emulator flow:

```powershell
# Terminal 1, repository root: isolated staging Next.js server
npm.cmd run dev:staging:mobile

# Terminal 2: local HTTPS proxy provisioned in the ignored developer directory
node .local-android-user/https-proxy.mjs

# Forward the emulator port, then build/sync the explicit staging target
adb reverse tcp:3443 tcp:3443
npm.cmd --prefix mobile run android:debug:staging
```

The current debug APK is emitted at `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Installing it with `adb install -r` updates the app without deliberately clearing Android Keystore-backed session data.

The shell includes native network state, Android Keystore-backed refresh-session storage, credentials login, system-browser Google OAuth/PKCE wiring, session restore, logout, and the first ACL-filtered Process/Action workspace screen. The backend remains the existing Next.js application and the feature is disabled unless `AXIOM_MOBILE_AUTH_ENABLED=true`.

Before a real staging login, apply `20261021010000_mobile_auth_foundation.sql` to staging only and configure the server-only mobile auth variables shown in the root `.env.example`. Build the client with an exact HTTPS `VITE_AXIOM_API_ORIGIN`; this public origin is not a secret.

## Security boundary

- Do not add `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, OAuth secrets, or other server secrets to `VITE_*` variables.
- The API origin must be HTTPS and allow only the app's explicit origin/app identity.
- OAuth must use the system browser, PKCE, an HTTPS App/Universal Link, and a one-time server-side code exchange.
- Session refresh material must be stored with Android Keystore / iOS Keychain-backed storage, not localStorage.

Google OAuth requires an approved HTTPS host, an Android App Link intent filter, and matching `/.well-known/assetlinks.json`. Those deployment-bound files are intentionally not fabricated in the foundation build; add them after the staging host and signing certificate fingerprint are approved.

The React/TypeScript client, mobile API contracts, and domain types are shared across Android and the future iOS target. Secure credential storage, verified links, push notifications, and platform lifecycle integrations remain small native adapters (Android Keystore/App Links versus iOS Keychain/Universal Links).
