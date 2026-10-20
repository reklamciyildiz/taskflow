import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import type { MobileSessionTokens, MobileWorkspace } from '../../shared/mobile-contracts';
import { completeGoogleSignIn, credentialsSignIn, ensureDeviceId, loadWorkspace, logout, mobileApiConfigured, restoreSession, startGoogleSignIn } from './mobile-api';

type Screen = 'booting' | 'signin' | 'workspace';

export function App() {
  const [screen, setScreen] = useState<Screen>('booting');
  const [session, setSession] = useState<MobileSessionTokens | null>(null);
  const [workspace, setWorkspace] = useState<MobileWorkspace | null>(null);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setBusy(true); setError(null);
      void completeGoogleSignIn(url).then(enterWorkspace).catch((cause) => setError(cause instanceof Error ? cause.message : 'Google sign-in failed.')).finally(() => setBusy(false));
    });
    const backHandle = NativeApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back(); else void NativeApp.minimizeApp();
    });
    if (!mobileApiConfigured()) setScreen('signin');
    else void restoreSession().then((tokens) => tokens ? enterWorkspace(tokens) : setScreen('signin')).catch(() => setScreen('signin'));
    return () => { active = false; void Promise.all([networkHandle, linkHandle, backHandle]).then((handles) => Promise.all(handles.map((handle) => handle.remove()))); };
  }, [enterWorkspace]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try { await enterWorkspace(await credentialsSignIn(String(form.get('email') ?? ''), String(form.get('password') ?? ''))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    await logout();
    setSession(null); setWorkspace(null); setScreen('signin'); setBusy(false);
  }

  return (
    <main className="mobile-shell">
      <header className="app-header"><span className="brand-mark">A</span><strong>Axiom</strong><span className={`network-pill ${online ? 'online' : 'offline'}`}>{online ? 'Online' : 'Offline'}</span></header>
      {!online ? <div className="offline-banner" role="status">You are offline. Reconnect to continue.</div> : null}
      {screen === 'booting' ? <section className="panel centered"><div className="spinner" /><p>Restoring your secure session…</p></section> : null}
      {screen === 'signin' ? (
        <section className="panel auth-panel" aria-labelledby="signin-title">
          <p className="eyebrow">Secure mobile access</p><h1 id="signin-title">Welcome back</h1>
          <p className="summary">Sign in with your existing Axiom account. Your workspace permissions stay unchanged.</p>
          {!mobileApiConfigured() ? <div className="notice error">Mobile API URL is not configured in this development build.</div> : null}
          <form onSubmit={signIn}>
            <label>Email<input name="email" type="email" autoComplete="email" required disabled={busy || !online} /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required disabled={busy || !online} /></label>
            <button className="primary" disabled={busy || !online || !mobileApiConfigured()}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <div className="divider"><span>or</span></div>
          <button className="secondary" onClick={() => void startGoogleSignIn().catch((cause) => setError(cause instanceof Error ? cause.message : 'Google sign-in failed.'))} disabled={busy || !online || !mobileApiConfigured()}>Continue with Google</button>
          {error ? <div className="notice error" role="alert">{error}</div> : null}
          <p className="security-note">Refresh credentials are encrypted by Android Keystore and never stored in localStorage.</p>
        </section>
      ) : null}
      {screen === 'workspace' && session && workspace ? (
        <section className="workspace" aria-labelledby="workspace-title">
          <div className="workspace-heading"><div><p className="eyebrow">Workspace</p><h1 id="workspace-title">Your processes</h1><p className="summary">Signed in as {session.user.email}</p></div><button className="text-button" onClick={() => void signOut()} disabled={busy}>Log out</button></div>
          <div className="metric-row"><div><strong>{workspace.processes.length}</strong><span>Visible processes</span></div><div><strong>{workspace.recentActions.length}</strong><span>Recent actions</span></div></div>
          <div className="process-list">{workspace.processes.length ? workspace.processes.map((process) => <article key={process.id} className="process-row"><div><h2>{process.name}</h2><p>{process.visibility} · {process.activeActionCount} active</p></div><span aria-hidden="true">›</span></article>) : <div className="empty">No accessible processes were found.</div>}</div>
        </section>
      ) : null}
      <footer>{Capacitor.getPlatform()} · local bundle</footer>
    </main>
  );
}
