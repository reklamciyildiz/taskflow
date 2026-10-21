import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import {
  ArrowLeft, ChevronRight, CloudOff, FolderKanban,
  LayoutDashboard, ListChecks, LockKeyhole, LogOut, RefreshCw,
  ShieldCheck, Sparkles, Wifi,
} from 'lucide-react';
import type { MobileActionDetail, MobileProcessDetail, MobileSessionTokens, MobileWorkspace } from '../../shared/mobile-contracts';
import { AxiomActionList, AxiomChecklistList, AxiomProcessList } from '../../shared/product-ui/AxiomWorkspaceLists';
import {
  completeGoogleSignIn, credentialsSignIn, ensureDeviceId, loadAction,
  loadProcess, loadWorkspace, logout, mobileApiConfigured, restoreSession,
  startGoogleSignIn,
} from './mobile-api';

type Screen = 'booting' | 'signin' | 'workspace' | 'process' | 'action';
const googleOAuthEnabled = import.meta.env.VITE_AXIOM_GOOGLE_OAUTH_ENABLED === 'true';

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

function priorityLabel(priority: string | null): string {
  return priority ? priority.charAt(0).toUpperCase() + priority.slice(1) : 'Normal';
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
          <button className="secondary" onClick={() => void startGoogleSignIn().catch((cause) => setError(cause instanceof Error ? cause.message : 'Google sign-in failed.'))} disabled={busy || !online || !mobileApiConfigured() || !googleOAuthEnabled}>{googleOAuthEnabled ? 'Continue with Google' : 'Google sign-in — setup pending'}</button>
          {!googleOAuthEnabled ? <p className="security-note">Google sign-in will be enabled after the OAuth callback and Android App Link are verified.</p> : null}
          {error ? <div className="notice error" role="alert">{error}</div> : null}
          <p className="security-note secure-note"><ShieldCheck />Refresh credentials are protected by Android Keystore and never stored in localStorage.</p>
        </section>
      ) : null}

      {screen === 'workspace' && session && workspace ? (
        <section className="workspace" aria-labelledby="workspace-title">
          <div className="page-heading">
            <div className="heading-copy">
              <p className="date-label">{dateLabel}</p>
              <h1 id="workspace-title">{greeting()}, {firstName(session)}</h1>
              <p className="summary">Your work, organized around what matters now.</p>
            </div>
            <button className="icon-button quiet" type="button" onClick={() => void refreshWorkspace()} disabled={busy} aria-label="Refresh workspace"><RefreshCw className={busy ? 'spin' : ''} /></button>
          </div>

          <section className="overview-card" aria-label="Workspace overview">
            <div><span>Visible Processes</span><strong>{workspace.processes.length}</strong></div>
            <div className="overview-separator" />
            <div><span>Recent Actions</span><strong>{workspace.recentActions.length}</strong></div>
            <div className="overview-icon"><LayoutDashboard /></div>
          </section>

          <section className="content-section" id="mobile-processes">
            <div className="section-heading"><div><p className="eyebrow">Workspace</p><h2>Processes</h2></div><span>{workspace.processes.length}</span></div>
            <div className="item-list">{workspace.processes.length ? (
              <AxiomProcessList
                items={workspace.processes}
                onOpen={(id) => void openProcess(id)}
                disabled={busy}
              />
            ) : <div className="empty"><FolderKanban /><strong>No accessible Processes</strong><span>Your permitted workspace Processes will appear here.</span></div>}</div>
          </section>

          <section className="content-section">
            <div className="section-heading"><div><p className="eyebrow">Recently updated</p><h2>Actions</h2></div><span>{workspace.recentActions.length}</span></div>
            <div className="item-list">{workspace.recentActions.length ? (
              <AxiomActionList
                items={workspace.recentActions.map((action) => ({
                  id: action.id,
                  title: action.title,
                  contextLabel: action.projectName,
                  priorityLabel: priorityLabel(action.priority),
                }))}
                onOpen={(id) => void openAction(id)}
                disabled={busy}
              />
            ) : <div className="empty"><ListChecks /><strong>No recent Actions</strong><span>Recently updated work will appear here.</span></div>}</div>
          </section>

          <button className="logout-button" type="button" onClick={() => void signOut()} disabled={busy}><LogOut />Log out of this device</button>
        </section>
      ) : null}

      {screen === 'process' && processDetail ? (
        <section className="workspace detail-view" aria-labelledby="process-title">
          <div className="detail-hero">
            <span className="detail-icon"><FolderKanban /></span>
            <p className="eyebrow">Process</p>
            <h1 id="process-title">{processDetail.process.name}</h1>
            <p className="summary">{processDetail.process.visibility} workspace</p>
          </div>
          <div className="detail-metrics"><div><strong>{processDetail.process.activeActionCount}</strong><span>Active</span></div><div><strong>{processDetail.totalActions}</strong><span>Total Actions</span></div></div>
          <section className="content-section">
            <div className="section-heading"><div><p className="eyebrow">Current work</p><h2>Actions</h2></div><span>{processDetail.hasMore ? '50+' : processDetail.actions.length}</span></div>
            <div className="item-list">{processDetail.actions.length ? (
              <AxiomActionList
                items={processDetail.actions.map((action) => ({
                  id: action.id,
                  title: action.title,
                  stageLabel: action.stageLabel,
                  checklistLabel: `${action.checklist.completed}/${action.checklist.total} Checklist`,
                  completed: action.completed,
                }))}
                onOpen={(id) => void openAction(id)}
                disabled={busy}
              />
            ) : <div className="empty"><ListChecks /><strong>No accessible Actions</strong><span>This Process has no Actions you can view.</span></div>}</div>
          </section>
        </section>
      ) : null}

      {screen === 'action' && actionDetail ? (
        <section className="workspace detail-view" aria-labelledby="action-title">
          <div className="detail-hero action-hero">
            <div className="action-context"><span>{actionDetail.process?.name ?? 'General'}</span><ChevronRight /></div>
            <p className="eyebrow">Action</p>
            <h1 id="action-title">{actionDetail.title}</h1>
            <div className="action-meta"><span>{actionDetail.stageLabel}</span><span className={`priority priority-${actionDetail.priority ?? 'normal'}`}>{priorityLabel(actionDetail.priority)}</span></div>
          </div>
          {actionDetail.description ? <section className="description-card"><p className="eyebrow">Description</p><p>{actionDetail.description}</p></section> : null}
          <section className="content-section checklist-section">
            <div className="section-heading"><div><p className="eyebrow">Progress</p><h2>Checklist</h2></div><span>{actionDetail.checklist.filter((item) => item.checked).length}/{actionDetail.checklist.length}</span></div>
            {actionDetail.checklist.length ? <div className="progress-track" aria-hidden="true"><span style={{ width: `${Math.round((actionDetail.checklist.filter((item) => item.checked).length / actionDetail.checklist.length) * 100)}%` }} /></div> : null}
            <div className="checklist">{actionDetail.checklist.length ? (
              <AxiomChecklistList items={actionDetail.checklist} />
            ) : <div className="empty"><ListChecks /><strong>No Checklist items</strong><span>This Action does not have a Checklist yet.</span></div>}</div>
          </section>
        </section>
      ) : null}

      {busy && authenticated ? <div className="busy-indicator" role="status"><div className="spinner" /><span>Updating workspace…</span></div> : null}
      {error && screen !== 'signin' ? <div className="notice error global-error" role="alert">{error}<button type="button" onClick={() => setError(null)}>Dismiss</button></div> : null}
      <footer>{Capacitor.getPlatform()} · local bundle</footer>
    </main>
  );
}
