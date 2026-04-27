import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = [
    '/auth/signin',
    '/auth/signup',
    '/auth/error',
    '/manifest.webmanifest',
    '/api/auth',
    // Cron route handlers enforce CRON_SECRET (or Vercel Cron UA) themselves.
    '/api/cron',
    '/marketing',
    '/onboarding',
    '/invite',
    '/api/invitations',
    '/api/onboarding',
    '/access-denied',
  ];

  // Check if the current path is a public route
  const isPublicRoute = publicRoutes.some(route => 
    pathname.startsWith(route)
  );

  if (isPublicRoute) {
    return NextResponse.next();
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
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
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

  return NextResponse.next();
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
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|public).*)',
  ],
};
