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

## Repeatable beta build

Run from the repository root:

```powershell
npm run build:android:beta
```

The command prompts locally for the existing keystore password without echoing
or persisting it. It builds and validates the release, then promotes it to the
single distribution path `dist/android/Axiom.apk` only when all of these match:

- package ID `com.axiomproductivity.twa.diagnostic`
- a versionCode newer than the signed baseline beta
- signing certificate SHA-256 `84:AA:DF:BF:CF:2B:F3:20:DD:C8:9D:53:E0:0E:4D:78:6D:A0:9B:D8:22:F7:40:A3:16:09:DF:BC:8E:38:3C:A8`

The existing `dist/android/Axiom.apk`, if present, is not replaced until the
new APK passes package, version, signature, zipalign, and apksigner checks.
Build intermediates and distribution binaries remain ignored by Git.

The unsigned iOS artifact remains produced by GitHub Actions. After downloading
its artifact ZIP, normalize it locally with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/promote-ios-ipa.ps1 -ArtifactZip <artifact.zip>
```

This promotes the single IPA to `dist/ios/Axiom-unsigned.ipa` without changing
the iOS signing workflow.
