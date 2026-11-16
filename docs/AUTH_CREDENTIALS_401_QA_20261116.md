# Web credentials 401 reliability — 16 November 2026

## What the original console output means

A `POST /api/auth/callback/credentials` returning 401 and `CredentialsSignin`
is expected when NextAuth v4 credentials `authorize()` returns `null` for a
missing user, wrong password, or a passwordless (Google) account. The browser
Network/Console may continue to show an expected 401 for a deliberately invalid
password; hiding or changing that HTTP status would be misleading.

**Original application defects:**
1. The credential adapter used to catch *all* database and bcrypt failures,
   log them, and return `null` (incorrect-password signal), preventing reliable
   production diagnosis.
2. The sign-in form logged `CredentialsSignin` to the JS console but displayed
   no inline error (unless an error was already present in the page URL).
3. Email input was not normalized to registration's lowercase convention.
4. The form accepted rapid duplicate submissions; redirecting with an
   unsanitized `callbackUrl` query parameter was avoidable.

## Behavior after this change

- Missing user, Google-only user and wrong password all return the same
  non-enumerating credential failure, with a visible inline hint about Google.
- Database lookup/bcrypt exceptions are caught separately and surfaced as the
  safe provider error code `AuthServiceUnavailable`, not `CredentialsSignin`.
  Server logs contain the category (lookup/verify/unexpected), never email or
  submitted passwords. These backend errors require infra monitoring.
- Input email is trimmed and lowercased, matching new-registration behavior.
- Concurrent form submission is guarded; buttons are disabled while pending,
  errors are announced via `role=alert`, and callback paths are validated.
- JWT session strategy and the separate Google OAuth flow are unchanged.
- No database migration, credentials reset, session invalidation or automatic
  Vercel deployment is required for the code changes.

## Automated verification

```sh
npx tsx scripts/test-password-login.ts
npx tsc --noEmit
npm run build
```

CI runs this on pull requests/pushes to the isolated auth fix branch. The
contract validates normalization, valid and invalid passwords, missing accounts,
Google-only identities, twice-valid sign-ins, database outages, verifier errors,
generic client error mapping, safe callback paths and NextAuth/form wiring.

## Required manual staging/browser matrix before merge/release

1. Desktop browser: an existing password account, correct password -> login,
   no form error and correct destination; reload and access dashboard.
2. Wrong password -> expected credentials 401 plus **inline generic** message,
   not an unhandled `console.error('Sign in error: CredentialsSignin')` loop.
3. Email with surrounding spaces/capital letters -> normalizes, valid login.
4. An account created with Google and no `password_hash` -> generic failure
   for email/password; Google button still signs in through verified provider.
5. A non-existent email -> same generic message as a wrong password (no account
   enumeration). Confirm sign-up/registration is unaffected.
6. Two browsers/devices logged into distinct accounts, and two browsers logged
   into the same account -> no cross-account session leakage. Test sign-out
   independently on each device.
7. Turn off DB access in **isolated staging only**, or mock lookup to fail ->
   `AuthServiceUnavailable` with user-visible service message. Restore DB;
   retry successfully. Never deliberately interrupt production.
8. Simulate network failure while posting credentials -> useful generic message;
   buttons recover, password never appears in console/logs.
9. Check callbackUrl `/invite/...` and invalid external URL; redirect only to
   a same-origin relative path.
10. Test keyboard Enter, rapid double click, mobile viewport and accessibility
    announcement. Test on the production build and a real Android wrapper too.

## Diagnostics / operational limits

Inspect correlated Vercel request logs for the actual production failures,
without recording passwords, request bodies, password hashes or auth tokens.
The supplied browser console snippet alone cannot establish whether each failed
attempt was due to a bad password, a Google-only account, or an intermittent
database failure. Confirm password method and account existence in the
authorized operator's database view; never send user hashes to the browser.

**Not covered by this patch:** Multi-instance web login brute-force protection,
email recovery, historical legacy accounts stored with mixed-case email, and
real production log correlation. Any rate limit must use durable shared storage
and be tested carefully against legitimate users; an in-memory per-Vercel-instance
counter is not a complete mitigation.

Vercel auto-deployment is intentionally not enabled; merge/release only after
automated and manual authentication acceptance.
