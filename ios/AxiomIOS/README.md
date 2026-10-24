# Axiom iOS shell

This project presents the production Axiom PWA in a minimal SwiftUI/WKWebView
shell. Web, Android TWA, and iOS use the same canonical backend and data at
`https://getaxiomm.vercel.app`. There is no second React frontend and no
Capacitor `server.url` configuration.

## Generate and open the project on macOS

```bash
xcode-select --install
brew install xcodegen
cd /path/to/TaskFlow/ios/AxiomIOS
xcodegen generate
open Axiom.xcodeproj
```

In Xcode:

1. Select the `Axiom` target, choose the Apple Developer Team, and keep bundle
   identifier `com.axiomproductivity.ios`.
2. Confirm Associated Domains contains `applinks:getaxiomm.vercel.app` and
   `webcredentials:getaxiomm.vercel.app`.
3. Connect a Developer Mode iPhone, select it as the run destination, then run.

The Apple Team ID is intentionally not committed or substituted. Until a valid
`APPLE_APP_TEAM_ID` is configured and deployed with separate approval, the
AASA endpoint fails closed with HTTP 404.

## Authentication contract

Google sign-in uses `ASWebAuthenticationSession` with an HTTPS callback,
state, nonce, and PKCE. The implementation does not assume that the system
authentication session shares cookies with WKWebView. Instead, the system
session returns a short-lived one-time code; WKWebView posts that code and its
PKCE verifier to a same-origin endpoint and receives its own HttpOnly, Secure
NextAuth session cookie.

## First-device smoke test

- Google sign-in returns to Axiom without exposing credentials to WKWebView.
- Dashboard loads, then remains signed in after force-close and relaunch.
- Dashboard, Process/Action, Planner, Knowledge, Notes, and AI open against
  production data without a second local data store.
- Pull-to-refresh and foreground resume refresh stale client state.
- Offline mode shows a clear banner and recovers after reconnect.
- External links leave the app; same-origin links remain in Axiom.
- File/photo selection, keyboard, safe areas, share actions, and back gestures
  are checked on a real iPhone.

See [APP_STORE_READINESS.md](APP_STORE_READINESS.md) for the remaining Apple
Developer and App Review work.

## GitHub Actions Simulator build

The `iOS Simulator Build` workflow is manual-only:

1. Open the repository's **Actions** tab.
2. Select **iOS Simulator Build**.
3. Choose **Run workflow** on `main`.
4. After the job finishes, download the
   `axiom-ios-simulator-<run-number>` artifact from the run summary.

The artifact is retained for seven days and contains the unsigned Simulator
`.app` archive, Xcode result bundle, build/Simulator logs, Xcode/runtime
inventory, and launch screenshot. It cannot be installed on a physical iPhone.

The workflow deliberately contains no signing, certificate, provisioning
profile, App Store Connect key, archive upload, or TestFlight step. Those will
be added only after the unsigned build passes and Apple credentials are
available as encrypted GitHub Actions secrets.

## Unsigned device IPA

The separate `iOS Device Unsigned IPA` workflow is also manual-only. It builds
the same project with the `iphoneos` SDK, verifies that the executable contains
ARM64, confirms that no valid signature or embedded provisioning profile is
present, and packages `Payload/Axiom.app` as `Axiom-unsigned.ipa`.

The artifact also contains its SHA-256 checksum, Xcode result/build logs, IPA
contents, requested entitlements, and a device-build metadata report. The IPA
is not directly installable: a tool such as Sideloadly must create a
device-specific signature and provisioning profile.

### Sideloadly test limitations

- A free Apple Account profile expires after seven days and must then be
  refreshed/reinstalled. Apple also limits free accounts to three installed
  apps per device and ten App IDs in a seven-day period.
- iOS 16 and later requires Developer Mode on the device.
- On Windows, follow Sideloadly's current setup requirements, connect and trust
  the iPhone, select the IPA, enter the installer's own Apple Account, and
  sideload. Never send Apple credentials with the IPA.
- The app currently requests Associated Domains for secure Universal Link
  OAuth callbacks. A free-account re-sign may reject or omit that entitlement,
  and Sideloadly may change the application identifier. Installation success
  therefore does not prove that Google OAuth or Universal Links will work.
  These protections are not removed in the unsigned build.
- This workflow is only a device-build/sideload diagnostic. It is not a
  TestFlight or App Store distribution artifact.
