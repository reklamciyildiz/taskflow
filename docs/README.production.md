# TaskFlow - Production Deployment Guide

## Prerequisites

1. **Supabase Account** - Database and authentication
2. **Google OAuth Credentials** - For user authentication
3. **Deployment Platform** - Vercel (recommended) or Netlify

---

## Environment Variables

Create `.env.local` file with these variables:

```env
# NextAuth Configuration
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Google Calendar (OAuth redirect + token encryption at rest)
# Must match an Authorized redirect URI in Google Cloud Console.
GOOGLE_REDIRECT_URI=https://your-domain.com/api/integrations/google/callback
# 32-byte key (base64 or hex). Example generation:
# node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
GOOGLE_TOKEN_ENCRYPTION_KEY=your-32-byte-key-base64-or-hex

# Public URL used in calendar event descriptions (recommended in production)
NEXT_PUBLIC_APP_URL=https://your-domain.com

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Web Push (VAPID)
# Generate once (do NOT commit private key):
# npx web-push generate-vapid-keys
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:admin@your-domain.com
```

---

## Database Setup (Supabase)

All tables are already created. Verify these tables exist:
- `users`
- `organizations`
- `teams`
- `team_members`
- `tasks`
- `user_settings`
- `google_calendar_connections`
- `google_calendar_event_links`

### Google Cloud Console setup (Calendar)

1. Create OAuth credentials (Web application).
2. Add Authorized redirect URI: `https://your-domain.com/api/integrations/google/callback`
3. Enable Google Calendar API for the project.
4. Scopes used by TaskFlow include Calendar event read/write (`calendar.events`) and calendar list read (`calendar.readonly`) plus basic OpenID profile/email.

---

## Build & Test Locally

```bash
npm install
npm run build
npm start
```

Check for any build errors before deploying.

---

## Deployment Options

### **Option 1: Vercel (Recommended)**

**Why Vercel:**
- Built for Next.js
- Zero configuration
- Automatic SSL
- Global CDN
- Free tier available

**Steps:**
1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your GitHub repository
4. Add environment variables
5. Deploy

**Vercel will automatically:**
- Install dependencies
- Build the project
- Deploy to production
- Provide a domain (*.vercel.app)

---

### **Option 2: Netlify**

**Steps:**
1. Push code to GitHub
2. Go to [netlify.com](https://netlify.com)
3. Import repository
4. Build command: `npm run build`
5. Publish directory: `.next`
6. Add environment variables
7. Deploy

---

### **Option 3: Self-Hosted (VPS)**

**Requirements:**
- Ubuntu/Debian server
- Node.js 18+
- PM2 for process management
- Nginx for reverse proxy

**Not recommended** unless you need full control.

---

## Post-Deployment Checklist

- [ ] Test user registration/login
- [ ] Create a team
- [ ] Create tasks
- [ ] Test RBAC permissions
- [ ] Check Analytics page
- [ ] Test mobile responsiveness
- [ ] Verify email invitations work
- [ ] Connect Google Calendar in Settings, pick a calendar, create a dated action, verify the event appears

---

## Production URLs

After deployment, you'll get:
- **Vercel**: `https://your-app.vercel.app`
- **Netlify**: `https://your-app.netlify.app`

You can add custom domain later.

---

## Support

For issues, check:
1. Vercel/Netlify deployment logs
2. Browser console for errors
3. Supabase logs for database issues
