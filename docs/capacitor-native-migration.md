# Actiproc Capacitor Android migration — verification gates

## Distinct build targets

- **Existing working diagnostic APK:** `npm --prefix mobile run android:debug:capacitor-poc`. Opens the live Next.js product with Capacitor `server.url`, uses native NextAuth web-cookie handoff. This is **diagnostic only** and cannot be treated as the final Play Store architecture.
- **Bundled client:** `npm --prefix mobile run android:debug:production-beta`. Builds the Vite/React mobile UI, then `cap sync android` bundles assets and uses the public HTTPS mobile API. The checked-in default `capacitor.config.ts` does not set `server.url`. This is the target architecture, **not yet proven to match all web features**.

The native callback handler must not consume JavaScript-managed PKCE callbacks from the bundled app (no pending native OAuth state). Both flows must be validated independently.

## Navigation

- The Next.js shell renders the bottom bar only when Capacitor explicitly reports a native Android/iOS environment and viewport width below 1024 px. Ordinary web browsers and TWA are unaffected. As this code belongs to the web app, the diagnostic APK does **not** gain the bar until the web deployment includes it; no deployment is authorized here.
- The locally bundled client already has screen-state tabs. They now use **Home, Planner, Actions, Knowledge, AI**; account access remains in the header. Safe-area clearance prevents bottom content clipping. Feature parity must still be verified.

## Required pre-release checks

1. Run root `npm run test:capacitor-oauth` and `node scripts/test-capacitor-mobile-shell.mjs`.
2. Install dependencies and build on Windows with Android SDK / JDK 21: `npm ci`, `npm ci --prefix mobile`, `npm --prefix mobile run android:debug:production-beta`.
3. Inspect APK `assets/capacitor.config.json` and confirm **`server.url` is absent**. Verify package ID, signing fingerprint and Android permission/app-link configuration.
4. Device test: fresh Google OAuth, cold start/refresh, logout, back navigation, lost connectivity; dashboard, actions, planner, checklists, notes, knowledge, AI, role/organization access; keyboard/dialogs and five tabs on small screens.
5. Audit feature parity. `MobilePlannerRuntime` still deliberately rejects certain organization/team administration operations. **Do not publish or migrate users without closing these gaps.**
6. Before a Play update check matching package ID, signing key and incremented versionCode. Debug package `com.actiproc.app.dev` is not automatically an update to the current Play Store application.
7. Review subscription and payment platform compliance prior to production distribution.

No `main` merge, web deployment, production database migration, Play Store submission, or TWA replacement was done in this branch.
