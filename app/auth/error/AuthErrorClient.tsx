'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckSquare, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export function AuthErrorClient({ error }: { error: string | null }) {
  const getErrorMessage = (error: string | null) => {
    switch (error) {
      case 'Configuration':
        return 'There is a problem with the server configuration. Please contact support.';
      case 'AccessDenied':
        return 'Access denied. You do not have permission to sign in.';
      case 'Verification':
        return 'The verification token has expired or has already been used.';
      case 'OAuthSignin':
        return 'Error in constructing an authorization URL.';
      case 'OAuthCallback':
        return 'Error in handling the response from the OAuth provider.';
      case 'OAuthCreateAccount':
        return 'Could not create OAuth provider user in the database.';
      case 'EmailCreateAccount':
        return 'Could not create email provider user in the database.';
      case 'Callback':
        return 'Error in the OAuth callback handler route.';
      case 'OAuthAccountNotLinked':
        return 'This email is already associated with another account. Please sign in with the original provider.';
      case 'EmailSignin':
        return 'Check your email inbox for the sign-in link.';
      case 'CredentialsSignin':
        return 'Sign in failed. Check the details you provided are correct.';
      case 'SessionRequired':
        return 'Please sign in to access this page.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex items-center gap-2 text-primary">
              <CheckSquare className="h-8 w-8" />
              <span className="text-2xl font-bold">Axiom</span>
            </div>
          </div>
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl">Authentication Error</CardTitle>
            <CardDescription className="mt-2">
              Something went wrong during authentication
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <div className="p-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900">
            {getErrorMessage(error)}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-3">
          <Button asChild className="w-full">
            <Link href="/auth/signin">Try again</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">Go to homepage</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

