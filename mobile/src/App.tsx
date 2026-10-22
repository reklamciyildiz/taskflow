import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import {
  ArrowLeft, BookOpen, CalendarDays, CloudOff, Home,
  LockKeyhole, LogOut, UserRound,
  ShieldCheck, Sparkles, Wifi,
} from 'lucide-react';
import type { MobileActionDetail, MobileProcessDetail, MobileSessionTokens, MobileWorkspace } from '../../shared/mobile-contracts';
import {
  AxiomActionView,
  AxiomProcessView,
  AxiomWorkspaceDashboard,
} from '../../shared/product-ui/AxiomWorkspaceViews';
import {
  completeGoogleSignIn, credentialsSignIn, ensureDeviceId, loadAction,
  googleOAuthAvailable, loadProcess, loadWorkspace, logout, mobileApiConfigured, restoreSession,
  startGoogleSignIn,
} from './mobile-api';
import { PlannerV2View } from '../../components/planner/PlannerV2View';
import { MobilePlannerRuntime } from './PlannerRuntimeAdapter';
import { MobileKnowledge } from './MobileKnowledge';
import { Toaster } from 'sonner';

type Screen = 'booting' | 'signin' | 'workspace' | 'planner' | 'knowledge' | 'account' | 'process' | 'action';
function todayLabel(): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstName(session: MobileSessionTokens): string {
  return session.user.name?.trim().split(/\s+/)[0] || session.user.email.split('@')[0];
}

function initials(session: MobileSessionTokens): string {
  const source = session.user.name?.trim() || session.user.email;
  return source.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

export function App() {
  const [screen, setScreen] = useState<Screen>('booting');
  const screenRef = useRef<Screen>('booting');
  const [session, setSession] = useState<MobileSessionTokens | null>(null);
  const [workspace, setWorkspace] = useState<MobileWorkspace | null>(null);
  const [processDetail, setProcessDetail] = useState<MobileProcessDetail | null>(null);
  const [actionDetail, setActionDetail] = useState<MobileActionDetail | null>(null);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);
  const [googleOAuthChecked, setGoogleOAuthChecked] = useState(false);
  const dateLabel = useMemo(todayLabel, []);

  useEffect(() => { screenRef.current = screen; }, [screen]);

  const enterWorkspace = useCallback(async (tokens: MobileSessionTokens) => {
    setSession(tokens);
    setWorkspace(await loadWorkspace());
    setScreen('workspace');
  }, []);

  const goBack = useCallback(() => {
    if (screenRef.current === 'action' && processDetail) setScreen('process');
    else if (screenRef.current === 'action' || screenRef.current === 'process') setScreen('workspace');
    else void NativeApp.minimizeApp();
  }, [processDetail]);

  const selectRoot = useCallback((next: Extract<Screen, 'workspace' | 'planner' | 'knowledge' | 'account'>) => {
    setProcessDetail(null);
    setActionDetail(null);
    setScreen(next);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    let active = true;
    void ensureDeviceId().catch(() => setError('Secure device storage is unavailable.'));
    void Network.getStatus().then((status) => active && setOnline(status.connected));
    const networkHandle = Network.addListener('networkStatusChange', (status) => setOnline(status.connected));
    const linkHandle = NativeApp.addListener('appUrlOpen', ({ url }) => {
      if (!url.includes('/mobile/auth/callback')) return;
      setBusy(true);
      setError(null);
      void completeGoogleSignIn(url)
        .then(enterWorkspace)
        .catch((cause) => setError(cause instanceof Error ? cause.message : 'Google sign-in failed.'))
        .finally(() => setBusy(false));
    });
    const backHandle = NativeApp.addListener('backButton', goBack);
    if (!mobileApiConfigured()) setScreen('signin');
    else void restoreSession()
      .then((tokens) => tokens ? enterWorkspace(tokens) : setScreen('signin'))
      .catch(() => setScreen('signin'));
    if (mobileApiConfigured()) {
      void googleOAuthAvailable()
        .then(setGoogleOAuthEnabled)
        .catch(() => setGoogleOAuthEnabled(false))
        .finally(() => setGoogleOAuthChecked(true));
    } else {
      setGoogleOAuthChecked(true);
    }
    return () => {
      active = false;
      void Promise.all([networkHandle, linkHandle, backHandle])
        .then((handles) => Promise.all(handles.map((handle) => handle.remove())));
    };
  }, [enterWorkspace, goBack]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await enterWorkspace(await credentialsSignIn(String(form.get('email') ?? ''), String(form.get('password') ?? '')));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshWorkspace() {
    setBusy(true);
    setError(null);
    try {
      setWorkspace(await loadWorkspace());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Workspace could not be refreshed.');
    } finally {
      setBusy(false);
    }
  }

  async function openProcess(processId: string) {
    setBusy(true);
    setError(null);
    try {
      setProcessDetail(await loadProcess(processId));
      setActionDetail(null);
      setScreen('process');
      window.scrollTo({ top: 0 });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Process could not be loaded.');
    } finally {
      setBusy(false);
    }
  }

  async function openAction(actionId: string) {
    setBusy(true);
    setError(null);
    try {
      setActionDetail(await loadAction(actionId));
      setScreen('action');
      window.scrollTo({ top: 0 });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action could not be loaded.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    await logout();
    setSession(null);
    setWorkspace(null);
    setProcessDetail(null);
    setActionDetail(null);
    setScreen('signin');
    setBusy(false);
  }

  const authenticated = Boolean(session && screen !== 'signin' && screen !== 'booting');

  return (
    <main className={`mobile-shell screen-${screen}`}>
      <header className="app-header">
        {screen === 'process' || screen === 'action' ? (
          <button className="icon-button" type="button" onClick={goBack} aria-label="Go back"><ArrowLeft /></button>
        ) : <span className="brand-mark" aria-hidden="true"><Sparkles /></span>}
        <div className="brand-copy"><strong>Axiom</strong><span>{authenticated ? 'Mobile workspace' : 'Secure workspace'}</span></div>
        <span className={`network-status ${online ? 'online' : 'offline'}`} aria-label={online ? 'Online' : 'Offline'}>{online ? <Wifi /> : <CloudOff />}</span>
        {authenticated ? <span className="avatar" title={session?.user.email}>{session ? initials(session) : ''}</span> : null}
      </header>

      {!online ? <div className="offline-banner" role="status"><CloudOff />You are offline. Reconnect to continue.</div> : null}

      {screen === 'booting' ? <section className="panel centered"><div className="spinner" /><p>Restoring your secure session…</p></section> : null}

      {screen === 'signin' ? (
        <section className="panel auth-panel" aria-labelledby="signin-title">
          <span className="hero-icon"><LockKeyhole /></span>
          <p className="eyebrow">Secure mobile access</p>
          <h1 id="signin-title">Welcome back</h1>
          <p className="summary">Sign in with your existing Axiom account. Your workspace permissions stay unchanged.</p>
          {!mobileApiConfigured() ? <div className="notice error">Mobile API URL is not configured in this development build.</div> : null}
          <form onSubmit={signIn}>
            <label>Email<input name="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="email" required disabled={busy || !online} /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required disabled={busy || !online} /></label>
            <button className="primary" disabled={busy || !online || !mobileApiConfigured()}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <div className="divider"><span>or</span></div>
          <button className="secondary" onClick={() => void startGoogleSignIn().catch((cause) => setError(cause instanceof Error ? cause.message : 'Google sign-in failed.'))} disabled={busy || !online || !mobileApiConfigured() || !googleOAuthEnabled}>{googleOAuthEnabled ? 'Continue with Google' : googleOAuthChecked ? 'Google sign-in — setup pending' : 'Checking Google sign-in…'}</button>
          {!googleOAuthEnabled && googleOAuthChecked ? <p className="security-note">Google sign-in will be enabled after the OAuth callback and Android App Link are verified.</p> : null}
          {error ? <div className="notice error" role="alert">{error}</div> : null}
          <p className="security-note secure-note"><ShieldCheck />Refresh credentials are protected by Android Keystore and never stored in localStorage.</p>
        </section>
      ) : null}

      {screen === 'workspace' && session && workspace ? (
        <AxiomWorkspaceDashboard
          workspace={workspace}
          dateLabel={dateLabel}
          greeting={`${greeting()}, ${firstName(session)}`}
          onRefresh={() => void refreshWorkspace()}
          onOpenProcess={(id) => void openProcess(id)}
          onOpenAction={(id) => void openAction(id)}
          busy={busy}
          footer={<button className="logout-button" type="button" onClick={() => void signOut()} disabled={busy}><LogOut />Log out of this device</button>}
        />
      ) : null}

      {screen === 'process' && processDetail ? (
        <AxiomProcessView detail={processDetail} onOpenAction={(id) => void openAction(id)} busy={busy} />
      ) : null}

      {screen === 'action' && actionDetail ? (
        <AxiomActionView detail={actionDetail} />
      ) : null}

      {screen === 'planner' ? (
        <MobilePlannerRuntime onOpenAction={(id) => void openAction(id)} onError={setError}>
          <PlannerV2View />
        </MobilePlannerRuntime>
      ) : null}

      {screen === 'knowledge' ? <MobileKnowledge onOpenAction={(id) => void openAction(id)} onError={setError} /> : null}

      {screen === 'account' && session ? (
        <section className="workspace mobile-product-view account-view" aria-labelledby="mobile-account-title">
          <div className="account-hero"><span className="account-avatar">{initials(session)}</span><p className="eyebrow">Secure session</p><h1 id="mobile-account-title">{session.user.name || 'Axiom account'}</h1><p className="summary">{session.user.email}</p></div>
          <div className="account-security"><ShieldCheck /><div><strong>Protected on this device</strong><span>Refresh credentials are encrypted by Android Keystore. Workspace access still follows Axiom organization, team, and Process permissions.</span></div></div>
          <button className="account-logout" type="button" onClick={() => void signOut()} disabled={busy}><LogOut />Log out of this device</button>
        </section>
      ) : null}

      {busy && authenticated ? <div className="busy-indicator" role="status"><div className="spinner" /><span>Updating workspace…</span></div> : null}
      {error && screen !== 'signin' ? <div className="notice error global-error" role="alert">{error}<button type="button" onClick={() => setError(null)}>Dismiss</button></div> : null}
      <Toaster richColors position="top-center" />
      {authenticated ? (
        <nav className="mobile-tab-bar" aria-label="Primary navigation">
          <button type="button" className={screen === 'workspace' ? 'is-active' : ''} onClick={() => selectRoot('workspace')}><Home /><span>Home</span></button>
          <button type="button" className={screen === 'planner' ? 'is-active' : ''} onClick={() => selectRoot('planner')}><CalendarDays /><span>Planner</span></button>
          <button type="button" className={screen === 'knowledge' ? 'is-active' : ''} onClick={() => selectRoot('knowledge')}><BookOpen /><span>Knowledge</span></button>
          <button type="button" className={screen === 'account' ? 'is-active' : ''} onClick={() => selectRoot('account')}><UserRound /><span>Account</span></button>
        </nav>
      ) : <footer>{Capacitor.getPlatform()} · local bundle</footer>}
    </main>
  );
}
