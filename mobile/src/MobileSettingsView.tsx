import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft, Bell, CalendarDays, Check, ChevronRight, CreditCard,
  Globe2, LogOut, Moon, Palette, ShieldCheck, UserRound, Users,
} from 'lucide-react';
import { useTaskContext } from '../../components/TaskContext';
import { authenticatedRequest } from './mobile-api';
import type { MobileSessionTokens } from '../../shared/mobile-contracts';
import { useAppLocale } from '../../components/i18n/AppLocaleProvider';
import { AppLanguageSwitcher } from '../../components/i18n/AppLanguageSwitcher';

type Section = 'home' | 'profile' | 'account' | 'appearance' | 'notifications' | 'calendar' | 'members' | 'organization' | 'billing';
type SettingsData = {
  email_notifications?: boolean;
  push_notifications?: boolean;
  team_activity?: boolean;
  compact_view?: boolean;
  time_zone?: string | null;
};
type ProfileData = { name?: string; email?: string; avatar_url?: string };
type OrganizationData = { name?: string };
type BillingData = { plan?: string; subscriptionStatus?: string; endsAt?: string | null; seatLimit?: number | null; seatsUsed?: number };

const entries: { section: Exclude<Section, 'home'>; title: string; detail: string; Icon: typeof UserRound; adminOnly?: boolean }[] = [
  { section: 'profile', title: 'Profile', detail: 'Personal information', Icon: UserRound },
  { section: 'account', title: 'Account', detail: 'Security and device session', Icon: ShieldCheck },
  { section: 'appearance', title: 'Appearance', detail: 'Theme and density', Icon: Palette },
  { section: 'notifications', title: 'Notifications', detail: 'Email and team activity', Icon: Bell },
  { section: 'calendar', title: 'Calendar', detail: 'Time zone and integrations', Icon: CalendarDays },
  { section: 'members', title: 'Members', detail: 'Workspace members', Icon: Users },
  { section: 'organization', title: 'Organization', detail: 'Organization information', Icon: Globe2, adminOnly: true },
  { section: 'billing', title: 'Billing', detail: 'Current subscription (view only)', Icon: CreditCard, adminOnly: true },
];

const timeZones = [
  'UTC', 'Europe/Istanbul', 'Europe/London', 'Europe/Berlin', 'Europe/Paris',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
];

function settingRow(title: string, detail: string, checked: boolean, onChange: (checked: boolean) => void, disabled = false) {
  return (
    <label className="mobile-settings-toggle">
      <span><strong>{t(title)}</strong><small>{t(detail)}</small></span>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} disabled={disabled} />
    </label>
  );
}

export function MobileSettingsView({ session, onSignOut }: {
  session: MobileSessionTokens;
  onSignOut: () => Promise<void>;
}) {
  const { currentTeam, currentUser, organizationId, refreshData } = useTaskContext();
  const {t,date}=useAppLocale();
  const admin = currentUser?.role === 'admin' || (currentUser?.role as string) === 'owner';
  const [section, setSection] = useState<Section>('home');
  const [settings, setSettings] = useState<SettingsData>({});
  const [name, setName] = useState(session.user.name ?? '');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [orgName, setOrgName] = useState('');
  const [organization, setOrganization] = useState<OrganizationData | null>(null);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (target: Section) => {
    if (target === 'home' || target === 'account' || target === 'members') return;
    setLoading(true);
    setError(null);
    try {
      if (target === 'profile') {
        const p = await authenticatedRequest<ProfileData>('/api/users/profile');
        setProfile(p);
        setName(p.name ?? session.user.name ?? '');
      } else if (target === 'appearance' || target === 'notifications' || target === 'calendar') {
        const p = await authenticatedRequest<SettingsData>('/api/users/settings');
        setSettings(p);
      } else if (target === 'organization' && admin && organizationId) {
        const p = await authenticatedRequest<OrganizationData>(`/api/organizations/${encodeURIComponent(organizationId)}`);
        setOrganization(p);
        setOrgName(p.name ?? '');
      } else if (target === 'billing' && admin && organizationId) {
        setBilling(await authenticatedRequest<BillingData>('/api/billing/summary'));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not load settings.'));
    } finally {
      setLoading(false);
    }
  }, [admin, organizationId, session.user.name]);

  function navigate(next: Section) {
    setSection(next);
    setError(null);
    setMessage(null);
    void load(next);
  }

  async function persistPreference(key: keyof SettingsData, value: boolean | string) {
    const before = settings;
    setSettings(old => ({ ...old, [key]: value }));
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await authenticatedRequest('/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
      });
      setMessage(t('Settings saved.'));
    } catch (cause) {
      setSettings(before);
      setError(cause instanceof Error ? cause.message : t('Could not save settings.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      await authenticatedRequest('/api/users/profile', { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
      setMessage(t('Profile updated.'));
      await refreshData();
      void load('profile');
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not update profile.')); }
    finally { setSaving(false); }
  }

  async function saveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!admin || !organizationId || !orgName.trim()) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      await authenticatedRequest(`/api/organizations/${encodeURIComponent(organizationId)}`, {
        method: 'PATCH', body: JSON.stringify({ name: orgName.trim() }),
      });
      setOrganization({ name: orgName.trim() });
      setMessage(t('Organization updated.'));
      await refreshData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not update organization.')); }
    finally { setSaving(false); }
  }

  function setDarkMode(value: boolean) {
    setDark(value);
    window.localStorage.setItem('theme', value ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', value);
    document.documentElement.classList.toggle('light', !value);
    document.documentElement.style.colorScheme = value ? 'dark' : 'light';
  }

  const pageTitle = t(entries.find(entry => entry.section === section)?.title ?? 'Settings');

  return (
    <section className="workspace mobile-product-view mobile-settings-view" aria-label={t("Actiproc settings")}>
      {section === 'home' ? (
        <>
          <div className="mobile-settings-hero"><p className="mobile-more-eyebrow">{t("PREFERENCES")}</p><h1>{t("Settings")}</h1>
            <p>{t("Manage your account and workspace.")}</p>
          </div>
          <div className="mobile-settings-profile-summary">
            <span className="mobile-settings-avatar">{(profile?.name ?? session.user.name ?? session.user.email).slice(0, 1).toUpperCase()}</span>
            <span><strong>{profile?.name ?? session.user.name ?? t('Actiproc account')}</strong><small>{session.user.email}</small></span>
          </div>
          <div className="mobile-settings-menu">
            {entries.filter(item => !item.adminOnly || admin).map(({ section: target, title, detail, Icon }) => (
              <button type="button" key={target} onClick={() => navigate(target)} className="mobile-settings-menu-row">
                <Icon aria-hidden="true" />
                <span><strong>{title}</strong><small>{detail}</small></span>
                <ChevronRight aria-hidden="true" className="mobile-settings-chevron" />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mobile-settings-detail-heading">
            <button type="button" onClick={() => navigate('home')} aria-label={t("Back to settings")}><ArrowLeft /></button>
            <h1>{pageTitle}</h1>
          </div>
          {loading ? <p role="status" className="mobile-settings-muted">{t("Loading settings…")}</p> : null}
          {error ? <p role="alert" className="notice error">{error}</p> : null}
          {message ? <p role="status" className="notice">{message}</p> : null}
          {section === 'profile' && !loading && (
            <form className="mobile-settings-card mobile-settings-form" onSubmit={event => void saveProfile(event)}>
              <label>{t("Full name")}<input value={name} onChange={event => setName(event.target.value)} maxLength={120} required /></label>
              <label>{t("Email")}<input value={profile?.email ?? session.user.email} readOnly /></label>
              <button className="mobile-settings-primary" type="submit" disabled={saving || !name.trim()}>{t("Save profile")}</button>
            </form>
          )}
          {section === 'account' && (
            <div className="mobile-settings-card mobile-settings-info">
              <strong>{t("Signed in securely")}</strong><span>{session.user.email}</span>
              <p>{t("This device uses a protected mobile session. Password changes, two-factor authentication and session revocation require a separately audited native security flow.")}</p>
              <button className="mobile-settings-danger" type="button" onClick={() => void onSignOut()}> <LogOut /> {t("Log out of this device")}</button>
            </div>
          )}
          {section === 'appearance' && !loading && (
            <div className="mobile-settings-card">
              <div className="mobile-settings-info"><strong>{t("Application language")}</strong><p>{t("Choose the language used in navigation, settings, and system messages.")}</p><AppLanguageSwitcher /></div>
              {settingRow(t('Dark mode'), t('Use the dark Actiproc appearance'), dark, setDarkMode)}
              {settingRow(t('Compact view'), t('Reduce spacing in lists and boards'), settings.compact_view === true, v => void persistPreference('compact_view', v), saving)}
            </div>
          )}
          {section === 'notifications' && !loading && (
            <div className="mobile-settings-card">
              {settingRow(t('Email notifications'), t('Receive updates about Action assignments'), settings.email_notifications !== false, v => void persistPreference('email_notifications', v), saving)}
              {settingRow(t('Team activity'), t('Follow updates from your workspace'), settings.team_activity === true, v => void persistPreference('team_activity', v), saving)}
              <div className="mobile-settings-info"><strong>{t("Mobile push")}</strong><p>{t("Native Android push registration is not implemented yet. The web push switch does not enable Android notifications.")}</p></div>
            </div>
          )}
          {section === 'calendar' && !loading && (
            <div className="mobile-settings-card mobile-settings-form">
              <label>{t("Time zone")}
                <select value={settings.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'} onChange={event => void persistPreference('time_zone', event.target.value)} disabled={saving}>
                  {Array.from(new Set([settings.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC', ...timeZones])).map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </label>
              <div className="mobile-settings-info"><strong>Google Calendar</strong><p>{t("Calendar authorization and account linking are currently managed on the website. A native OAuth connection flow must be validated before enabling it here.")}</p></div>
            </div>
          )}
          {section === 'members' && (
            <div className="mobile-settings-card">
              <p className="mobile-settings-muted">{currentTeam?.name ?? t('Current workspace')} · {currentTeam?.members.length ?? 0} {t("members")}</p>
              {(currentTeam?.members ?? []).map(member => (
                <div className="mobile-settings-member" key={member.id}>
                  <span className="mobile-settings-avatar">{(member.name || member.email || '?').slice(0, 1).toUpperCase()}</span>
                  <span><strong>{member.name || member.email}</strong><small>{member.email} · {t(member.role)}</small></span>
                </div>
              ))}
              <p className="mobile-settings-muted">{t("Invites, role changes and removals are not yet supported by this mobile administration screen. Membership data remains shared with the web product.")}</p>
            </div>
          )}
          {section === 'organization' && admin && !loading && (
            <form className="mobile-settings-card mobile-settings-form" onSubmit={event => void saveOrganization(event)}>
              <label>{t("Organization name")}<input value={orgName} onChange={event => setOrgName(event.target.value)} required maxLength={120} /></label>
              <p className="mobile-settings-muted">{organization?.name ? t('Changes are shared across web and Android.') : t('Only organization administrators can change this name.')}</p>
              <button className="mobile-settings-primary" disabled={saving || !orgName.trim()} type="submit">{t("Save organization")}</button>
            </form>
          )}
          {section === 'billing' && admin && !loading && (
            <div className="mobile-settings-card mobile-settings-info">
              {billing ? <>
                <div className="mobile-settings-kv"><span>{t("Current plan")}</span><strong>{billing.plan ?? t('Unknown')}</strong></div>
                <div className="mobile-settings-kv"><span>{t("Subscription")}</span><strong>{billing.subscriptionStatus ?? t('Unknown')}</strong></div>
                <div className="mobile-settings-kv"><span>{t("Seats")}</span><strong>{billing.seatsUsed ?? 0} / {billing.seatLimit ?? t('Unlimited')}</strong></div>
                {billing.endsAt ? <div className="mobile-settings-kv"><span>{t("Ends on")}</span><strong>{date(billing.endsAt,{dateStyle:"medium"})}</strong></div> : null}
              </> : <p>{t("Subscription information is not available.")}</p>}
              <p>{t("Subscription details are read-only in the Android app. No purchase, upgrade, checkout or external payment link is offered here.")}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
