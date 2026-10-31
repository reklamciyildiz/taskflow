import {
  BarChart3, Bot, ChevronRight, ExternalLink, LayoutList, Plug,
  Settings2, Trophy, Users, Building2,
} from 'lucide-react';
import { Browser } from '@capacitor/browser';
import { useState } from 'react';

type NativeDestination = 'workspace' | 'planner' | 'process' | 'list' | 'knowledge' | 'ai' | 'settings';

const shortcuts = [
  { title: 'Actiproc AI', detail: 'Your workspace assistant', destination: 'ai', Icon: Bot },
  { title: 'List View', detail: 'Search, filter and edit Actions', destination: 'list', Icon: LayoutList },
  { title: 'Settings', detail: 'Profile, account, appearance and workspace', destination: 'settings', Icon: Settings2 },
] as const;

const webModules = [
  { title: 'Customers', path: '/customers', Icon: Building2 },
  { title: 'Integrations', path: '/integrations', Icon: Plug },
  { title: 'Analytics', path: '/analytics', Icon: BarChart3 },
  { title: 'Achievements', path: '/achievements', Icon: Trophy },
  { title: 'Team', path: '/team', Icon: Users },
] as const;

export function MobileMoreView({ onNavigate }: { onNavigate: (destination: NativeDestination) => void }) {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openWeb(path: string) {
    setOpening(path);
    setError(null);
    try {
      // Only known, fixed first-party feature routes. No billing, checkout,
      // pricing, external-store or upgrade destination is linked from the APK.
      await Browser.open({ url: `https://www.actiproc.com${path}`, presentationStyle: 'popover' });
    } catch {
      setError('Could not open this web module. Check your connection and try again.');
    } finally {
      setOpening(null);
    }
  }

  return (
    <section className="workspace mobile-more-view mobile-product-view" aria-label="All Actiproc features">
      <div className="mobile-more-intro">
        <p className="mobile-more-eyebrow">WORKSPACE</p>
        <h1>More</h1>
        <p>Tools and settings in one place.</p>
      </div>

      <div className="mobile-more-section-heading">
        <h2>Quick access</h2>
        <span>In the app</span>
      </div>
      <div className="mobile-more-shortcuts">
        {shortcuts.map(({ title, detail, destination, Icon }) => (
          <button type="button" key={destination} onClick={() => onNavigate(destination)} className="mobile-more-shortcut-row">
            <span className="mobile-more-shortcut-icon"><Icon aria-hidden="true" /></span>
            <span className="mobile-more-item-copy"><strong>{title}</strong><small>{detail}</small></span>
            <ChevronRight aria-hidden="true" className="mobile-more-chevron" />
          </button>
        ))}
      </div>

      <div className="mobile-more-section-heading">
        <h2>Workspace tools</h2>
        <span>Web</span>
      </div>
      <p className="mobile-more-note">
        These tools currently open the Actiproc website. You might need to sign in to the web separately.
      </p>
      <div className="mobile-more-grid">
        {webModules.map(({ title, path, Icon }) => (
          <button type="button" key={path} disabled={opening !== null} onClick={() => void openWeb(path)} className="mobile-more-item">
            <Icon aria-hidden="true" />
            <span className="mobile-more-item-copy"><strong>{title}</strong><small>Open web</small></span>
            <ExternalLink aria-hidden="true" className="mobile-more-link-icon" />
          </button>
        ))}
      </div>
      {error ? <p role="alert" className="notice error">{error}</p> : null}
    </section>
  );
}
