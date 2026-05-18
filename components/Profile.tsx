'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTaskContext } from '@/components/TaskContext';
import { User, Loader2, Check } from 'lucide-react';
import { useSession } from 'next-auth/react';

export function Profile() {
  const { currentUser, tasks, refreshData } = useTaskContext();
  const { update: updateSession } = useSession();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync name with currentUser when it changes
  useEffect(() => {
    if (currentUser?.name) {
      setName(currentUser.name);
    }
  }, [currentUser?.name]);

  // Calculate user stats
  const userTasks = tasks.filter(t => t.assigneeId === currentUser?.id);
  const completedTasks = userTasks.filter(t => t.status === 'done');
  const inProgressTasks = userTasks.filter(t => t.status === 'progress');

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (response.ok) {
        setSaved(true);
        // Refresh data to get updated user info
        await refreshData();
        // Update session to reflect changes
        await updateSession();
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!currentUser) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View and update your profile information.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            Profile Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
              <AvatarFallback className="text-lg">{currentUser.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <Button variant="outline" size="sm">Change Avatar</Button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" defaultValue={currentUser.email} disabled />
            </div>
          </div>

          <Button onClick={handleSaveProfile} disabled={saving} size="sm">
            {saving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
            ) : saved ? (
              <><Check className="h-4 w-4 mr-2" />Saved!</>
            ) : (
              'Save Changes'
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Task Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border p-4 text-center">
              <p className="text-2xl font-bold tabular-nums">{userTasks.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Total Tasks</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-2xl font-bold tabular-nums text-amber-600">{inProgressTasks.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">In Progress</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-2xl font-bold tabular-nums text-emerald-600">{completedTasks.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Completed</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
