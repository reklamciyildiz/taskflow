'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTaskContext } from '@/components/TaskContext';
import { InviteMemberModal } from '@/components/InviteMemberModal';
import { 
  Users, 
  Mail, 
  Bell, 
  Shield, 
  Palette,
  Globe,
  Plus,
  Crown,
  Settings as SettingsIcon,
  Trash2,
  Edit,
  UserPlus,
  Layers
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { ChangePasswordModal } from '@/components/ChangePasswordModal';
import { TwoFactorModal } from '@/components/TwoFactorModal';
import { ActiveSessionsModal } from '@/components/ActiveSessionsModal';
import { CreateTeamModal } from '@/components/CreateTeamModal';
import { EditTeamModal } from '@/components/EditTeamModal';
import { DeleteTeamModal } from '@/components/DeleteTeamModal';

export function Settings() {
  const {
    currentTeam,
    currentUser,
    removeMember,
    organizationName,
    updateOrganization,
    teams,
    createTeam,
    updateTeam,
  } = useTaskContext();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  // Security modals state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [showActiveSessions, setShowActiveSessions] = useState(false);
  
  // Teams management state
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [deletingTeam, setDeletingTeam] = useState<any>(null);
  
  // Organization settings state
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [orgUpdateLoading, setOrgUpdateLoading] = useState(false);
  
  // Notification settings state
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [teamActivity, setTeamActivity] = useState(false);
  const [compactView, setCompactView] = useState(false);
  // Processes are managed in Process Center (/dashboard/processes)

  // Load settings from API and localStorage on mount
  useEffect(() => {
    setMounted(true);
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/users/settings');
      const data = await response.json();
      if (data.success && data.data) {
        setEmailNotifications(data.data.email_notifications ?? true);
        setPushNotifications(data.data.push_notifications ?? true);
        setTeamActivity(data.data.team_activity ?? false);
        setCompactView(data.data.compact_view ?? false);
      }
    } catch {
      // Fallback to localStorage
      const savedSettings = localStorage.getItem('taskflow-settings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        setEmailNotifications(settings.emailNotifications ?? true);
        setPushNotifications(settings.pushNotifications ?? true);
        setTeamActivity(settings.teamActivity ?? false);
        setCompactView(settings.compactView ?? false);
      }
    }
  };

  // Save settings to API and localStorage
  const saveSettings = async (key: string, value: boolean) => {
    // Save to localStorage as fallback
    const savedSettings = localStorage.getItem('taskflow-settings');
    const settings = savedSettings ? JSON.parse(savedSettings) : {};
    settings[key] = value;
    localStorage.setItem('taskflow-settings', JSON.stringify(settings));

    // Save to API
    try {
      await fetch('/api/users/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
    } catch (err) {
      console.error('Failed to save settings to API:', err);
    }
  };

  const handleEmailNotifications = (checked: boolean) => {
    setEmailNotifications(checked);
    saveSettings('email_notifications', checked);
  };

  const handlePushNotifications = (checked: boolean) => {
    setPushNotifications(checked);
    saveSettings('push_notifications', checked);
  };

  const handleTeamActivity = (checked: boolean) => {
    setTeamActivity(checked);
    saveSettings('team_activity', checked);
  };

  const handleCompactView = (checked: boolean) => {
    setCompactView(checked);
    saveSettings('compact_view', checked);
  };

  const handleOrgNameEdit = () => {
    setNewOrgName(organizationName);
    setIsEditingOrg(true);
  };

  const handleOrgNameSave = async () => {
    if (!newOrgName.trim() || newOrgName === organizationName) {
      setIsEditingOrg(false);
      return;
    }

    setOrgUpdateLoading(true);
    try {
      await updateOrganization(newOrgName.trim());
      setIsEditingOrg(false);
    } catch (error) {
      console.error('Failed to update organization:', error);
      alert('Failed to update organization name');
    } finally {
      setOrgUpdateLoading(false);
    }
  };

  const handleOrgNameCancel = () => {
    setIsEditingOrg(false);
    setNewOrgName('');
  };

  // Check if user is admin or owner
  const isAdmin = currentUser?.role === 'admin' || (currentUser?.role as any) === 'owner';

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your team, preferences, and account settings
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Organization Settings - Only for Admin/Owner */}
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Organization
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Organization Name</Label>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">
                    Update your organization's display name
                  </p>
                  {isEditingOrg ? (
                    <div className="flex gap-2">
                      <Input
                        value={newOrgName}
                        onChange={(e) => setNewOrgName(e.target.value)}
                        placeholder="Organization name"
                        disabled={orgUpdateLoading}
                      />
                      <Button 
                        onClick={handleOrgNameSave}
                        disabled={orgUpdateLoading || !newOrgName.trim()}
                      >
                        Save
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={handleOrgNameCancel}
                        disabled={orgUpdateLoading}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium flex-1">{organizationName}</p>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleOrgNameEdit}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Teams Management - Admin Only */}
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Teams Management
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Create New Team */}
                <div>
                  <Label className="text-sm font-medium">Create New Team</Label>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">
                    Create a new team for your organization
                  </p>
                  <Button onClick={() => setShowCreateTeam(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Team
                  </Button>
                </div>

                <Separator />

                {/* Current Teams */}
                <div>
                  <h4 className="font-medium text-sm mb-4">Teams ({teams.length})</h4>
                  <div className="space-y-3">
                    {teams.map((team) => (
                      <div key={team.id} className="flex items-center gap-3 p-3 rounded-lg border">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{team.name}</p>
                            {team.id === currentTeam?.id && (
                              <Badge variant="outline" className="text-xs">Current</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {team.description || 'No description'} • {team.members.length} members
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 w-6 p-0"
                            onClick={() => setEditingTeam(team)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          {teams.length > 1 && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                              onClick={() => setDeletingTeam(team)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Process Center — Admin Only */}
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Süreç Merkezi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-dashed p-4 bg-muted/30 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Süreçleri artık ayrı bir merkezden yönet</p>
                    <p className="text-xs text-muted-foreground">
                      Oluşturma, düzenleme, silme ve kolon yapılandırmaları için Süreç Merkezi’ni kullan.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => (window.location.href = '/dashboard/processes')}
                    className="gap-2"
                  >
                    <Layers className="h-4 w-4" />
                    Süreç Merkezi’ne git
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Team Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Invite Members */}
              <div>
                <Label className="text-sm font-medium">Invite Team Member</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Send an invitation to add new members to your organization
                </p>
                <Button onClick={() => setIsInviteModalOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite New Member
                </Button>
              </div>

              <Separator />

              {/* Current Members */}
              <div>
                <h4 className="font-medium text-sm mb-4">Team Members ({currentTeam?.members.length || 0})</h4>
                <div className="space-y-3">
                  {currentTeam?.members.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg border">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.avatar} alt={member.name} />
                        <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{member.name}</p>
                          {member.role === 'admin' && (
                            <Crown className="h-3 w-3 text-yellow-500" />
                          )}
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            member.isOnline ? "bg-green-500" : "bg-gray-400"
                          )} />
                        </div>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.isOnline ? 'Active now' : 'Offline'}
                        </p>
                      </div>
                      <Badge 
                        variant={member.role === 'admin' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {member.role}
                      </Badge>
                      {member.id !== currentUser?.id && currentUser?.role === 'admin' && (
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                            onClick={() => currentTeam && removeMember(currentTeam.id, member.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Email Notifications</Label>
                  <p className="text-xs text-muted-foreground">Receive email updates for task assignments</p>
                </div>
                <Switch 
                  checked={emailNotifications} 
                  onCheckedChange={handleEmailNotifications} 
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Push Notifications</Label>
                  <p className="text-xs text-muted-foreground">Get instant notifications in your browser</p>
                </div>
                <Switch 
                  checked={pushNotifications} 
                  onCheckedChange={handlePushNotifications} 
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Team Activity</Label>
                  <p className="text-xs text-muted-foreground">Notifications when team members complete tasks</p>
                </div>
                <Switch 
                  checked={teamActivity} 
                  onCheckedChange={handleTeamActivity} 
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Settings */}
        <div className="space-y-6">
          {/* Profile Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <SettingsIcon className="h-4 w-4" />
                Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="display-name" className="text-xs font-medium">Display Name</Label>
                <Input id="display-name" defaultValue={currentUser?.name || ''} className="bg-white dark:bg-gray-800" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-medium">Email</Label>
                <Input id="email" defaultValue={currentUser?.email || ''} disabled />
              </div>
            </CardContent>
          </Card>

          {/* Appearance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="h-4 w-4" />
                Appearance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">Dark Mode</Label>
                  <p className="text-xs text-muted-foreground">Toggle dark theme</p>
                </div>
                {mounted && (
                  <Switch 
                    checked={theme === 'dark'} 
                    onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')} 
                  />
                )}
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">Compact View</Label>
                  <p className="text-xs text-muted-foreground">Reduce spacing in lists</p>
                </div>
                <Switch 
                  checked={compactView} 
                  onCheckedChange={handleCompactView} 
                />
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4" />
                Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => setShowChangePassword(true)}
              >
                Change Password
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => setShowTwoFactor(true)}
              >
                Two-Factor Auth
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => setShowActiveSessions(true)}
              >
                Active Sessions
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Invite Member Modal */}
      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        teamId={currentTeam?.id}
      />

      {/* Security Modals */}
      <ChangePasswordModal
        open={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />
      <TwoFactorModal
        open={showTwoFactor}
        onClose={() => setShowTwoFactor(false)}
      />
      <ActiveSessionsModal
        open={showActiveSessions}
        onClose={() => setShowActiveSessions(false)}
      />

      {/* Teams / Projects Management Modals */}
      <CreateTeamModal 
        open={showCreateTeam} 
        onClose={() => setShowCreateTeam(false)} 
      />
      <EditTeamModal 
        team={editingTeam}
        open={!!editingTeam} 
        onClose={() => setEditingTeam(null)}
        onSave={async (teamId: string, name: string, description: string) => {
          await updateTeam(teamId, name, description);
          setEditingTeam(null);
        }}
      />
      <DeleteTeamModal 
        team={deletingTeam}
        open={!!deletingTeam} 
        onClose={() => setDeletingTeam(null)}
        onConfirm={async (teamId: string) => {
          const response = await fetch(`/api/teams/${teamId}`, {
            method: 'DELETE',
          });
          const data = await response.json();
          if (!data.success) {
            throw new Error(data.error || 'Failed to delete team');
          }
          // Refresh teams list
          window.location.reload();
        }}
      />
    </div>
  );
}