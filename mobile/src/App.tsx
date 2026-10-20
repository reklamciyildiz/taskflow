import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import type { MobileActionDetail, MobileProcessDetail, MobileSessionTokens, MobileWorkspace } from '../../shared/mobile-contracts';
import {
  completeGoogleSignIn,
  credentialsSignIn,
  ensureDeviceId,
  loadAction,
  loadProcess,
  loadWorkspace,
  logout,
  mobileApiConfigured,
  restoreSession,
  startGoogleSignIn,
} from './mobile-api';

type Screen = 'booting' | 'signin' | 'workspace' | 'process' | 'action';
const googleOAuthEnabled = import.meta.env.VITE_AXIOM_GOOGLE_OAUTH_ENABLED === 'true';

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

  useEffect(() => { screenRef.current = screen; }, [screen]);

  const enterWorkspace = useCallback(async (tokens: MobileSessionTokens) => {
    setSession(tokens);
    setWorkspace(await loadWorkspace());
    setScreen('workspace');
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
    const backHandle = NativeApp.addListener('backButton', () => {
      if (screenRef.current === 'action') setScreen('process');
      else if (screenRef.current === 'process') setScreen('workspace');
      else void NativeApp.minimizeApp();
    });
    if (!mobileApiConfigured()) setScreen('signin');
    else void restoreSession()
      .then((tokens) => tokens ? enterWorkspace(tokens) : setScreen('signin'))
      .catch(() => setScreen('signin'));
    return () => {
      active = false;
      void Promise.all([networkHandle, linkHandle, backHandle])
        .then((handles) => Promise.all(handles.map((handle) => handle.remove())));
    };
  }, [enterWorkspace]);

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

  async function openProcess(processId: string) {
    setBusy(true);
    setError(null);
    try {
      setProcessDetail(await loadProcess(processId));
      setActionDetail(null);
      setScreen('process');
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

  return (
    <main className="mobile-shell">
      <header className="app-header">
        <span className="brand-mark">A</span><strong>Axiom</strong>
        <span className={`network-pill ${online ? 'online' : 'offline'}`}>{online ? 'Online' : 'Offline'}</span>
      </header>
      {!online ? <div className="offline-banner" role="status">You are offline. Reconnect to continue.</div> : null}
      {screen === 'booting' ? <section className="panel centered"><div className="spinner" /><p>Restoring your secure session...</p></section> : null}
      {screen === 'signin' ? (
        <section className="panel auth-panel" aria-labelledby="signin-title">
          <p className="eyebrow">Secure mobile access</p><h1 id="signin-title">Welcome back</h1>
          <p className="summary">Sign in with your existing Axiom account. Your workspace permissions stay unchanged.</p>
          {!mobileApiConfigured() ? <div className="notice error">Mobile API URL is not configured in this development build.</div> : null}
          <form onSubmit={signIn}>
            <label>Email<input name="email" type="email" autoComplete="email" required disabled={busy || !online} /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required disabled={busy || !online} /></label>
            <button className="primary" disabled={busy || !online || !mobileApiConfigured()}>{busy ? 'Signing in...' : 'Sign in'}</button>
          </form>
          <div className="divider"><span>or</span></div>
          <button className="secondary" onClick={() => void startGoogleSignIn().catch((cause) => setError(cause instanceof Error ? cause.message : 'Google sign-in failed.'))} disabled={busy || !online || !mobileApiConfigured() || !googleOAuthEnabled}>{googleOAuthEnabled ? 'Continue with Google' : 'Google sign-in — setup pending'}</button>
          {!googleOAuthEnabled ? <p className="security-note">Google sign-in will be enabled after the staging OAuth callback and Android App Link are verified.</p> : null}
          {error ? <div className="notice error" role="alert">{error}</div> : null}
          <p className="security-note">Refresh credentials are encrypted by Android Keystore and never stored in localStorage.</p>
        </section>
      ) : null}
      {screen === 'workspace' && session && workspace ? (
        <section className="workspace" aria-labelledby="workspace-title">
          <div className="workspace-heading"><div><p className="eyebrow">Workspace</p><h1 id="workspace-title">Dashboard</h1><p className="summary">Signed in as {session.user.email}</p></div><button className="text-button" onClick={() => void signOut()} disabled={busy}>Log out</button></div>
          <div className="metric-row"><div><strong>{workspace.processes.length}</strong><span>Visible processes</span></div><div><strong>{workspace.recentActions.length}</strong><span>Recent actions</span></div></div>
          <h2 className="section-title">Processes</h2>
          <div className="process-list">{workspace.processes.length ? workspace.processes.map((process) => <button key={process.id} className="process-row" onClick={() => void openProcess(process.id)} disabled={busy}><div><h3>{process.name}</h3><p>{process.visibility} · {process.activeActionCount} active</p></div><span aria-hidden="true">›</span></button>) : <div className="empty">No accessible processes were found.</div>}</div>
          <h2 className="section-title recent-title">Recent actions</h2>
          <div className="process-list">{workspace.recentActions.map((action) => <button key={action.id} className="process-row" onClick={() => void openAction(action.id)} disabled={busy}><div><h3>{action.title}</h3><p>{action.projectName} · {action.priority ?? 'normal'}</p></div><span aria-hidden="true">›</span></button>)}</div>
        </section>
      ) : null}
      {screen === 'process' && processDetail ? (
        <section className="workspace" aria-labelledby="process-title">
          <button className="back-button" onClick={() => setScreen('workspace')}>← Dashboard</button>
          <p className="eyebrow">Process</p><h1 id="process-title">{processDetail.process.name}</h1>
          <p className="summary">{processDetail.totalActions} actions · {processDetail.process.activeActionCount} active</p>
          <div className="process-list action-list">{processDetail.actions.length ? processDetail.actions.map((action) => <button key={action.id} className="process-row" onClick={() => void openAction(action.id)} disabled={busy}><div><h3>{action.title}</h3><p>{action.stageLabel} · {action.checklist.completed}/{action.checklist.total} checklist</p></div><span aria-hidden="true">›</span></button>) : <div className="empty">No accessible actions were found.</div>}</div>
        </section>
      ) : null}
      {screen === 'action' && actionDetail ? (
        <section className="workspace" aria-labelledby="action-title">
          <button className="back-button" onClick={() => setScreen(processDetail ? 'process' : 'workspace')}>← {processDetail?.process.name ?? 'Dashboard'}</button>
          <p className="eyebrow">Action</p><h1 id="action-title" className="action-title">{actionDetail.title}</h1>
          <div className="action-meta"><span>{actionDetail.stageLabel}</span><span>{actionDetail.priority ?? 'normal'}</span></div>
          {actionDetail.description ? <p className="action-description">{actionDetail.description}</p> : null}
          <h2 className="section-title">Checklist</h2>
          <div className="checklist">{actionDetail.checklist.length ? actionDetail.checklist.map((item) => <div key={item.id} className="checklist-row"><span className={item.checked ? 'check done' : 'check'}>{item.checked ? '✓' : ''}</span><span>{item.text}</span></div>) : <div className="empty">No checklist items.</div>}</div>
        </section>
      ) : null}
      {error && screen !== 'signin' ? <div className="notice error global-error" role="alert">{error}</div> : null}
      <footer>{Capacitor.getPlatform()} · local bundle</footer>
    </main>
  );
}
