'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useView } from '@/components/ViewContext';
import { useTaskContext } from '@/components/TaskContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Settings, ArrowRight } from 'lucide-react';
import { isTerminalBoardColumn } from '@/lib/types';

export default function TeamPage() {
  const { setCurrentView } = useView();
  const { currentTeam, tasks, currentUser, boardColumns } = useTaskContext();

  useEffect(() => {
    setCurrentView('team');
  }, [setCurrentView]);

  const memberStats = useMemo(() => {
    if (!currentTeam) return [];
    const teamTasks = tasks.filter((t) => t.teamId === currentTeam.id);
    return currentTeam.members.map((member) => {
      const memberTasks = teamTasks.filter((t) => t.assigneeId === member.id);
      const active = memberTasks.filter((t) => !isTerminalBoardColumn(t.status, boardColumns));
      const done = memberTasks.filter((t) => isTerminalBoardColumn(t.status, boardColumns));
      const urgent = active.filter((t) => t.priority === 'urgent' || t.priority === 'high');
      return { member, active: active.length, done: done.length, urgent: urgent.length };
    });
  }, [currentTeam, tasks, boardColumns]);

  const onlineCount = currentTeam?.members.filter((m) => m.isOnline).length ?? 0;

  if (!currentTeam) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No team selected.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{currentTeam.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {onlineCount} online · {currentTeam.members.length} members
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings/members">
            <Settings className="mr-2 h-4 w-4" />
            Manage members
          </Link>
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold tabular-nums">{currentTeam.members.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Total Members</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold tabular-nums text-emerald-600">{onlineCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">Online Now</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold tabular-nums">
              {memberStats.reduce((s, m) => s + m.active, 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Active Tasks</p>
          </CardContent>
        </Card>
      </div>

      {/* Member list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Members
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {memberStats.map(({ member, active, done, urgent }) => {
              const isMe = member.id === currentUser?.id;
              return (
                <div key={member.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="relative shrink-0">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={member.avatar} alt={member.name} />
                      <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    {member.isOnline && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{member.name}</span>
                      {isMe && <span className="text-xs text-muted-foreground">(you)</span>}
                      <Badge variant="outline" className="ml-auto shrink-0 capitalize text-xs h-5 px-2">
                        {member.role}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                  </div>

                  <div className="hidden shrink-0 items-center gap-4 text-xs sm:flex">
                    <div className="text-center">
                      <p className="font-semibold tabular-nums">{active}</p>
                      <p className="text-muted-foreground">Active</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold tabular-nums text-emerald-600">{done}</p>
                      <p className="text-muted-foreground">Done</p>
                    </div>
                    {urgent > 0 && (
                      <div className="text-center">
                        <p className="font-semibold tabular-nums text-red-500">{urgent}</p>
                        <p className="text-muted-foreground">Urgent</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Manage CTA */}
      <div className="flex items-center justify-between rounded-lg border border-dashed p-4 text-sm">
        <p className="text-muted-foreground">
          Invite members, change roles, or remove people from your team.
        </p>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settings/members" className="flex items-center gap-1">
            Go to Settings <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
