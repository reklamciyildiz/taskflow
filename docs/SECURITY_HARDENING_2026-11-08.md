# Actiproc Security Hardening — scoped change review (2026-11-08)

## Verified vulnerabilities and actions

1. **Customers BOLA/IDOR:** \`GET/PATCH/DELETE /api/customers/[id]\` accepted foreign
   customer UUIDs because the service-role repository filtered only by \`id\`.
   The list response derived task statistics from \`customer_id\` alone.
   **Mitigation:** canonical database-backed actor via \`requireAuthedUser\`;
   Owner/Admin writes, Member/Viewer reads; both \`id\` and \`organization_id\`
   applied directly to UPDATE, DELETE and SELECT. Foreign and absent IDs yield
   the same 404 without disclosing record fields. Customer stats are org scoped.
2. **Cross-tenant Action/customer relations:** canonical task POST and PATCH
   accepted \`customerId\` from callers without verifying customer ownership.
   **Mitigation:** validate typed UUID against a same-organization customer
   lookup *before* task or schedule writes. Unknown/foreign ID gets 404.
3. **Simulated 2FA:** both account screens invoked a component with fake verification.
   **Mitigation:** remove its component and entrypoints; preserve existing
   credentials/Google OAuth/NextAuth providers and change-password flow.
   Google-managed MFA is unaffected.
4. **Fake Active Sessions:** local example device list and fake revoke actions.
   **Mitigation:** remove from both account screens and delete simulator.
   Do not imply existing web sessions can be individually revoked.

## Web session architecture / future implementation gate

\`lib/auth.ts\` uses NextAuth v4 \`session.strategy='jwt'\`, 30-day maxAge.
There is no authoritative server-side web-session register / session-ID
revocation store for the issued browser cookies. An IP/user-agent based list
would be fabricated, and clearing only a row on the server would not invalidate
JWTs accepted by other APIs. **No web-session enumeration or revoke feature is
enabled in this patch.** No signing secret rotation or forced global sign-out
is performed.

Android/iOS mobile beta bearer tokens instead use \`mobile_auth_sessions\` with
hashed access/refresh tokens, expiry checks and \`revoked_at\`, plus a
server-side revoke RPC for mobile logout. This is distinct from NextAuth
browser JWTs. Do not mix mobile session IDs with browser session IDs.

A future cross-platform Active Sessions feature requires:
1. Versioned, database-owned opaque web session IDs and minimal metadata (user,
   created/last seen, platform, revocation timestamp). Do not store or return
   raw session tokens.
2. NextAuth login JWTs bound to a server session ID, and a fail-closed
   server-side revocation check for *every* authenticated route, including
   NextAuth calls not routed through \`requireAuthedUser\`. Avoid TTL caching
   of authorization decisions when next-request revocation is required.
3. Concurrency-safe \`revoke one\` / \`revoke all except self\` service
   operations, CSRF protections and per-user queries. Test live
   invalidation under concurrent requests.
4. Migration path that **grandfathers existing JWTs until natural expiry**
   or transparently enrolls them after secure proof. Do not invalidate all
   existing logins without a separate approved rollout.
5. Feature flag, staging E2E for browser/mobile, explicit operator signoff.
   No session migration is attempted here.

## Database integrity / TOCTOU

Customer CRUD uses a single org-scoped SQL statement for each mutation,
rather than read-then-update/delete. The Action/customer association check
still involves read then task write because \`tasks.customer_id\` presently has
only a simple FK to \`customers(id)\`. To make association integrity robust
against unusual concurrent service-role reassignment, separately approve a
**composite FK** \`tasks(organization_id,customer_id)\` referencing
\`customers(organization_id,id)\`, using a new unique supporting constraint.
Run a read-only check for pre-existing cross-tenant task/customer links first;
resolve any mismatches with the owner. Stage the migration and verify
ON DELETE SET NULL preserves the task organization ID.
**No Production migration or data change was made.**

## Other security review boundaries

- The main Process and Team routes already contain authorization and
  organization membership checks. Customer endpoints were the confirmed
  ID-only service-role outlier. This pass is not an exhaustive proof that
  every API route and every Supabase RLS policy is secure.
- The backend intentionally uses \`supabaseAdmin\` in multiple modules and
  bypasses RLS. Explicit org and role gates therefore remain mandatory.
- A separate audit should evaluate \`organizations/[id]\` response field
  projections, legacy non-scoped helpers, pre-existing task writes, shared
  subscriptions, webhook URL validation/SSRF, and historical logs.
- Production database RLS/migration status must be read from Supabase itself,
  not inferred from checked-in SQL files.
- The old \`ChangePasswordModal\` and credential-provider flow are kept to avoid
  unrelated login regressions. Assess reauthentication and password-reset
  threat model separately before changing credential behavior.

## Quality and release plan

\`npm run test:security\` exercises two isolated organizations, all four roles,
foreign UUID GET/PATCH/DELETE, missing/stale actor cases, input
mass-assignment denial, concurrent requests and unchanged foreign data.
It also checks the route/database scope contracts and absence of fake UI.
These tests are simulated repository integration tests, **not** live Supabase
RLS or external Production E2E tests.

Run TypeScript, ESLint, Next build, tenant ACL tests, then staging E2E with
real NextAuth and mobile bearer cookies. Verify a genuine second tenant can
never read/mutate foreign customers or attach them to an Action. Inspect
Supabase RLS, apply a separately approved composite-FK migration after
data preflight, and only then deploy to Production. Merge and deployment
require separate explicit approval.
