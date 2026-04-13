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

  // Tam NextRequest bazen gövde/adapter ile "Response body disturbed or locked" tetikliyor;
  // getToken yalnızca headers + cookies kullanır (SessionStore cookies.getAll).
  const token = await getToken({
    req: { headers: request.headers, cookies: request.cookies } as Parameters<
      typeof getToken
    >[0]['req'],
    secret: process.env.NEXTAUTH_SECRET,
  });

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
