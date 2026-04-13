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

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
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
