import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const origin = request.headers.get('origin');
  const allowedMobileOrigins = new Set(
    (process.env.MOBILE_AUTH_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const mobileSharedApi =
    pathname === '/api/tasks' ||
    /^\/api\/tasks\/[^/]+$/.test(pathname) ||
    pathname === '/api/projects' ||
    /^\/api\/projects\/[^/]+$/.test(pathname) ||
    /^\/api\/projects\/[^/]+\/members$/.test(pathname) ||
    /^\/api\/projects\/[^/]+\/properties$/.test(pathname) ||
    /^\/api\/tasks\/[^/]+\/properties$/.test(pathname) ||
    /^\/api\/planner\/(today|upcoming|routines|occurrences)$/.test(pathname) ||
    pathname === '/api/schedules' ||
    pathname === '/api/knowledge' ||
    pathname === '/api/ai/chat' ||
    pathname === '/api/ai/conversations' ||
    /^\/api\/ai\/conversations\/[^/]+$/.test(pathname) ||
    /^\/api\/ai\/write-proposals\/[^/]+$/.test(pathname);
  const mobileOriginAllowed = Boolean(origin && allowedMobileOrigins.has(origin));

  if (mobileSharedApi && mobileOriginAllowed && request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin!,
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'authorization,content-type',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      },
    });
  }

  const withMobileCors = (response: NextResponse) => {
    if (mobileSharedApi && mobileOriginAllowed) {
      response.headers.set('Access-Control-Allow-Origin', origin!);
      response.headers.set('Vary', 'Origin');
    }
    return response;
  };

  if (mobileSharedApi && request.headers.get('authorization')?.startsWith('Bearer ')) {
    return withMobileCors(NextResponse.next());
  }

  // Public routes that don't require authentication
  const publicRoutes = [
    '/auth/signin',
    '/auth/signup',
    '/auth/error',
    '/manifest.webmanifest',
    '/offline.html',
    '/.well-known/assetlinks.json',
    '/.well-known/apple-app-site-association',
    '/robots.txt',
    '/sitemap.xml',
    '/api/auth',
    '/mobile/auth/callback',
    // Mobile endpoints authenticate with their own short-lived bearer/session guard.
    // Keeping them out of NextAuth cookie middleware does not make them anonymous:
    // every data route calls authenticateMobileRequest server-side.
    '/api/mobile',
    // Cron route handlers enforce CRON_SECRET (or Vercel Cron UA) themselves.
    '/api/cron',
    // Webhook routes authenticate via HMAC signature — not session tokens.
    '/api/webhooks',
    '/marketing',
    '/onboarding',
    '/invite',
    '/api/invitations',
    '/api/onboarding',
    '/access-denied',
    '/privacy',
    '/terms',
  ];

  // Check if the current path is a public route
  const isPublicRoute = publicRoutes.some(route => 
    pathname.startsWith(route)
  );

  if (isPublicRoute) {
    return withMobileCors(NextResponse.next());
  }

  // Passing the full NextRequest can sometimes trigger "Response body disturbed or locked";
  // getToken only needs headers + cookies (SessionStore cookies.getAll).
  const token = await getToken({
    req: { headers: request.headers, cookies: request.cookies } as Parameters<
      typeof getToken
    >[0]['req'],
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Logged-out visitors hit `/` → marketing site (Lemon / SEO expect a real landing URL).
  if (!token && (pathname === '/' || pathname === '')) {
    return NextResponse.redirect(new URL('/marketing', request.url));
  }

  // API routes should not redirect to HTML sign-in (breaks JSON clients).
  if (!token && pathname.startsWith('/api/')) {
    return withMobileCors(NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }));
  }

  if (!token) {
    const signInUrl = new URL('/auth/signin', request.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Check if user needs onboarding (no organization)
  // Skip onboarding redirect for invite pages - they handle their own flow
  if (token.needsOnboarding && pathname !== '/onboarding') {
    // Don't redirect if user is on invite page or related API
    if (!pathname.startsWith('/invite') && !pathname.startsWith('/api/onboarding')) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
  }

  // Check if user has organization access
  if (!token.organizationId && pathname !== '/onboarding') {
    // User has no organization - redirect to onboarding
    if (!pathname.startsWith('/invite') && !pathname.startsWith('/api/onboarding')) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
  }

  return withMobileCors(NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|apple-touch-icon.png|icon-192x192.png|icon-512x512.png|manifest.webmanifest|offline.html|sw.js|robots.txt|sitemap.xml|public).*)',
  ],
};
