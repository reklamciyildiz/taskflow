# Landing (plan & pointers)

The public marketing site lives in the Next.js app, not in this folder.

| Location | Purpose |
|----------|---------|
| [`/marketing`](https://localhost:3000/marketing) | Public landing route (after `npm run dev`) |
| `app/(marketing)/layout.tsx` | Marketing layout (dark shell, metadata) |
| `app/(marketing)/marketing/page.tsx` | Page entry |
| `components/marketing/` | Landing-only UI (hero, demo capture, bento, footer) |

`middleware.ts` includes `/marketing` as a public path so unauthenticated visitors can view it.

For i18n later: add locale routing or messages and a language switcher without moving these paths.

**SEO:** `app/(marketing)/layout.tsx` sets `metadataBase` (from `NEXTAUTH_URL`), Open Graph, Twitter card, canonical `/marketing`, and JSON-LD `SoftwareApplication`.

**Performance:** The marketing `page` is a Server Component; only `MarketingHeroInteractive` (and dynamically imported `DemoActionDeck` + Framer Motion) hydrate on the client. Demo state persists in `localStorage` under `taskflow-marketing-demo-v1`.

**Visual system:** Obsidian base `#050505`, `app/(marketing)/marketing.css` (`marketing-theme` tokens, film noise, kinetic headline). Hero uses `MarketingParallaxGlow` (pointer parallax). Bento lives in `MarketingBentoClient.tsx` (interactive windows). Mobile demo deck uses a bottom `Sheet` when cards exist (`useMediaQuery` avoids double-mounting the deck).
