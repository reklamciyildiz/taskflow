'use client';

import { useEffect, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  Columns3,
  Library,
  List,
  BarChart3,
  Settings,
  Users,
  UserPlus,
  Calendar,
  Tag,
  Archive,
  Plus,
  Pencil,
  Trophy,
  Building2,
  Webhook,
  Brain,
} from 'lucide-react';
import { useTaskContext, Team } from '@/components/TaskContext';
import { useView, ViewType } from '@/components/ViewContext';
import { CreateTeamModal } from '@/components/CreateTeamModal';
import { EditTeamModal } from '@/components/EditTeamModal';
import { isToday } from 'date-fns';
import { useMediaQuery } from '@/hooks/use-media-query';

interface MenuItem {
  id: ViewType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
}

const VIEW_ROUTES: Partial<Record<ViewType, string>> = {
  'knowledge-hub': '/dashboard/knowledge-hub',
  processes: '/dashboard/processes',
  settings: '/settings',
  profile: '/profile',
  dashboard: '/',
  board: '/board',
  list: '/list',
  customers: '/customers',
  integrations: '/integrations',
  analytics: '/analytics',
  achievements: '/achievements',
  team: '/team',
};

function pathMatchesRoute(pathname: string | null, route: string): boolean {
  if (!pathname) return false;
  if (route === '/') return pathname === '/';
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isNavItemActive(itemId: ViewType, pathname: string | null, currentView: ViewType): boolean {
  if (itemId === 'knowledge-hub') {
    return Boolean(pathname?.startsWith('/dashboard/knowledge-hub')) || currentView === 'knowledge-hub';
  }
  const route = VIEW_ROUTES[itemId];
  if (route !== undefined) {
    return pathMatchesRoute(pathname, route) || currentView === itemId;
  }
  return currentView === itemId;
}

function NavTip({ label, narrow, children }: { label: string; narrow: boolean; children: ReactElement }) {
  if (!narrow) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="max-w-[240px]">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

interface SidebarProps {
  /** Mobil çekmece açık mı */
  mobileOpen: boolean;
  onCloseMobile: () => void;
  /** lg+ dar ikon şeridi (tercih localStorage’da saklanır) */
  desktopCollapsed: boolean;
}

export function Sidebar({ mobileOpen, onCloseMobile, desktopCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const narrow = desktopCollapsed && isDesktop;
  const { currentView, setCurrentView } = useView();
  const { tasks, currentTeam, teams, setCurrentTeam, currentUser, setFilter, filter, updateTeam, organizationName } =
    useTaskContext();
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  useEffect(() => {
    if (isDesktop) onCloseMobile();
  }, [isDesktop, onCloseMobile]);

  useEffect(() => {
    if (!isDesktop) onCloseMobile();
  }, [pathname, isDesktop, onCloseMobile]);

  useEffect(() => {
    if (!mobileOpen || isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, isDesktop, onCloseMobile]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (mobileOpen && !isDesktop) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileOpen, isDesktop]);

  const teamTasks = tasks.filter((t) => t.teamId === currentTeam?.id);

  const taskCounts = {
    todo: teamTasks.filter((t) => t.status === 'todo').length,
    progress: teamTasks.filter((t) => t.status === 'progress').length,
    review: teamTasks.filter((t) => t.status === 'review').length,
    done: teamTasks.filter((t) => t.status === 'done').length,
  };

  const dueTodayCount = teamTasks.filter((t) => t.dueDate && isToday(t.dueDate) && t.status !== 'done').length;
  const highPriorityCount = teamTasks.filter(
    (t) => (t.priority === 'high' || t.priority === 'urgent') && t.status !== 'done'
  ).length;
  const assignedToMeCount = teamTasks.filter((t) => t.assigneeId === currentUser?.id && t.status !== 'done').length;

  const applyQuickFilter = (filterType: 'dueToday' | 'highPriority' | 'assignedToMe') => {
    if (filter === filterType) {
      setFilter(null);
    } else {
      setFilter(filterType);
    }
    setCurrentView('board');
    onCloseMobile();
  };

  const menuItems: MenuItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'board', label: 'Projects / Board', icon: Columns3, count: teamTasks.length },
    { id: 'list', label: 'List View', icon: List, count: teamTasks.length },
    { id: 'processes', label: 'Süreç Merkezi', icon: Library },
    { id: 'knowledge-hub', label: 'Knowledge Hub', icon: Brain },
    { id: 'customers', label: 'Customers', icon: Building2 },
    { id: 'integrations', label: 'Integrations', icon: Webhook },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'achievements', label: 'Achievements', icon: Trophy },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'profile', label: 'Profile', icon: UserPlus },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const navBtnClass = (isActive: boolean, itemId: ViewType) =>
    cn(
      'w-full gap-3 h-11 relative',
      narrow ? 'lg:justify-center lg:gap-0 lg:px-0 lg:h-11' : 'justify-start px-3',
      isActive && 'bg-secondary text-secondary-foreground font-medium ring-1 ring-primary/25',
      (itemId === 'dashboard' || itemId === 'board') &&
        isActive &&
        'before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-r before:bg-primary lg:before:hidden'
    );

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-label="Menüyü kapat"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-card shadow-xl transition-[transform,width] duration-200 ease-out lg:relative lg:z-0 lg:translate-x-0 lg:shadow-none',
          'w-64 max-lg:w-64',
          desktopCollapsed ? 'lg:w-[4.5rem]' : 'lg:w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          'min-h-0 overflow-x-hidden'
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Logo */}
          {!narrow ? (
            <div className="border-b p-6">
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80">
                  <LayoutDashboard className="h-4 w-4 text-primary-foreground" />
                </div>
                <h1 className="text-xl font-bold">TaskFlow</h1>
              </div>
              <p className="pl-11 text-xs text-muted-foreground">{organizationName}</p>
            </div>
          ) : (
            <div className="flex justify-center border-b p-3">
              <NavTip label={`TaskFlow — ${organizationName}`} narrow={narrow}>
                <Button variant="ghost" size="sm" className="h-10 w-10 shrink-0 p-0" asChild>
                  <Link href="/" prefetch scroll={false} onClick={() => onCloseMobile()}>
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80">
                      <LayoutDashboard className="h-4 w-4 text-primary-foreground" />
                    </span>
                  </Link>
                </Button>
              </NavTip>
            </div>
          )}

          {/* Team */}
          {currentTeam && !narrow && (
            <div className="border-b bg-muted/30 px-6 py-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-secondary to-secondary/80">
                  <Users className="h-5 w-5 text-secondary-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold">{currentTeam.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {currentTeam.members.filter((m) => m.isOnline).length} online • {currentTeam.members.length} total
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0" onClick={() => setEditingTeam(currentTeam)}>
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
              <div className="space-y-1">
                <p className="mb-2 text-xs font-medium text-muted-foreground">TEAMS</p>
                {teams
                  .filter((team) => team.id !== currentTeam.id)
                  .map((team) => (
                    <Button
                      key={team.id}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-full justify-start gap-2 px-2 text-xs"
                      onClick={() => setCurrentTeam(team.id)}
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-primary/20 to-primary/10">
                        <Users className="h-3 w-3 text-primary" />
                      </div>
                      <span className="truncate">{team.name}</span>
                    </Button>
                  ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full justify-start gap-2 px-2 text-xs text-primary hover:text-primary"
                  onClick={() => setShowCreateTeam(true)}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-primary/20 to-primary/10">
                    <Plus className="h-3 w-3 text-primary" />
                  </div>
                  <span>Create New Team</span>
                </Button>
              </div>
            </div>
          )}

          {currentTeam && narrow && (
            <div className="border-b bg-muted/30 p-2">
              <NavTip label={`${currentTeam.name} — Takım`} narrow={narrow}>
                <Button variant="ghost" size="sm" className="h-11 w-full p-0 lg:justify-center" asChild>
                  <Link href="/team" prefetch scroll={false} onClick={() => onCloseMobile()}>
                    <Users className="h-5 w-5 shrink-0 text-secondary-foreground" />
                  </Link>
                </Button>
              </NavTip>
            </div>
          )}

          <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-4">
            {menuItems.map((item) => {
              const isActive = isNavItemActive(item.id, pathname, currentView);
              const href = VIEW_ROUTES[item.id];
              const label =
                item.count !== undefined ? `${item.label} (${item.count})` : item.label;
              return (
                <NavTip key={item.id} label={label} narrow={narrow}>
                  <Button
                    asChild
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={navBtnClass(isActive, item.id)}
                  >
                    <Link
                      href={href ?? '/'}
                      prefetch
                      scroll={false}
                      onClick={() => {
                        setCurrentView(item.id);
                        onCloseMobile();
                      }}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className={cn('flex-1 text-left', narrow && 'lg:sr-only')}>{item.label}</span>
                      {item.count !== undefined && (
                        <Badge variant="secondary" className={cn('h-5 px-2 text-xs', narrow && 'lg:hidden')}>
                          {item.count}
                        </Badge>
                      )}
                    </Link>
                  </Button>
                </NavTip>
              );
            })}

            {!narrow && (
              <div className="pt-4">
                <p className="mb-3 px-3 text-xs font-medium text-muted-foreground">QUICK FILTERS</p>
                <div className="space-y-1">
                  <Button
                    asChild
                    variant={filter === 'dueToday' ? 'secondary' : 'ghost'}
                    className="h-9 w-full justify-start gap-3 px-3 text-sm"
                  >
                    <Link href="/board" prefetch scroll={false} onClick={() => applyQuickFilter('dueToday')}>
                      <Calendar className="h-4 w-4 shrink-0" />
                      Due Today
                      <Badge variant={dueTodayCount > 0 ? 'destructive' : 'outline'} className="ml-auto h-5 px-2 text-xs">
                        {dueTodayCount}
                      </Badge>
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant={filter === 'highPriority' ? 'secondary' : 'ghost'}
                    className="h-9 w-full justify-start gap-3 px-3 text-sm"
                  >
                    <Link href="/board" prefetch scroll={false} onClick={() => applyQuickFilter('highPriority')}>
                      <Tag className="h-4 w-4 shrink-0" />
                      High Priority
                      <Badge variant="outline" className="ml-auto h-5 px-2 text-xs">
                        {highPriorityCount}
                      </Badge>
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant={filter === 'assignedToMe' ? 'secondary' : 'ghost'}
                    className="h-9 w-full justify-start gap-3 px-3 text-sm"
                  >
                    <Link href="/board" prefetch scroll={false} onClick={() => applyQuickFilter('assignedToMe')}>
                      <Archive className="h-4 w-4 shrink-0" />
                      Assigned to Me
                      <Badge variant="outline" className="ml-auto h-5 px-2 text-xs">
                        {assignedToMeCount}
                      </Badge>
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </nav>

          {!narrow && (
            <div className="border-t bg-muted/30 p-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground">TASK STATUS</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">To Do</span>
                  <span className="font-medium tabular-nums">{taskCounts.todo}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">In Progress</span>
                  <span className="font-medium tabular-nums">{taskCounts.progress}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Review</span>
                  <span className="font-medium tabular-nums">{taskCounts.review}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Done</span>
                  <span className="font-medium tabular-nums text-green-600">{taskCounts.done}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      <CreateTeamModal open={showCreateTeam} onClose={() => setShowCreateTeam(false)} />

      <EditTeamModal team={editingTeam} open={!!editingTeam} onClose={() => setEditingTeam(null)} onSave={updateTeam} />
    </>
  );
}
