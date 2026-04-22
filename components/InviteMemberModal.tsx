'use client';

import { useState } from 'react';
import { X, Mail, Copy, Check, Loader2, UserPlus } from 'lucide-react';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId?: string;
}

export function InviteMemberModal({ isOpen, onClose, teamId }: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin' | 'viewer'>('member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    token: string;
    inviteLink: string;
    emailSent?: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const ensureLemon = async () => {
    if (typeof window === 'undefined') return;
    const w = window as any;
    if (w.LemonSqueezy?.Url?.Open) return;
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[data-lemonsqueezy="lemonjs"]') as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load lemon.js')));
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://app.lemonsqueezy.com/js/lemon.js';
      s.defer = true;
      s.dataset.lemonsqueezy = 'lemonjs';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load lemon.js'));
      document.head.appendChild(s);
    });
    (window as any).createLemonSqueezy?.();
  };

  const openTeamUpgrade = async () => {
    setUpgradeBusy(true);
    try {
      const resp = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'team', seats: 2 }),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error || 'Could not start checkout');
      const url = json?.data?.url;
      if (typeof url !== 'string' || !url) throw new Error('Checkout URL missing');
      await ensureLemon();
      const w = window as any;
      if (w.LemonSqueezy?.Url?.Open) w.LemonSqueezy.Url.Open(url);
      else window.location.href = url;
    } catch (e: any) {
      setError(e?.message || 'Could not start checkout');
    } finally {
      setUpgradeBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    setLoading(true);
    setError(null);
    setShowUpgrade(false);

    try {
      const response = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          role,
          teamId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402 && data?.code === 'PAYWALL_TEAM_INVITES') {
          setShowUpgrade(true);
        }
        throw new Error(data.error || 'Failed to create invitation');
      }

      setInviteResult({
        token: data.data.token,
        inviteLink: data.data.inviteLink,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteResult) return;
    
    try {
      await navigator.clipboard.writeText(inviteResult.inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopyCode = async () => {
    if (!inviteResult) return;
    
    try {
      await navigator.clipboard.writeText(inviteResult.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleClose = () => {
    setEmail('');
    setRole('member');
    setError(null);
    setShowUpgrade(false);
    setUpgradeBusy(false);
    setInviteResult(null);
    setCopied(false);
    onClose();
  };

  const handleInviteAnother = () => {
    setEmail('');
    setRole('member');
    setError(null);
    setShowUpgrade(false);
    setUpgradeBusy(false);
    setInviteResult(null);
    setCopied(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <UserPlus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Invite Team Member
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {!inviteResult ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email Input */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Role Select */}
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Role
                </label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'member' | 'admin' | 'viewer')}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  disabled={loading}
                >
                  <option value="viewer">Viewer — can view actions only</option>
                  <option value="member">Member - Can create and edit tasks</option>
                  <option value="admin">Admin - Full access to team settings</option>
                </select>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}
              {showUpgrade && (
                <button
                  type="button"
                  disabled={upgradeBusy}
                  onClick={openTeamUpgrade}
                  className="w-full py-2.5 px-4 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {upgradeBusy ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Opening checkout...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-5 h-5" />
                      Upgrade to Team
                    </>
                  )}
                </button>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating invitation...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-5 h-5" />
                    Send Invitation
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Success Message */}
              <div className="text-center py-4">
                <div className="inline-flex p-3 bg-green-100 dark:bg-green-900/30 rounded-full mb-3">
                  <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  Invitation Created!
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {inviteResult.emailSent ? (
                    <>An invitation email has been sent to <span className="font-medium">{email}</span></>
                  ) : (
                    <>Share this link or code with <span className="font-medium">{email}</span></>
                  )}
                </p>
                {inviteResult.emailSent && (
                  <div className="mt-2 inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <Mail className="w-3 h-3" />
                    Email sent successfully
                  </div>
                )}
              </div>

              {/* Invite Link */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Invite Link
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteResult.inviteLink}
                    readOnly
                    className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    {copied ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : (
                      <Copy className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              {/* Invite Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Invite Code
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteResult.token}
                    readOnly
                    className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-lg font-mono text-center tracking-wider text-gray-900 dark:text-white"
                  />
                  <button
                    onClick={handleCopyCode}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    {copied ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : (
                      <Copy className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              {/* Note */}
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                This invitation expires in 7 days
              </p>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleInviteAnother}
                  className="flex-1 py-2.5 px-4 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors"
                >
                  Invite Another
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
