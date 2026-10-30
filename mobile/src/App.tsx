import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import {
  ArrowLeft, Bot, BookOpen, CalendarDays, CloudOff, Home,
  LockKeyhole, LogOut, UserRound,
  ShieldCheck, Sparkles, Wifi,
} from 'lucide-react';
import type { MobileSessionTokens } from '../../shared/mobile-contracts';
import {
  completeGoogleSignIn, credentialsSignIn, ensureDeviceId,
  googleOAuthAvailable, logout, mobileApiConfigured, restoreSession,
  startGoogleSignIn, authenticatedFetch,
} from './mobile-api';
import { PlannerV2View } from '../../components/planner/PlannerV2View';
import { MobilePlannerRuntime } from './PlannerRuntimeAdapter';
import { MobileKnowledgeHub } from './MobileKnowledgeHub';
import { Toaster } from 'sonner';
import { AxiomAIChatView } from '../../components/ai/AxiomAIChat';
import { DashboardV2 } from '../../components/dashboard/DashboardV2';
import { TaskBoard } from '../../components/TaskBoard';
import { ActionPanel } from '../../components/ActionPanel';
import { useTaskContext } from '../../components/TaskContext';
import { PlannerTeamSwitcher } from '../../components/planner/PlannerTeamSwitcher';

type Screen = 'booting' | 'signin' | 'workspace' | 'planner' | 'knowledge' | 'ai' | 'account' | 'process';
function initials(session: MobileSessionTokens): string {
  const source = session.user.name?.trim() || session.user.email;
  return source.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

const mobileAIRequest: typeof fetch = (input, init) => {
  const path = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return authenticatedFetch(path, init);
};

function MobileProductContent({
  screen,
  session,
  busy,
  selectRoot,
  signOut,
}: {
  screen: Screen;
  session: MobileSessionTokens;
  busy: boolean;
  selectRoot: (screen: Extract<Screen, 'workspace' | 'planner' | 'knowledge' | 'ai' | 'account'>) => void;
  signOut: () => Promise<void>;
}) {
  const {
    tasks,
    editingTaskId,
    openTaskEditor,
    closeTaskEditor,
    setBoardScope,
    refreshData,
  } = useTaskContext();
  const editingTask = editingTaskId ? tasks.find((task) => task.id === editingTaskId) ?? null : null;

  useEffect(() => {
    const navigate = (event: Event) => {
      const path = String((event as CustomEvent<{ path?: string }>).detail?.path ?? '');
      const url = new URL(path || '/', 'https://mobile.axiom.local');
      if (url.pathname === '/planner') selectRoot('planner');
      else if (url.pathname === '/dashboard/knowledge-hub') selectRoot('knowledge');
      else if (url.pathname === '/ai') selectRoot('ai');
      else if (url.pathname === '/board' || url.pathname === '/dashboard/processes') {
        const projectId = url.searchParams.get('project');
        setBoardScope(projectId ? { type: 'project', projectId } : { type: 'general' });
        window.dispatchEvent(new CustomEvent('axiom-mobile:set-screen', { detail: { screen: 'process' } }));
      } else if (url.pathname === '/' || url.pathname === '/dashboard') selectRoot('workspace');
    };
    const openAction = (event: Event) => {
      const taskId = String((event as CustomEvent<{ taskId?: string }>).detail?.taskId ?? '');
      if (taskId) openTaskEditor(taskId);
    };
    const back = (event: Event) => {
      if (!editingTaskId) return;
      event.preventDefault();
      closeTaskEditor();
    };
    window.addEventListener('axiom-mobile:navigate', navigate);
    window.addEventListener('axiom-mobile:open-action', openAction);
    window.addEventListener('axiom-mobile:back', back);
    return () => {
      window.removeEventListener('axiom-mobile:navigate', navigate);
      window.removeEventListener('axiom-mobile:open-action', openAction);
      window.removeEventListener('axiom-mobile:back', back);
    };
  }, [closeTaskEditor, editingTaskId, openTaskEditor, selectRoot, setBoardScope]);

  return (
    <>
      {(screen === 'workspace' || screen === 'process') ? (
        <div className="mobile-workspace-toolbar"><PlannerTeamSwitcher /></div>
      ) : null}
      {screen === 'workspace' ? <section className="workspace mobile-pwa-view"><DashboardV2 /></section> : null}
      {screen === 'process' ? <section className="workspace mobile-pwa-view mobile-board-view"><TaskBoard /></section> : null}
      {screen === 'planner' ? <PlannerV2View /> : null}
      {screen === 'knowledge' ? (
        <MobileKnowledgeHub
          onOpenAction={openTaskEditor}
          onOpenAI={() => selectRoot('ai')}
          onOpenBoard={() => selectRoot('workspace')}
        />
      ) : null}
      {screen === 'ai' ? (
        <section className="workspace mobile-product-view mobile-ai-view" aria-label="Actiproc AI">
          <AxiomAIChatView
            enabled
            request={mobileAIRequest}
            openTaskEditor={openTaskEditor}
            refreshData={refreshData}
          />
        </section>
      ) : null}
      {screen === 'account' ? (
        <section className="workspace mobile-product-view account-view" aria-labelledby="mobile-account-title">
          <div className="account-hero"><span className="account-avatar">{initials(session)}</span><p className="eyebrow">Secure session</p><h1 id="mobile-account-title">{session.user.name || 'Actiproc account'}</h1><p className="summary">{session.user.email}</p></div>
          <div className="account-security"><ShieldCheck /><div><strong>Protected on this device</strong><span>Session tokens are encrypted using hardware-backed Android Keystore. Workspace data follows Actiproc team and role permissions.</span></div></div>
          <div className="account-details" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '0.75rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#94a3b8' }}>App Version</span><span>1.0.0-beta (Capacitor)</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#94a3b8' }}>Package ID</span><span>com.actiproc.app.dev</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#94a3b8' }}>Backend API</span><span>actiproc.com</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#94a3b8' }}>Frontend Bundle</span><span>Local Offline Package</span></div>
          </div>
          <button className="account-logout" type="button" onClick={() => void signOut()} disabled={busy}><LogOut />Log out of this device</button>
        </section>
      ) : null}
      <ActionPanel task={editingTask} open={Boolean(editingTask)} onClose={closeTaskEditor} />
    </>
  );
}

export function App() {
  const [screen, setScreen] = useState<Screen>('booting');
  const screenRef = useRef<Screen>('booting');
  const [session, setSession] = useState<MobileSessionTokens | null>(null);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);
  const [googleOAuthChecked, setGoogleOAuthChecked] = useState(false);

  useEffect(() => { screenRef.current = screen; }, [screen]);

  const enterWorkspace = useCallback(async (tokens: MobileSessionTokens) => {
    setSession(tokens);
    setScreen('workspace');
  }, []);

  const goBack = useCallback(() => {
    const event = new CustomEvent('axiom-mobile:back', { cancelable: true });
    window.dispatchEvent(event);
    if (event.defaultPrevented) return;
    if (screenRef.current === 'process') setScreen('workspace');
    else void NativeApp.minimizeApp();
  }, []);

  const selectRoot = useCallback((next: Extract<Screen, 'workspace' | 'planner' | 'knowledge' | 'ai' | 'account'>) => {
    setScreen(next);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    let active = true;
    void ensureDeviceId().catch(() => setError('Secure device storage is unavailable.'));
    void Network.getStatus().then((status) => active && setOnline(status.connected));
    const networkHandle = Network.addListener('networkStatusChange', (status) => setOnline(status.connected));
    const linkHandle = NativeApp.addListener('appUrlOpen', ({ url }) => {
      if (!url.includes('/mobile/auth/callback') && !url.includes('/auth/callback')) return;
      setBusy(true);
      setError(null);
      void completeGoogleSignIn(url)
        .then(enterWorkspace)
        .catch((cause) => setError(cause instanceof Error ? cause.message : 'Google sign-in failed.'))
        .finally(() => setBusy(false));
    });
    const backHandle = NativeApp.addListener('backButton', goBack);
    const setScreenFromSharedUi = (event: Event) => {
      const next = (event as CustomEvent<{ screen?: Screen }>).detail?.screen;
      if (next) setScreen(next);
    };
    window.addEventListener('axiom-mobile:set-screen', setScreenFromSharedUi);
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
      window.removeEventListener('axiom-mobile:set-screen', setScreenFromSharedUi);
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

  async function signOut() {
    setBusy(true);
    await logout();
    setSession(null);
    setScreen('signin');
    setBusy(false);
  }

  const authenticated = Boolean(session && screen !== 'signin' && screen !== 'booting');

  return (
    <main className={`mobile-shell screen-${screen}`}>
      <header className="app-header">
        {screen === 'process' ? (
          <button className="icon-button" type="button" onClick={goBack} aria-label="Go back"><ArrowLeft /></button>
        ) : <span className="brand-mark" aria-hidden="true"><Sparkles /></span>}
        <div className="brand-copy"><strong>Actiproc Beta</strong><span>{authenticated ? 'Mobile workspace' : 'Secure workspace'}</span></div>
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
          <p className="summary">Sign in with your existing Actiproc account. Your workspace permissions stay unchanged.</p>
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

      {authenticated && session ? (
        <MobilePlannerRuntime
          onOpenAction={(taskId) => window.dispatchEvent(new CustomEvent('axiom-mobile:open-action', { detail: { taskId } }))}
          onError={setError}
        >
          <MobileProductContent
            screen={screen}
            session={session}
            busy={busy}
            selectRoot={selectRoot}
            signOut={signOut}
          />
        </MobilePlannerRuntime>
      ) : null}

      {busy && authenticated ? <div className="busy-indicator" role="status"><div className="spinner" /><span>Updating workspace…</span></div> : null}
      {error && screen !== 'signin' ? <div className="notice error global-error" role="alert">{error}<button type="button" onClick={() => setError(null)}>Dismiss</button></div> : null}
      <Toaster richColors position="top-center" />
      {authenticated ? (
        <nav className="mobile-tab-bar" aria-label="Primary navigation">
          <button type="button" className={screen === 'workspace' ? 'is-active' : ''} onClick={() => selectRoot('workspace')}><Home /><span>Home</span></button>
          <button type="button" className={screen === 'planner' ? 'is-active' : ''} onClick={() => selectRoot('planner')}><CalendarDays /><span>Planner</span></button>
          <button type="button" className={screen === 'knowledge' ? 'is-active' : ''} onClick={() => selectRoot('knowledge')}><BookOpen /><span>Knowledge</span></button>
          <button type="button" className={screen === 'ai' ? 'is-active' : ''} onClick={() => selectRoot('ai')}><Bot /><span>AI</span></button>
          <button type="button" className={screen === 'account' ? 'is-active' : ''} onClick={() => selectRoot('account')}><UserRound /><span>Settings</span></button>
        </nav>
      ) : <footer>{Capacitor.getPlatform()} · local bundle</footer>}
    </main>
  );
}
