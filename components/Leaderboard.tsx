'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useTaskContext } from '@/components/TaskContext';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveActionLifecycle } from '@/lib/stage-lifecycle';

export function Leaderboard() {
  const { tasks, currentTeam, projects, generalBoardColumns } = useTaskContext();

  const teamTasks = tasks.filter(task => task.teamId === currentTeam?.id);

  const leaderboardData = useMemo(() => {
    if (!currentTeam) return [];

    return currentTeam.members.map(member => {
      const memberTasks = teamTasks.filter(task => task.assigneeId === member.id);
      const completedTasks = memberTasks.filter(task => resolveActionLifecycle(task, projects, generalBoardColumns).isTerminal);
      
      // Calculate points
      let points = 0;
      completedTasks.forEach(task => {
        // Base points for completion
        points += 10;
        // Bonus for priority
        if (task.priority === 'urgent') points += 15;
        else if (task.priority === 'high') points += 10;
        else if (task.priority === 'medium') points += 5;
        // Bonus for on-time completion
        if (task.dueDate && new Date(task.updatedAt) <= new Date(task.dueDate)) {
          points += 5;
        }
      });

      // Calculate streak
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let streak = 0;
      
      for (let i = 0; i < 30; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        const nextDate = new Date(checkDate);
        nextDate.setDate(nextDate.getDate() + 1);
        
        const hasCompletedTask = completedTasks.some(task => {
          const taskDate = new Date(task.updatedAt);
          return taskDate >= checkDate && taskDate < nextDate;
        });
        
        if (hasCompletedTask) {
          streak++;
        } else if (i > 0) {
          break;
        }
      }

      return {
        ...member,
        completedTasks: completedTasks.length,
        totalTasks: memberTasks.length,
        points,
        streak,
        completionRate: memberTasks.length > 0 
          ? Math.round((completedTasks.length / memberTasks.length) * 100) 
          : 0
      };
    }).sort((a, b) => b.points - a.points);
  }, [currentTeam, teamTasks, projects, generalBoardColumns]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Performance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {leaderboardData.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">No team members yet</p>
        ) : (
          leaderboardData.map((member, index) => (
            <div
              key={member.id}
              className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <span className="w-6 text-center text-sm font-medium text-muted-foreground">
                {index + 1}
              </span>
              
              <Avatar className="h-9 w-9">
                <AvatarImage src={member.avatar} alt={member.name} />
                <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm truncate">{member.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {member.completedTasks} completed · {member.completionRate}%
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm font-semibold">{member.points}</p>
                <p className="text-xs text-muted-foreground">pts</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
