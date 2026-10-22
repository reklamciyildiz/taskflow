# App Store readiness

## Native value already present

- System-browser Google authentication with verified HTTPS callback and PKCE
- Persistent WKWebView session without copying system-browser cookies
- Universal Links and web-credentials entitlement wiring
- Native share bridge and native file/photo picker compatibility through WKWebView
- Pull-to-refresh, back gestures, external-link routing, lifecycle signals
- Network-loss banner and reconnect notification

These integrations are intentionally thin: the production PWA remains the
single product UI and the production backend remains the only data source.

## Required before submission

1. Configure the real Apple Team ID and verify the AASA file on the signed app.
2. If App Review Guideline 4.8 applies, implement Sign in with Apple. Verify the
   Apple `sub` server-side and bind it to the existing canonical Axiom user;
   never link accounts from an unverified email alone. This needs the Team ID,
   Services ID, Key ID, and private key stored only in server secrets.
3. Add native APNs notifications by reusing the existing reminder/notification
   engine. Do not create a second scheduling system.
4. Connect production PWA share actions to the existing `axiomNative` bridge
   and test real photo/file uploads on iPhone.
5. Prepare App Review notes and a review account with safe representative data.

No second mobile UI, authentication database, or offline data store is planned.
