# M6 — reminder and integration code readiness

## Implementation
- Production cron requires Bearer CRON_SECRET; caller-provided User-Agent headers are not authentication. Missing CRON_SECRET yields 503, invalid token yields 401.
- Unified /api/cron/reminders-tick runs both scheduled and due reminders, reports a partial failure with 503 and a processor-specific failed list. Notification deduplication is still in the database.
- Free / Individual and inactive subscriptions are allowed reminders at the canonical due instant only. Stored earlier absolute rules or mislabeled when_due presets are not an entitlement bypass.
- Google Calendar OAuth and background sync remain gated to an active Pro/Team subscription (M2), so a saved token is not a continued permission after downgrade.

## Important deployment dependencies (not yet verified)
- CRON_SECRET must be configured in Vercel Production and any HTTP cron scheduler. Never commit the value.
- The two Vercel Hobby daily fallback triggers DO NOT support a credible 5-minute-before delivery guarantee. Configure one external HTTP cron every 5 minutes (or use high-frequency Vercel Pro scheduling) and verify 200/503 and scheduler failure alerts. GitHub schedule is best-effort backup.
- Validate web push: VAPID credentials, subscription lifecycle, browser permission, server push errors and user settings. In-app notification persistence is designed to work even when push is unavailable. A push that fails after a persisted notification is not retried by this change.
- Verify Google OAuth redirect URI, token encryption, revoke/reconnect, invalid_grant and production API permissions with a paid test organization.
- Verify tenant scoping, deduplication under two concurrent cron requests, recurring time zones/DST and 24-hour lookback behavior in staging.
- Real provider, cron and Vercel environment testing is deferred until the later operational acceptance stage.

Run: npx tsx scripts/test-m6-reminder-readiness.ts; npm run test:scheduling; npx tsc --noEmit.
