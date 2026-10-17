# AI provider smoke tests

These scripts make billable live requests only when `--live` is supplied. They
use fixed synthetic text and never read application or user data.

```powershell
npx tsx scripts/smoke-ai-providers.ts --live --provider=groq
npx tsx scripts/smoke-ai-providers.ts --live --provider=cloudflare
```

Set the server-only variables documented in `.env.example` first. Create the
token from Cloudflare's **Workers AI > Use REST API > Create a Workers AI API
Token** flow. If you build a custom token instead, follow Cloudflare's current
Workers AI permission requirements for the selected account. Never reuse the
R2 token.
