'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTaskContext } from '@/components/TaskContext';
import { Leaderboard } from '@/components/Leaderboard';
import { ExportModal } from '@/components/ExportModal';
import { 
  TrendingUp, 
  Clock, 
  Target, 
  Users,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Zap,
  BarChart3,
  Download
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function Analytics() {
  const { tasks, currentTeam } = useTaskContext();
  const [showExport, setShowExport] = useState(false);

  const teamTasks = tasks.filter(task => task.teamId === currentTeam?.id);
  const completedTasks = teamTasks.filter(task => task.status === 'done');
  const overdueTasks = teamTasks.filter(task => 
    task.dueDate && 
    task.dueDate < new Date() && 
    task.status !== 'done'
  );

  const completionRate = teamTasks.length > 0 
    ? Math.round((completedTasks.length / teamTasks.length) * 100) 
    : 0;

  const statusDistribution = {
    todo: teamTasks.filter(t => t.status === 'todo').length,
    progress: teamTasks.filter(t => t.status === 'progress').length,
    review: teamTasks.filter(t => t.status === 'review').length,
    done: teamTasks.filter(t => t.status === 'done').length,
  };

  const priorityDistribution = {
    urgent: teamTasks.filter(t => t.priority === 'urgent').length,
    high: teamTasks.filter(t => t.priority === 'high').length,
    medium: teamTasks.filter(t => t.priority === 'medium').length,
    low: teamTasks.filter(t => t.priority === 'low').length,
  };

  // Calculate real productivity metrics
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const tasksCompletedThisWeek = completedTasks.filter(task => 
    task.updatedAt >= oneWeekAgo
  ).length;

  // Calculate average completion time (in days)
  const completedWithDates = completedTasks.filter(task => task.createdAt && task.updatedAt);
  const avgCompletionDays = completedWithDates.length > 0
    ? completedWithDates.reduce((sum, task) => {
        const days = (task.updatedAt.getTime() - task.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        return sum + days;
      }, 0) / completedWithDates.length
    : 0;

  const productivityMetrics = {
    tasksCompletedThisWeek,
    averageCompletionTime: avgCompletionDays > 0 ? `${avgCompletionDays.toFixed(1)} days` : 'N/A',
    onTimeDelivery: completedTasks.length > 0 ? Math.round((completedTasks.length - overdueTasks.length) / completedTasks.length * 100) : 100,
    teamProductivity: completionRate
  };

  const getMemberProductivity = () => {
    if (!currentTeam) return [];
    
    return currentTeam.members.map(member => {
      const memberTasks = teamTasks.filter(task => task.assigneeId === member.id);
      const memberCompleted = memberTasks.filter(task => task.status === 'done');
      const completionRate = memberTasks.length > 0 
        ? Math.round((memberCompleted.length / memberTasks.length) * 100) 
        : 0;
      
      return {
        ...member,
        totalTasks: memberTasks.length,
        completedTasks: memberCompleted.length,
        completionRate
      };
    });
  };

  // Generate AI Insights based on real data
  const generateAIInsights = () => {
    const insights: { type: 'success' | 'warning' | 'info'; emoji: string; title: string; description: string }[] = [];
    
    // Completion rate insight
    if (completionRate >= 80) {
      insights.push({
        type: 'success',
        emoji: '🚀',
        title: 'Excellent Progress',
        description: `Team is performing exceptionally with ${completionRate}% completion rate. Keep up the great work!`
      });
    } else if (completionRate >= 50) {
      insights.push({
        type: 'info',
        emoji: '📈',
        title: 'Steady Progress',
        description: `Team has completed ${completionRate}% of actions. Consider breaking down larger actions for faster completion.`
      });
    } else if (teamTasks.length > 0) {
      insights.push({
        type: 'warning',
        emoji: '⚠️',
        title: 'Needs Attention',
        description: `Completion rate is at ${completionRate}%. Review action priorities and team workload distribution.`
      });
    }

    // Overdue tasks insight
    if (overdueTasks.length > 0) {
      insights.push({
        type: 'warning',
        emoji: '⏰',
        title: 'Overdue actions alert',
        description: `${overdueTasks.length} action${overdueTasks.length > 1 ? 's are' : ' is'} past due date. Prioritize these to avoid bottlenecks.`
      });
    }

    // High priority tasks insight
    const highPriorityPending = teamTasks.filter(t => 
      (t.priority === 'high' || t.priority === 'urgent') && t.status !== 'done'
    ).length;
    if (highPriorityPending > 3) {
      insights.push({
        type: 'warning',
        emoji: '🔥',
        title: 'High Priority Backlog',
        description: `${highPriorityPending} high/urgent priority actions pending. Consider redistributing workload.`
      });
    }

    // Productivity trend
    if (tasksCompletedThisWeek > 5) {
      insights.push({
        type: 'success',
        emoji: '⚡',
        title: 'High Velocity Week',
        description: `${tasksCompletedThisWeek} actions completed this week. Team is in peak productivity mode!`
      });
    }

    // Workload balance insight
    const memberProductivity = getMemberProductivity();
    const unassignedTasks = teamTasks.filter(t => !t.assigneeId && t.status !== 'done').length;
    if (unassignedTasks > 0) {
      insights.push({
        type: 'info',
        emoji: '👥',
        title: 'Unassigned actions',
        description: `${unassignedTasks} action${unassignedTasks > 1 ? 's need' : ' needs'} assignment. Distribute for better tracking.`
      });
    }

    // Average completion time insight
    if (avgCompletionDays > 0 && avgCompletionDays <= 2) {
      insights.push({
        type: 'success',
        emoji: '🎯',
        title: 'Fast Turnaround',
        description: `Average action completion time is ${avgCompletionDays.toFixed(1)} days. Excellent efficiency!`
      });
    } else if (avgCompletionDays > 7) {
      insights.push({
        type: 'info',
        emoji: '📊',
        title: 'Completion Time Analysis',
        description: `Actions take ${avgCompletionDays.toFixed(1)} days on average. Consider smaller breakdowns.`
      });
    }

    // If no insights, add a default one
    if (insights.length === 0) {
      insights.push({
        type: 'info',
        emoji: '💡',
        title: 'Getting Started',
        description: 'Add more actions to get personalized AI insights about your team\'s productivity.'
      });
    }

    return insights.slice(0, 4); // Return max 4 insights
  };

  const aiInsights = generateAIInsights();

  return (
    <div className="space-y-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Track your team's productivity and performance metrics
          </p>
        </div>
        <Button onClick={() => setShowExport(true)} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/10 border-blue-200 dark:border-blue-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Completion Rate</p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{completionRate}%</p>
              </div>
              <Target className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <Progress value={completionRate} className="mt-3 h-2" />
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/10 border-green-200 dark:border-green-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-300">Actions completed</p>
                <p className="text-2xl font-bold text-green-900 dark:text-green-100">{productivityMetrics.tasksCompletedThisWeek}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 mt-2">This week</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-900/10 border-orange-200 dark:border-orange-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-700 dark:text-orange-300">Overdue actions</p>
                <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">{overdueTasks.length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-600 dark:text-orange-400" />
            </div>
            <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">Needs attention</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/10 border-purple-200 dark:border-purple-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-700 dark:text-purple-300">Avg. Completion</p>
                <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">{productivityMetrics.averageCompletionTime}</p>
              </div>
              <Clock className="h-8 w-8 text-purple-600 dark:text-purple-400" />
            </div>
            <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">Per action</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Detailed Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Action status distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(statusDistribution).map(([status, count]) => {
              const percentage = teamTasks.length > 0 
                ? Math.round((count / teamTasks.length) * 100) 
                : 0;
              
              return (
                <div key={status} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{status}</span>
                    <span className="text-sm text-muted-foreground">{count} ({percentage}%)</span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Team Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {getMemberProductivity().map((member) => (
              <div key={member.id} className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={member.avatar} alt={member.name} />
                  <AvatarFallback className="text-xs">
                    {member.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{member.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {member.completedTasks}/{member.totalTasks} actions
                    </span>
                  </div>
                  <Progress value={member.completionRate} className="h-2" />
                </div>
                <Badge 
                  variant={member.completionRate >= 80 ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {member.completionRate}%
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Priority Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Priority Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(priorityDistribution).map(([priority, count]) => {
              const percentage = teamTasks.length > 0 
                ? Math.round((count / teamTasks.length) * 100) 
                : 0;
              
              return (
                <div key={priority} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{priority}</span>
                    <span className="text-sm text-muted-foreground">{count} ({percentage}%)</span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* AI Insights */}
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-900/10 border-emerald-200 dark:border-emerald-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
              <Zap className="h-5 w-5" />
              AI Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {aiInsights.map((insight, index) => (
                <div 
                  key={index} 
                  className="flex items-start gap-3 p-3 bg-white/50 dark:bg-black/20 rounded-lg"
                >
                  <div className={cn(
                    "w-2 h-2 rounded-full mt-2",
                    insight.type === 'success' && "bg-emerald-500",
                    insight.type === 'warning' && "bg-orange-500",
                    insight.type === 'info' && "bg-blue-500"
                  )}></div>
                  <div>
                    <p className="text-sm font-medium">{insight.emoji} {insight.title}</p>
                    <p className="text-xs text-muted-foreground">{insight.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <Leaderboard />

      {/* Export Modal */}
      <ExportModal open={showExport} onClose={() => setShowExport(false)} />
    </div>
  );
}