'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

/** URL’e göre vurgula (yenilemede doğru kalsın); gerekirse view context’e düş. */
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

interface SidebarProps {
  isOpen: boolean;
  onCloseSidebar: () => void;
}

export function Sidebar({ isOpen, onCloseSidebar }: SidebarProps) {
  const pathname = usePathname();
  const { currentView, setCurrentView } = useView();
  const { tasks, currentTeam, teams, setCurrentTeam, currentUser, setFilter, filter, updateTeam, organizationName } = useTaskContext();
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  // Filter tasks by current team
  const teamTasks = tasks.filter(t => t.teamId === currentTeam?.id);

  const taskCounts = {
    todo: teamTasks.filter(t => t.status === 'todo').length,
    progress: teamTasks.filter(t => t.status === 'progress').length,
    review: teamTasks.filter(t => t.status === 'review').length,
    done: teamTasks.filter(t => t.status === 'done').length
  };

  // Quick filter counts - also filtered by current team
  const dueTodayCount = teamTasks.filter(t => t.dueDate && isToday(t.dueDate) && t.status !== 'done').length;
  const highPriorityCount = teamTasks.filter(t => (t.priority === 'high' || t.priority === 'urgent') && t.status !== 'done').length;
  const assignedToMeCount = teamTasks.filter(t => t.assigneeId === currentUser?.id && t.status !== 'done').length;

  const applyQuickFilter = (filterType: 'dueToday' | 'highPriority' | 'assignedToMe') => {
    if (filter === filterType) {
      setFilter(null);
    } else {
      setFilter(filterType);
    }
    setCurrentView('board');
    onCloseSidebar();
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

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onCloseSidebar}
        />
      )}
      
      {/* Sidebar */}
      <div className={cn(
        "fixed lg:relative inset-y-0 left-0 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out z-50",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex flex-col h-full min-h-0">
          {/* Logo & Organization */}
          <div className="p-6 border-b">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center">
                <LayoutDashboard className="h-4 w-4 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold">TaskFlow</h1>
            </div>
            <p className="text-xs text-muted-foreground pl-11">{organizationName}</p>
          </div>

          {/* Team info */}
          {currentTeam && (
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-gradient-to-br from-secondary to-secondary/80 rounded-lg flex items-center justify-center">
                  <Users className="h-5 w-5 text-secondary-foreground" />
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold text-sm">{currentTeam.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {currentTeam.members.filter(m => m.isOnline).length} online • {currentTeam.members.length} total
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setEditingTeam(currentTeam)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
              
              {/* Team Switcher */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground mb-2">TEAMS</p>
                {teams.filter(team => team.id !== currentTeam.id).map((team) => (
                  <Button
                    key={team.id}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 h-8 px-2 text-xs"
                    onClick={() => setCurrentTeam(team.id)}
                  >
                    <div className="w-6 h-6 bg-gradient-to-br from-primary/20 to-primary/10 rounded flex items-center justify-center">
                      <Users className="h-3 w-3 text-primary" />
                    </div>
                    <span>{team.name}</span>
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 h-8 px-2 text-xs text-primary hover:text-primary"
                  onClick={() => setShowCreateTeam(true)}
                >
                  <div className="w-6 h-6 bg-gradient-to-br from-primary/20 to-primary/10 rounded flex items-center justify-center">
                    <Plus className="h-3 w-3 text-primary" />
                  </div>
                  <span>Create New Team</span>
                </Button>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2 overscroll-contain">
            {menuItems.map((item) => {
              const isActive = isNavItemActive(item.id, pathname, currentView);
              const href = VIEW_ROUTES[item.id];
              return (
              <Button
                key={item.id}
                asChild
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn(
                  "w-full justify-start gap-3 h-11 px-3 relative",
                  isActive && "bg-secondary text-secondary-foreground font-medium ring-1 ring-primary/25",
                  (item.id === 'dashboard' || item.id === 'board') && isActive && "before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-r before:bg-primary"
                )}
              >
                <Link
                  href={href ?? '/'}
                  prefetch
                  scroll={false}
                  onClick={() => {
                    setCurrentView(item.id);
                    onCloseSidebar();
                  }}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.count !== undefined && (
                    <Badge variant="secondary" className="h-5 px-2 text-xs">
                      {item.count}
                    </Badge>
                  )}
                </Link>
              </Button>
            );
            })}

            {/* Quick filters */}
            <div className="pt-4">
              <p className="text-xs font-medium text-muted-foreground mb-3 px-3">QUICK FILTERS</p>
              <div className="space-y-1">
                <Button
                  asChild
                  variant={filter === 'dueToday' ? 'secondary' : 'ghost'}
                  className="w-full justify-start gap-3 h-9 px-3 text-sm"
                >
                  <Link
                    href="/board"
                    prefetch
                    scroll={false}
                    onClick={() => applyQuickFilter('dueToday')}
                  >
                    <Calendar className="h-4 w-4 shrink-0" />
                    Due Today
                    <Badge variant={dueTodayCount > 0 ? 'destructive' : 'outline'} className="h-5 px-2 text-xs ml-auto">
                      {dueTodayCount}
                    </Badge>
                  </Link>
                </Button>
                <Button
                  asChild
                  variant={filter === 'highPriority' ? 'secondary' : 'ghost'}
                  className="w-full justify-start gap-3 h-9 px-3 text-sm"
                >
                  <Link
                    href="/board"
                    prefetch
                    scroll={false}
                    onClick={() => applyQuickFilter('highPriority')}
                  >
                    <Tag className="h-4 w-4 shrink-0" />
                    High Priority
                    <Badge variant="outline" className="h-5 px-2 text-xs ml-auto">
                      {highPriorityCount}
                    </Badge>
                  </Link>
                </Button>
                <Button
                  asChild
                  variant={filter === 'assignedToMe' ? 'secondary' : 'ghost'}
                  className="w-full justify-start gap-3 h-9 px-3 text-sm"
                >
                  <Link
                    href="/board"
                    prefetch
                    scroll={false}
                    onClick={() => applyQuickFilter('assignedToMe')}
                  >
                    <Archive className="h-4 w-4 shrink-0" />
                    Assigned to Me
                    <Badge variant="outline" className="h-5 px-2 text-xs ml-auto">
                      {assignedToMeCount}
                    </Badge>
                  </Link>
                </Button>
              </div>
            </div>
          </nav>

          {/* Status summary */}
          <div className="p-4 border-t bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground mb-3">TASK STATUS</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">To Do</span>
                <span className="font-medium">{taskCounts.todo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">In Progress</span>
                <span className="font-medium">{taskCounts.progress}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Review</span>
                <span className="font-medium">{taskCounts.review}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Done</span>
                <span className="font-medium text-green-600">{taskCounts.done}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CreateTeamModal 
        open={showCreateTeam} 
        onClose={() => setShowCreateTeam(false)} 
      />

      <EditTeamModal
        team={editingTeam}
        open={!!editingTeam}
        onClose={() => setEditingTeam(null)}
        onSave={updateTeam}
      />
    </>
  );
}