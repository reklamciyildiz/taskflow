'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Building2, Users, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';

type OnboardingStep = 'choice' | 'create-org' | 'join-org' | 'complete';

export default function OnboardingPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>('choice');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [orgName, setOrgName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  // Check if user already has organization
  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      const user = session.user as any;
      if (user.organizationId && !user.needsOnboarding) {
        router.push('/');
      }
    }
  }, [session, status, router]);

  // Redirect to signin if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  const handleCreateOrganization = async () => {
    if (!orgName.trim()) {
      setError('Organization name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/onboarding/create-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create organization');
      }

      await update();
      router.refresh();
      setStep('complete');

      setTimeout(() => {
        router.push('/');
      }, 1200);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinOrganization = async () => {
    if (!inviteCode.trim()) {
      setError('Invite code is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/onboarding/join-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: inviteCode.trim().toUpperCase() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to join organization');
      }

      await update();
      router.refresh();
      setStep('complete');

      setTimeout(() => {
        router.push('/');
      }, 1200);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome to TaskFlow
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {session?.user?.name ? `Hi ${session.user.name}! ` : ''}
            Let's get you set up
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          {/* Step: Choice */}
          {step === 'choice' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white text-center mb-6">
                How would you like to get started?
              </h2>

              {/* Create Organization Option */}
              <button
                onClick={() => setStep('create-org')}
                className="w-full p-6 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-500 transition-all group text-left"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
                    <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                      Create a new organization
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Start fresh with your own workspace. You can invite team members later.
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors mt-1" />
                </div>
              </button>

              {/* Join Organization Option */}
              <button
                onClick={() => setStep('join-org')}
                className="w-full p-6 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-green-500 dark:hover:border-green-500 transition-all group text-left"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg group-hover:bg-green-200 dark:group-hover:bg-green-900/50 transition-colors">
                    <Users className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                      Join an existing organization
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Have an invite code? Enter it to join your team's workspace.
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-green-500 transition-colors mt-1" />
                </div>
              </button>
            </div>
          )}

          {/* Step: Create Organization */}
          {step === 'create-org' && (
            <div className="space-y-6">
              <button
                onClick={() => { setStep('choice'); setError(null); }}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
              >
                ← Back
              </button>

              <div className="text-center">
                <div className="inline-flex p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
                  <Building2 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Create your organization
                </h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  This will be your team's workspace name
                </p>
              </div>

              <div>
                <label htmlFor="orgName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Organization name
                </label>
                <input
                  id="orgName"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g., Acme Inc."
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleCreateOrganization}
                disabled={loading || !orgName.trim()}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create Organization
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* Step: Join Organization */}
          {step === 'join-org' && (
            <div className="space-y-6">
              <button
                onClick={() => { setStep('choice'); setError(null); }}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
              >
                ← Back
              </button>

              <div className="text-center">
                <div className="inline-flex p-4 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
                  <Users className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Join an organization
                </h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Enter the invite code you received from your team
                </p>
              </div>

              <div>
                <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Invite code
                </label>
                <input
                  id="inviteCode"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="e.g., ABC123XYZ"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 font-mono text-center text-lg tracking-wider"
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleJoinOrganization}
                disabled={loading || !inviteCode.trim()}
                className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    Join Organization
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* Step: Complete */}
          {step === 'complete' && (
            <div className="text-center py-8">
              <div className="inline-flex p-4 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
                <CheckCircle2 className="w-12 h-12 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                You're all set!
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Redirecting you to your dashboard...
              </p>
              <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
