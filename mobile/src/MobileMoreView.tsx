import {
  BarChart3, BookOpen, Bot, CalendarDays, CheckSquare2,
  ExternalLink, Home, LayoutList, Plug, Settings, Trophy, Users, Building2,
} from 'lucide-react';
import { Browser } from '@capacitor/browser';
import { useState } from 'react';

type NativeDestination = 'workspace' | 'planner' | 'process' | 'list' | 'knowledge' | 'ai';
const nativeItems: { title: string; subtitle: string; destination: NativeDestination; Icon: typeof Home }[] = [
  { title: 'Dashboard', subtitle: 'Native', destination: 'workspace', Icon: Home },
  { title: 'Planner', subtitle: 'Native', destination: 'planner', Icon: CalendarDays },
  { title: 'Projects / Board', subtitle: 'Native', destination: 'process', Icon: CheckSquare2 },
  { title: 'List View', subtitle: 'Native', destination: 'list', Icon: LayoutList },
  { title: 'Knowledge Hub', subtitle: 'Native', destination: 'knowledge', Icon: BookOpen },
  { title: 'Actiproc AI', subtitle: 'Native', destination: 'ai', Icon: Bot },
];
const webItems: { title: string; path: string; Icon: typeof Home }[] = [
  { title: 'Customers', path: '/customers', Icon: Building2 },
  { title: 'Integrations', path: '/integrations', Icon: Plug },
  { title: 'Analytics', path: '/analytics', Icon: BarChart3 },
  { title: 'Achievements', path: '/achievements', Icon: Trophy },
  { title: 'Team', path: '/team', Icon: Users },
  { title: 'Settings', path: '/settings', Icon: Settings },
];

export function MobileMoreView({ onNavigate }: { onNavigate: (destination: NativeDestination) => void }) {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function openWeb(path: string) {
    setOpening(path);
    setError(null);
    try {
      // Fixed, reviewed Actiproc routes only. Never pass user-supplied URLs.
      await Browser.open({ url: `https://www.actiproc.com${path}`, presentationStyle: 'popover' });
    } catch {
      setError('Could not open this web module. Check your connection and try again.');
    } finally {
      setOpening(null);
    }
  }
  return (
    <section className="workspace mobile-more-view mobile-product-view" aria-label="All Actiproc features">
      <h1>All features</h1>
      <p className="mobile-more-subtitle">Your existing workspace, with all modules accessible from one place.</p>
      <h2>In this app</h2>
      <div className="mobile-more-grid">
        {nativeItems.map(({ title, subtitle, destination, Icon }) => (
          <button type="button" key={destination} onClick={() => onNavigate(destination)} className="mobile-more-item">
            <Icon aria-hidden="true" /><span className="mobile-more-item-copy"><strong>{title}</strong><small>{subtitle}</small></span>
          </button>
        ))}
      </div>
      <h2>Web modules</h2>
      <p className="mobile-more-note">
        These modules are available through the Actiproc website while their mobile screens are being built.
        Your browser may ask you to sign in separately.
      </p>
      <div className="mobile-more-grid">
        {webItems.map(({ title, path, Icon }) => (
          <button type="button" key={path} disabled={opening !== null} onClick={() => void openWeb(path)} className="mobile-more-item">
            <Icon aria-hidden="true" /><span className="mobile-more-item-copy"><strong>{title}</strong><small>Open web</small></span><ExternalLink aria-hidden="true" className="mobile-more-link-icon" />
          </button>
        ))}
      </div>
      {error ? <p role="alert" className="notice error">{error}</p> : null}
    </section>
  );
}
