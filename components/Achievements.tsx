'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useTaskContext } from '@/components/TaskContext';
import {
  resolveTaskBoardColumnId,
  isTerminalBoardColumn,
  FALLBACK_BOARD_COLUMNS,
  type Task,
  type ProjectColumnConfig,
} from '@/lib/types';
import {
  Trophy, Flame, Target, Zap, Star, Award, Crown, Rocket,
  CheckCircle2, Clock, Users, TrendingUp, Layers, ShieldCheck,
  Flag, Timer, UserCheck, Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Tier config ──────────────────────────────────────────────────────────────

type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';
type Category = 'productivity' | 'process' | 'streak' | 'speed' | 'team';

const TIER_POINTS: Record<Tier, number> = {
  bronze: 10, silver: 25, gold: 50, platinum: 100,
};

const TIER_GRADIENT: Record<Tier, string> = {
  bronze:   'from-orange-400 to-orange-600',
  silver:   'from-gray-300 to-gray-500',
  gold:     'from-yellow-400 to-yellow-600',
  platinum: 'from-cyan-300 to-cyan-500',
};

const TIER_CARD: Record<Tier, string> = {
  bronze:   'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20',
  silver:   'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50',
  gold:     'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20',
  platinum: 'border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20',
};

const CATEGORY_META: Record<Category, { label: string; icon: React.ReactNode }> = {
  productivity: { label: 'Productivity',        icon: <Target className="h-4 w-4" /> },
  process:      { label: 'Process & Pipeline',  icon: <Layers className="h-4 w-4" /> },
  streak:       { label: 'Streaks',             icon: <Flame className="h-4 w-4" /> },
  speed:        { label: 'Speed & Priority',    icon: <Zap className="h-4 w-4" /> },
  team:         { label: 'Team & Collaboration',icon: <Users className="h-4 w-4" /> },
};

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  progress: number;
  maxProgress: number;
  unlocked: boolean;
  tier: Tier;
  category: Category;
}

// ─── Achievement card ─────────────────────────────────────────────────────────

function AchievementCard({ a }: { a: Achievement }) {
  const pct = Math.round((a.progress / a.maxProgress) * 100);
  const almostThere = !a.unlocked && pct >= 50;

  return (
    <div
      className={cn(
        'flex gap-3 rounded-xl border-2 p-4 transition-all',
        a.unlocked ? TIER_CARD[a.tier] : 'border-border bg-muted/30 opacity-60',
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          a.unlocked
            ? `bg-gradient-to-br ${TIER_GRADIENT[a.tier]} text-white shadow-sm`
            : 'bg-muted-foreground/20 text-muted-foreground',
        )}
      >
        {a.icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold leading-tight">{a.name}</span>
          {a.unlocked ? (
            <Badge variant="outline" className="text-xs capitalize">{a.tier}</Badge>
          ) : almostThere ? (
            <Badge variant="secondary" className="text-xs">Almost!</Badge>
          ) : null}
          <span className="ml-auto shrink-0 text-xs font-medium text-muted-foreground">
            +{TIER_POINTS[a.tier]}pts
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{a.progress} / {a.maxProgress}</span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
      </div>
    </div>
  );
}

// ─── Category section ─────────────────────────────────────────────────────────

function CategorySection({
  category, achievements,
}: {
  category: Category;
  achievements: Achievement[];
}) {
  const meta = CATEGORY_META[category];
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-muted-foreground">{meta.icon}</span>
        <h2 className="text-sm font-semibold">{meta.label}</h2>
        <Badge variant="secondary" className="text-xs">
          {unlockedCount}/{achievements.length}
        </Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {achievements.map(a => <AchievementCard key={a.id} a={a} />)}
      </div>
    </section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const CATEGORY_ORDER: Category[] = ['productivity', 'process', 'streak', 'speed', 'team'];

export function Achievements() {
  const { tasks, projects, currentTeam, currentUser, generalBoardColumns } = useTaskContext();

  // ── Column resolver (same pattern as Analytics) ────────────────────────────
  const columnsForTask = useMemo(() => {
    const map = new Map<string, ProjectColumnConfig[]>(
      projects.map(p => [p.id, p.columnConfig.length > 0 ? p.columnConfig : FALLBACK_BOARD_COLUMNS])
    );
    const fallbackGeneral = generalBoardColumns.length > 0 ? generalBoardColumns : FALLBACK_BOARD_COLUMNS;
    return (task: Task): ProjectColumnConfig[] =>
      task.projectId ? (map.get(task.projectId) ?? FALLBACK_BOARD_COLUMNS) : fallbackGeneral;
  }, [projects, generalBoardColumns]);

  const isComplete = useMemo(
    () => (task: Task) => {
      const cols = columnsForTask(task);
      return isTerminalBoardColumn(resolveTaskBoardColumnId(task.status, cols), cols);
    },
    [columnsForTask],
  );

  // ── All derived stats in one memo ──────────────────────────────────────────
  const stats = useMemo(() => {
    const teamTasks = tasks.filter(t => t.teamId === currentTeam?.id);
    const userTasks = teamTasks.filter(t => t.assigneeId === currentUser?.id);
    const completedUserTasks = userTasks.filter(isComplete);
    const completedTeamTasks = teamTasks.filter(isComplete);

    // Streak: consecutive days (backward from today) with at least 1 completion
    const byDay = new Set(
      completedUserTasks.map(t => {
        const d = new Date(t.updatedAt);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
    );
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (byDay.has(key)) streak++;
      else if (i > 0) break;
    }

    // Speed Demon: max completions in a single calendar day
    const dayCounts = new Map<string, number>();
    for (const t of completedUserTasks) {
      const d = new Date(t.updatedAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    }
    const maxInOneDay = dayCounts.size > 0 ? Math.max(...dayCounts.values()) : 0;

    // Process-based stats: iterate all projects as "processes"
    let processesWithCompletion = 0;
    let completedInProcesses = 0;
    let perfectProcessCount = 0;
    for (const project of projects) {
      const userProjectTasks = userTasks.filter(t => t.projectId === project.id);
      const completedInProject = userProjectTasks.filter(isComplete);
      if (completedInProject.length > 0) {
        processesWithCompletion++;
        completedInProcesses += completedInProject.length;
      }
      // Perfect: user had tasks in this process and completed every one
      if (userProjectTasks.length > 0 && completedInProject.length === userProjectTasks.length) {
        perfectProcessCount++;
      }
    }

    // Priority stats
    const urgentCompleted = completedUserTasks.filter(t => t.priority === 'urgent').length;
    const highUrgentCompleted = completedUserTasks.filter(
      t => t.priority === 'high' || t.priority === 'urgent'
    ).length;

    // Team contribution percentage
    const teamContribPct =
      completedTeamTasks.length > 0
        ? (completedUserTasks.length / completedTeamTasks.length) * 100
        : 0;

    return {
      userTasks,
      completedUserTasks,
      streak,
      maxInOneDay,
      processesWithCompletion,
      completedInProcesses,
      perfectProcessCount,
      totalProcesses: projects.length,
      urgentCompleted,
      highUrgentCompleted,
      teamContribPct,
    };
  }, [tasks, projects, currentTeam, currentUser, isComplete]);

  const {
    userTasks, completedUserTasks, streak, maxInOneDay,
    processesWithCompletion, completedInProcesses, perfectProcessCount, totalProcesses,
    urgentCompleted, highUrgentCompleted, teamContribPct,
  } = stats;

  // ── Achievement definitions ────────────────────────────────────────────────
  const achievements = useMemo<Achievement[]>(() => [
    // Productivity
    {
      id: 'first-task',
      name: 'First Steps',
      description: 'Complete your first task',
      icon: <CheckCircle2 className="h-5 w-5" />,
      progress: Math.min(completedUserTasks.length, 1),
      maxProgress: 1,
      unlocked: completedUserTasks.length >= 1,
      tier: 'bronze',
      category: 'productivity',
    },
    {
      id: 'task-master',
      name: 'Task Master',
      description: 'Complete 10 tasks',
      icon: <Target className="h-5 w-5" />,
      progress: Math.min(completedUserTasks.length, 10),
      maxProgress: 10,
      unlocked: completedUserTasks.length >= 10,
      tier: 'silver',
      category: 'productivity',
    },
    {
      id: 'productivity-pro',
      name: 'Productivity Pro',
      description: 'Complete 50 tasks',
      icon: <Rocket className="h-5 w-5" />,
      progress: Math.min(completedUserTasks.length, 50),
      maxProgress: 50,
      unlocked: completedUserTasks.length >= 50,
      tier: 'gold',
      category: 'productivity',
    },
    {
      id: 'legend',
      name: 'Legend',
      description: 'Complete 100 tasks',
      icon: <Crown className="h-5 w-5" />,
      progress: Math.min(completedUserTasks.length, 100),
      maxProgress: 100,
      unlocked: completedUserTasks.length >= 100,
      tier: 'platinum',
      category: 'productivity',
    },
    // Process & Pipeline
    {
      id: 'process-pioneer',
      name: 'Process Pioneer',
      description: 'Complete your first task inside a pipeline process',
      icon: <Layers className="h-5 w-5" />,
      progress: Math.min(completedInProcesses, 1),
      maxProgress: 1,
      unlocked: completedInProcesses >= 1,
      tier: 'bronze',
      category: 'process',
    },
    {
      id: 'pipeline-champion',
      name: 'Pipeline Champion',
      description: 'Complete 10 tasks across all processes',
      icon: <TrendingUp className="h-5 w-5" />,
      progress: Math.min(completedInProcesses, 10),
      maxProgress: 10,
      unlocked: completedInProcesses >= 10,
      tier: 'silver',
      category: 'process',
    },
    {
      id: 'all-rounder',
      name: 'All-Rounder',
      description: `Contribute to every process (${Math.max(totalProcesses, 1)} total)`,
      icon: <Star className="h-5 w-5" />,
      progress: Math.min(processesWithCompletion, Math.max(totalProcesses, 1)),
      maxProgress: Math.max(totalProcesses, 1),
      unlocked: totalProcesses > 0 && processesWithCompletion >= totalProcesses,
      tier: 'gold',
      category: 'process',
    },
    {
      id: 'process-perfectionist',
      name: 'Process Perfectionist',
      description: 'Complete all your assigned tasks in at least one full process',
      icon: <ShieldCheck className="h-5 w-5" />,
      progress: Math.min(perfectProcessCount, 1),
      maxProgress: 1,
      unlocked: perfectProcessCount >= 1,
      tier: 'platinum',
      category: 'process',
    },
    // Streaks
    {
      id: 'streak-starter',
      name: 'Streak Starter',
      description: 'Maintain a 3-day completion streak',
      icon: <Flame className="h-5 w-5" />,
      progress: Math.min(streak, 3),
      maxProgress: 3,
      unlocked: streak >= 3,
      tier: 'bronze',
      category: 'streak',
    },
    {
      id: 'on-fire',
      name: 'On Fire',
      description: 'Maintain a 7-day completion streak',
      icon: <Zap className="h-5 w-5" />,
      progress: Math.min(streak, 7),
      maxProgress: 7,
      unlocked: streak >= 7,
      tier: 'silver',
      category: 'streak',
    },
    {
      id: 'unstoppable',
      name: 'Unstoppable',
      description: 'Maintain a 14-day completion streak',
      icon: <Trophy className="h-5 w-5" />,
      progress: Math.min(streak, 14),
      maxProgress: 14,
      unlocked: streak >= 14,
      tier: 'gold',
      category: 'streak',
    },
    {
      id: 'marathon',
      name: 'Marathon Runner',
      description: 'Maintain a 30-day completion streak',
      icon: <Award className="h-5 w-5" />,
      progress: Math.min(streak, 30),
      maxProgress: 30,
      unlocked: streak >= 30,
      tier: 'platinum',
      category: 'streak',
    },
    // Speed & Priority
    {
      id: 'urgent-responder',
      name: 'Urgent Responder',
      description: 'Complete your first urgent-priority task',
      icon: <Clock className="h-5 w-5" />,
      progress: Math.min(urgentCompleted, 1),
      maxProgress: 1,
      unlocked: urgentCompleted >= 1,
      tier: 'bronze',
      category: 'speed',
    },
    {
      id: 'priority-handler',
      name: 'Priority Handler',
      description: 'Complete 5 high or urgent tasks',
      icon: <Flag className="h-5 w-5" />,
      progress: Math.min(highUrgentCompleted, 5),
      maxProgress: 5,
      unlocked: highUrgentCompleted >= 5,
      tier: 'silver',
      category: 'speed',
    },
    {
      id: 'speed-demon',
      name: 'Speed Demon',
      description: 'Complete 5 tasks in a single day',
      icon: <Timer className="h-5 w-5" />,
      progress: Math.min(maxInOneDay, 5),
      maxProgress: 5,
      unlocked: maxInOneDay >= 5,
      tier: 'gold',
      category: 'speed',
    },
    // Team & Collaboration
    {
      id: 'team-player',
      name: 'Team Player',
      description: 'Be part of a team with 3 or more members',
      icon: <Users className="h-5 w-5" />,
      progress: Math.min(currentTeam?.members.length ?? 0, 3),
      maxProgress: 3,
      unlocked: (currentTeam?.members.length ?? 0) >= 3,
      tier: 'bronze',
      category: 'team',
    },
    {
      id: 'top-contributor',
      name: 'Top Contributor',
      description: "Handle at least 25% of your team's completed tasks",
      icon: <UserCheck className="h-5 w-5" />,
      progress: Math.min(Math.round(teamContribPct), 25),
      maxProgress: 25,
      unlocked: teamContribPct >= 25,
      tier: 'silver',
      category: 'team',
    },
    {
      id: 'team-cornerstone',
      name: 'Team Cornerstone',
      description: "Handle at least half of your team's completed tasks",
      icon: <Building2 className="h-5 w-5" />,
      progress: Math.min(Math.round(teamContribPct), 50),
      maxProgress: 50,
      unlocked: teamContribPct >= 50,
      tier: 'gold',
      category: 'team',
    },
  ], [
    completedUserTasks.length,
    completedInProcesses,
    processesWithCompletion,
    totalProcesses,
    perfectProcessCount,
    streak,
    urgentCompleted,
    highUrgentCompleted,
    maxInOneDay,
    teamContribPct,
    currentTeam?.members.length,
  ]);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const totalPoints = achievements.reduce(
    (sum, a) => sum + (a.unlocked ? TIER_POINTS[a.tier] : 0), 0
  );

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100 dark:border-purple-800 dark:from-purple-900/20 dark:to-purple-900/10">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-xl bg-purple-500 p-3">
              <Trophy className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-purple-700 dark:text-purple-300">Achievements</p>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                {unlockedCount}/{achievements.length}
              </p>
              <p className="text-xs text-purple-600 dark:text-purple-400">{totalPoints} total points</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-orange-100 dark:border-orange-800 dark:from-orange-900/20 dark:to-orange-900/10">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-xl bg-orange-500 p-3">
              <Flame className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-orange-700 dark:text-orange-300">Current Streak</p>
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                {streak} {streak === 1 ? 'day' : 'days'}
              </p>
              <p className="text-xs text-orange-600 dark:text-orange-400">consecutive days with completions</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:border-emerald-800 dark:from-emerald-900/20 dark:to-emerald-900/10">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-xl bg-emerald-500 p-3">
              <CheckCircle2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-emerald-700 dark:text-emerald-300">Tasks Completed</p>
              <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                {completedUserTasks.length}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                out of {userTasks.length} assigned
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category sections */}
      {CATEGORY_ORDER.map(cat => (
        <CategorySection
          key={cat}
          category={cat}
          achievements={achievements.filter(a => a.category === cat)}
        />
      ))}
    </div>
  );
}
