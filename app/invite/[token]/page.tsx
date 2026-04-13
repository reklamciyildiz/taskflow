'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { Users, Loader2, CheckCircle2, XCircle, Building2 } from 'lucide-react';

interface InvitationDetails {
  id: string;
  email: string;
  organization_id: string;
  team_id: string | null;
  role: string;
  expires_at: string;
  organization?: {
    name: string;
  };
}

export default function InvitePage() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinErrorCode, setJoinErrorCode] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resettingWorkspace, setResettingWorkspace] = useState(false);

  // Fetch invitation details
  useEffect(() => {
    async function fetchInvitation() {
      try {
        const response = await fetch(`/api/invitations/${token}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'Failed to load invitation');
          return;
        }

        setInvitation(data.data);
      } catch (err) {
        setError('Failed to load invitation');
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchInvitation();
    }
  }, [token]);

  // Auto-join when user is logged in and invitation is loaded
  useEffect(() => {
    async function autoJoin() {
      if (!session?.user || !invitation || joining || success || error) return;

      setJoining(true);
      setJoinErrorCode(null);
      try {
        const response = await fetch('/api/onboarding/join-organization', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteCode: token }),
        });

        const data = await response.json();

        if (!response.ok) {
          setJoinErrorCode(typeof data.code === 'string' ? data.code : null);
          throw new Error(data.error || 'Could not accept the invitation');
        }

        setSuccess(true);

        await updateSession();
        router.refresh();

        setTimeout(() => {
          router.push('/');
        }, 1200);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setJoining(false);
      }
    }

    void autoJoin();
  }, [session, invitation, token, joining, success, error, router, updateSession]);

  const handleAcceptInvitation = async () => {
    if (!session?.user) {
      // Store token and redirect to sign in
      sessionStorage.setItem('pendingInviteToken', token);
      signIn('google', { callbackUrl: `/invite/${token}` });
      return;
    }

    setJoining(true);
    setError(null);
    setJoinErrorCode(null);

    try {
      const response = await fetch('/api/onboarding/join-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: token }),
      });

      const data = await response.json();

      if (!response.ok) {
        setJoinErrorCode(typeof data.code === 'string' ? data.code : null);
        throw new Error(data.error || 'Could not accept the invitation');
      }

      setSuccess(true);

      await updateSession();
      router.refresh();

      setTimeout(() => {
        router.push('/');
      }, 1200);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setJoining(false);
    }
  };

  const handleResetSoloWorkspace = async () => {
    setResettingWorkspace(true);
    setError(null);
    setJoinErrorCode(null);
    try {
      const response = await fetch('/api/onboarding/reset-solo-workspace', {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }
      await updateSession();
      router.refresh();
      setError(null);
      setJoinErrorCode(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResettingWorkspace(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="inline-flex p-4 bg-red-100 dark:bg-red-900/30 rounded-full mb-4">
            <XCircle className="w-12 h-12 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Invitation unavailable
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm leading-relaxed">
            {error}
          </p>
          <button
            onClick={() => router.push('/auth/signin')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="inline-flex p-4 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
            <CheckCircle2 className="w-12 h-12 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome to the team!
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            You've successfully joined the organization.
          </p>
          <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Redirecting to dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex p-4 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
            <Users className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            You're invited!
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            You've been invited to join an organization on TaskFlow
          </p>
        </div>

        {/* Organization Info */}
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Organization</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {invitation?.organization?.name || 'TaskFlow Organization'}
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Role: <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">{invitation?.role || 'Member'}</span>
            </p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm mb-4">
            {error}
          </div>
        )}

        {session?.user &&
          joinErrorCode === 'OTHER_ORG' &&
          invitation && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="mb-2 font-medium">Did you accidentally create your own workspace?</p>
              <p className="mb-3 text-amber-800/90 dark:text-amber-200/90">
                If you are the <strong>only member</strong> there, you can safely leave and accept this invite.
                This page will retry joining automatically afterwards.
              </p>
              <button
                type="button"
                onClick={() => void handleResetSoloWorkspace()}
                disabled={resettingWorkspace}
                className="w-full rounded-lg bg-amber-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              >
                {resettingWorkspace ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Working…
                  </span>
                ) : (
                  'Leave my solo workspace'
                )}
              </button>
            </div>
          )}

        {/* Action Buttons */}
        {!session?.user ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
              Sign in to accept this invitation
            </p>
            <button
              onClick={() => signIn('google', { callbackUrl: `/invite/${token}` })}
              className="w-full py-3 px-4 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg transition-colors flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-gray-800 px-2 text-gray-500 dark:text-gray-400">
                  or
                </span>
              </div>
            </div>

            <button
              onClick={() => router.push(`/auth/signin?callbackUrl=/invite/${token}`)}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Sign in with Email
            </button>
            
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Don't have an account?{' '}
              <button 
                onClick={() => router.push(`/auth/signup?callbackUrl=/invite/${token}`)}
                className="text-blue-600 hover:underline"
              >
                Sign up
              </button>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Signed in as <span className="font-medium">{session.user.email}</span>
              </p>
            </div>
            <button
              onClick={handleAcceptInvitation}
              disabled={joining}
              className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {joining ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Accept Invitation
                </>
              )}
            </button>
            <button
              onClick={() => router.push('/')}
              className="w-full py-3 px-4 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium transition-colors"
            >
              Decline
            </button>
          </div>
        )}

        {/* Expiration Notice */}
        {invitation && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-6">
            This invitation expires on {new Date(invitation.expires_at).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}
