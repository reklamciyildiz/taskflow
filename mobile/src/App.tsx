import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import {
  ArrowLeft, BookOpen, CalendarDays, CheckSquare2, CloudOff, Grid2X2, Home,
  LockKeyhole,
  ShieldCheck, Sparkles, Wifi,
} from 'lucide-react';
import { SessionProvider } from './platform/next-auth-react';
import type { MobileActionDetail, MobileSessionTokens } from '../../shared/mobile-contracts';
import { notificationTargetFromLink, type NotificationTarget } from '../../lib/notification-nav-link';
import {
  completeGoogleSignIn, credentialsSignIn, ensureDeviceId,
  googleOAuthAvailable, logout, mobileApiConfigured, restoreSession,
  startGoogleSignIn, authenticatedFetch,
} from './mobile-api';
import { PlannerV2View } from '../../components/planner/PlannerV2View';
import { MobilePlannerRuntime } from './PlannerRuntimeAdapter';
import { MobileKnowledgeHub } from './MobileKnowledgeHub';
import { MobileMoreView } from './MobileMoreView';
import { MobileSettingsView } from './MobileSettingsView';
import { MobileListView } from './MobileListView';
import { Toaster } from 'sonner';
import { AxiomAIChatView } from '../../components/ai/AxiomAIChat';
import { DashboardV2 } from '../../components/dashboard/DashboardV2';
import { TaskBoard } from '../../components/TaskBoard';
import { ActionPanel } from '../../components/ActionPanel';
import { useTaskContext } from '../../components/TaskContext';
import { PlannerTeamSwitcher } from '../../components/planner/PlannerTeamSwitcher';

type Screen = 'booting' | 'signin' | 'workspace' | 'planner' | 'knowledge' | 'ai' | 'settings' | 'process' | 'more' | 'list';
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
  deepLinkTarget,
  onDeepLinkConsumed,
  onDeepLinkError,
}: {
  screen: Screen;
  session: MobileSessionTokens;
  busy: boolean;
  selectRoot: (screen: Extract<Screen, 'workspace' | 'planner' | 'knowledge' | 'ai' | 'settings' | 'more' | 'list'>) => void;
  signOut: () => Promise<void>;
  deepLinkTarget: NotificationTarget | null;
  onDeepLinkConsumed: () => void;
  onDeepLinkError: (message: string) => void;
}) {
  const {
    tasks,
    teams,
    currentTeam,
    loading,
    editingTaskId,
    openTaskEditor,
    closeTaskEditor,
    setBoardScope,
    setCurrentTeam,
    refreshData,
  } = useTaskContext();
  const editingTask = editingTaskId ? tasks.find((task) => task.id === editingTaskId) ?? null : null;
  const deepLinkLookupRef = useRef<string | null>(null);

  // Android verified App Links should open the canonical native Action panel.
  // Lookup is authorized by /api/mobile/actions/[id] before switching teams.
  useEffect(() => {
    if (!deepLinkTarget) { deepLinkLookupRef.current = null; return; }
    if (loading || !currentTeam?.id) return;
    const match = tasks.find((item) =>
      item.id === deepLinkTarget.taskId && item.teamId === currentTeam.id);
    if (match) {
      setBoardScope(match.projectId
        ? { type: 'project', projectId: match.projectId }
        : { type: 'general' });
      window.dispatchEvent(new CustomEvent('axiom-mobile:set-screen', {
        detail: { screen: 'process' },
      }));
      openTaskEditor(match.id, deepLinkTarget.checklistItemId, deepLinkTarget.noteId);
      onDeepLinkConsumed();
      return;
    }
    const lookupKey = currentTeam.id + ':' + deepLinkTarget.taskId;
    if (deepLinkLookupRef.current === lookupKey) return;
    deepLinkLookupRef.current = lookupKey;
    let active = true;
    void authenticatedFetch('/api/mobile/actions/' + encodeURIComponent(deepLinkTarget.taskId))
      .then(async response => {
        const result = await response.json().catch(() => null) as { success?: boolean; data?: MobileActionDetail } | null;
        if (!active) return;
        const teamId = result?.success && result.data?.teamId;
        if (!response.ok || !teamId || !teams.some(team => team.id === teamId)) {
          onDeepLinkError('This notification\'s Action is no longer available or your access has changed.');
          onDeepLinkConsumed();
          return;
        }
        if (teamId !== currentTeam.id) setCurrentTeam(teamId);
        else void refreshData();
      }).catch(() => {
        if (!active) return;
        onDeepLinkError('Could not load this notification. Check your connection and try again.');
        onDeepLinkConsumed();
      });
    return () => { active = false; };
  }, [deepLinkTarget, currentTeam?.id, loading, tasks, teams,
      setCurrentTeam, setBoardScope, refreshData, openTaskEditor,
      onDeepLinkConsumed, onDeepLinkError]);

  useEffect(() => {
    const navigate = (event: Event) => {
      const path = String((event as CustomEvent<{ path?: string }>).detail?.path ?? '');
      const url = new URL(path || '/', 'https://mobile.axiom.local');
      if (url.pathname === '/planner') selectRoot('planner');
      else if (url.pathname === '/dashboard/knowledge-hub') selectRoot('knowledge');
      else if (url.pathname === '/list') selectRoot('list');
      else if (url.pathname.startsWith('/settings')) selectRoot('settings');
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
      {(screen === 'workspace' || screen === 'process' || screen === 'list') ? (
        <div className="mobile-workspace-toolbar"><PlannerTeamSwitcher /></div>
      ) : null}
      {screen === 'workspace' ? <section className="workspace mobile-pwa-view"><DashboardV2 /></section> : null}
      {screen === 'process' ? <section className="workspace mobile-pwa-view mobile-board-view"><TaskBoard /></section> : null}
      {screen === 'planner' ? <PlannerV2View /> : null}
      {screen === 'list' ? <MobileListView /> : null}
      {screen === 'settings' ? <MobileSettingsView session={session} onSignOut={signOut} /> : null}
      {screen === 'more' ? <MobileMoreView onNavigate={(destination) => {
        if (destination === 'process') window.dispatchEvent(new CustomEvent('axiom-mobile:set-screen', { detail: { screen: 'process' } }));
        else selectRoot(destination);
      }} /> : null}
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
  const [nativeNotificationTarget, setNativeNotificationTarget] = useState<NotificationTarget | null>(null);
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
    else if (['list', 'ai', 'settings'].includes(screenRef.current)) setScreen('more');
    else if (screenRef.current === 'more') setScreen('workspace');
    else void NativeApp.minimizeApp();
  }, []);

  const selectRoot = useCallback((next: Extract<Screen, 'workspace' | 'planner' | 'knowledge' | 'ai' | 'settings' | 'more' | 'list'>) => {
    setScreen(next);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    let active = true;
    void ensureDeviceId().catch(() => setError('Secure device storage is unavailable.'));
    void Network.getStatus().then((status) => active && setOnline(status.connected));
    const networkHandle = Network.addListener('networkStatusChange', (status) => setOnline(status.connected));
    const handledUrls = new Set<string>();
    const handleIncomingUrl = (url: string) => {
      if (!url) return;
      // Native links are trusted only for verified first-party HTTPS hosts.
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' &&
            (parsed.hostname === 'actiproc.com' || parsed.hostname === 'www.actiproc.com') &&
            parsed.pathname === '/board') {
          const target = notificationTargetFromLink(url);
          if (target) {
            setNativeNotificationTarget(target);
            return;
          }
        }
      } catch { /* OAuth custom scheme is handled below. */ }
      if (handledUrls.has(url)) return;
      if (!url.includes('/mobile/auth/callback') && !url.includes('/auth/callback')) return;
      handledUrls.add(url);
      setBusy(true);
      setError(null);
      void completeGoogleSignIn(url)
        .then(enterWorkspace)
        .catch((cause) => setError(cause instanceof Error ? cause.message : 'Google sign-in failed.'))
        .finally(() => setBusy(false));
    };

    void NativeApp.getLaunchUrl().then((launch) => {
      if (launch?.url) {
        handleIncomingUrl(launch.url);
      }
    });

    const linkHandle = NativeApp.addListener('appUrlOpen', ({ url }) => {
      handleIncomingUrl(url);
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
    <SessionProvider>
      <main className={`mobile-shell screen-${screen}`}>
      <header className="app-header">
        {screen === 'process' || screen === 'list' ? (
          <button className="icon-button" type="button" onClick={goBack} aria-label="Go back"><ArrowLeft /></button>
        ) : <span className="brand-mark" aria-hidden="true"><Sparkles /></span>}
        <div className="brand-copy"><strong>Actiproc Beta</strong><span>{authenticated ? 'Mobile workspace' : 'Secure workspace'}</span></div>
        <span className={`network-status ${online ? 'online' : 'offline'}`} aria-label={online ? 'Online' : 'Offline'}>{online ? <Wifi /> : <CloudOff />}</span>
        {authenticated ? <button type="button" className="avatar mobile-account-shortcut" title={session?.user.email} aria-label="Account settings" onClick={() => selectRoot('settings')}>{session ? initials(session) : ''}</button> : null}
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
            deepLinkTarget={nativeNotificationTarget}
            onDeepLinkConsumed={() => setNativeNotificationTarget(null)}
            onDeepLinkError={setError}
          />
        </MobilePlannerRuntime>
      ) : null}

      {busy && authenticated ? <div className="busy-indicator" role="status"><div className="spinner" /><span>Updating workspace…</span></div> : null}
      {error && screen !== 'signin' ? <div className="notice error global-error" role="alert">{error}<button type="button" onClick={() => setError(null)}>Dismiss</button></div> : null}
      <Toaster richColors position="top-center" />
      {authenticated ? (
        <nav className="mobile-tab-bar" aria-label="Primary navigation">
          <button type="button" aria-current={screen === 'workspace' ? 'page' : undefined} className={screen === 'workspace' ? 'is-active' : ''} onClick={() => selectRoot('workspace')}><Home /><span>Home</span></button>
          <button type="button" aria-current={screen === 'planner' ? 'page' : undefined} className={screen === 'planner' ? 'is-active' : ''} onClick={() => selectRoot('planner')}><CalendarDays /><span>Planner</span></button>
          <button type="button" aria-current={screen === 'process' ? 'page' : undefined} className={screen === 'process' ? 'is-active' : ''} onClick={() => setScreen('process')}><CheckSquare2 /><span>Actions</span></button>
          <button type="button" aria-current={screen === 'knowledge' ? 'page' : undefined} className={screen === 'knowledge' ? 'is-active' : ''} onClick={() => selectRoot('knowledge')}><BookOpen /><span>Knowledge</span></button>
          <button type="button" aria-current={['more', 'ai', 'list', 'settings'].includes(screen) ? 'page' : undefined} className={['more', 'ai', 'list', 'settings'].includes(screen) ? 'is-active' : ''} onClick={() => selectRoot('more')}><Grid2X2 /><span>More</span></button>
        </nav>
      ) : <footer>{Capacitor.getPlatform()} · local bundle</footer>}
      </main>
    </SessionProvider>
  );
}
