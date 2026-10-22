# Axiom Android TWA

This Bubblewrap project packages the production Axiom PWA at
`https://getaxiomm.vercel.app` as an Android Trusted Web Activity.

- Package: `com.axiomproductivity.twa.diagnostic`
- Minimum Android SDK: 24
- Target Android SDK: 36
- The signing key and built APK/AAB files are intentionally ignored by Git.
- A release or Play App Signing certificate requires its own SHA-256 entry in
  `/.well-known/assetlinks.json` before publishing.

The application renders the existing production Next.js PWA. It does not
contain a second frontend or use Capacitor `server.url`.
