'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, CalendarDays, CheckSquare2, Home, Sparkles } from 'lucide-react';
import { useView, type ViewType } from '@/components/ViewContext';

/**
 * Only the native Capacitor Android/iOS WebView gets this navigation.
 * Mobile browsers and the existing TWA must retain the ordinary web shell.
 */
export function useCapacitorMobileNavigation(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const update = () => {
      const capacitor = window.Capacitor;
      const platform = capacitor?.getPlatform?.();
      setEnabled(
        capacitor?.isNativePlatform?.() === true &&
        (platform === 'android' || platform === 'ios') &&
        media.matches,
      );
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return enabled;
}

const TABS: Array<{
  href: string;
  label: string;
  view: ViewType;
  icon: typeof Home;
  matches: (pathname: string) => boolean;
}> = [
  { href: '/', label: 'Home', view: 'dashboard', icon: Home, matches: (p) => p === '/' || p === '/dashboard' },
  { href: '/planner', label: 'Planner', view: 'planner', icon: CalendarDays, matches: (p) => p === '/planner' || p.startsWith('/planner/') },
  { href: '/board', label: 'Actions', view: 'board', icon: CheckSquare2, matches: (p) => p === '/board' || p.startsWith('/board/') || p.startsWith('/dashboard/processes') },
  { href: '/dashboard/knowledge-hub', label: 'Knowledge', view: 'knowledge-hub', icon: BookOpen, matches: (p) => p.startsWith('/dashboard/knowledge-hub') },
  { href: '/ai', label: 'AI', view: 'ai', icon: Sparkles, matches: (p) => p === '/ai' || p.startsWith('/ai/') },
];

export function CapacitorBottomNavigation() {
  const pathname = usePathname() || '/';
  const { setCurrentView } = useView();

  return (
    <nav
      data-actiproc-native-bottom-navigation
      aria-label="Mobile primary navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-2 pt-2 shadow-[0_-12px_34px_-23px_rgba(0,0,0,0.5)] backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="mx-auto grid w-full max-w-lg grid-cols-5 gap-1">
        {TABS.map(({ href, label, view, icon: Icon, matches }) => {
          const active = matches(pathname);
          return (
            <Link
              key={href}
              href={href}
              scroll={false}
              prefetch={false}
              onClick={() => setCurrentView(view)}
              aria-current={active ? 'page' : undefined}
              className={
                'flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ' +
                (active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')
              }
            >
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
