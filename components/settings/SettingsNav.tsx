'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTaskContext } from '@/components/TaskContext';
import {
  User, Shield, Palette, Bell, Calendar, Users,
  Globe, CreditCard, LogOut, ChevronRight,
} from 'lucide-react';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
};

const PERSONAL_ITEMS: NavItem[] = [
  { href: '/settings/profile',       label: 'Profile',       icon: User },
  { href: '/settings/account',       label: 'Account',       icon: Shield },
  { href: '/settings/appearance',    label: 'Appearance',    icon: Palette },
  { href: '/settings/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings/calendar',      label: 'Calendar',      icon: Calendar },
  { href: '/settings/members',       label: 'Members',       icon: Users },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: '/settings/organization', label: 'Organization', icon: Globe },
  { href: '/settings/billing',      label: 'Billing',      icon: CreditCard },
];

const BOTTOM_ITEMS: NavItem[] = [
  { href: '/settings/workspace', label: 'Workspace', icon: LogOut, danger: true },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-secondary text-secondary-foreground'
          : item.danger
          ? 'text-muted-foreground hover:bg-muted hover:text-orange-600 dark:hover:text-orange-400'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {active && <ChevronRight className="ml-auto h-3 w-3 shrink-0 opacity-40" />}
    </Link>
  );
}

export function SettingsNav() {
  const pathname = usePathname();
  const { currentUser } = useTaskContext();
  const isAdmin = currentUser?.role === 'admin' || (currentUser?.role as any) === 'owner';

  const isActive = (href: string) =>
    pathname === href || (pathname?.startsWith(`${href}/`) ?? false);

  const allMobile = [
    ...PERSONAL_ITEMS,
    ...(isAdmin ? ADMIN_ITEMS : []),
    ...BOTTOM_ITEMS,
  ];

  return (
    <>
      {/* ── Mobile: horizontal scrollable tab bar ── */}
      <div className="lg:hidden border-b bg-card">
        <div className="flex gap-1 overflow-x-auto px-3 py-2 scrollbar-hide">
          {allMobile.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                isActive(item.href)
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Desktop: sticky vertical sidebar ── */}
      <nav className="hidden lg:flex lg:flex-col w-52 xl:w-56 shrink-0 border-r bg-card/50 p-3 gap-0.5 sticky top-0 self-start min-h-[calc(100vh-4rem)]">
        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          Personal
        </p>
        {PERSONAL_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        {isAdmin && (
          <>
            <div className="my-2 border-t" />
            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              Workspace
            </p>
            {ADMIN_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} />
            ))}
          </>
        )}

        <div className="mt-auto pt-2 border-t">
          {BOTTOM_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </div>
      </nav>
    </>
  );
}
