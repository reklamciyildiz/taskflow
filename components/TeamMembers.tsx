'use client';
import {T as AppT,useAppLocale} from '@/components/i18n/AppLocaleProvider';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Trash2, Pencil, UserPlus, Mail, ArrowRight, Users } from 'lucide-react';
import { useTaskContext, TeamMember } from './TaskContext';
import { InviteMemberModal } from './InviteMemberModal';
import { MoveMemberModal } from './MoveMemberModal';
import { AddMemberToTeamModal } from './AddMemberToTeamModal';
import { Role, roleDisplayNames, roleDescriptions } from '@/lib/permissions';
import { toast } from 'sonner';

export function TeamMembers() {
  const {t}=useAppLocale();
  const { 
    currentTeam, 
    currentUser, 
    permissions, 
    addMember, 
    updateMember, 
    removeMember, 
    getTeamMembers, 
    updateMemberRole,
    moveMember,
    addMemberToTeam,
    teams,
    organizationId
  } = useTaskContext();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<{id: string; name: string; email: string; role: string} | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(currentTeam?.members || []);
  const [movingMember, setMovingMember] = useState<any>(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  
  // Update team members when currentTeam changes
  useEffect(() => {
    if (currentTeam) {
      setTeamMembers(getTeamMembers(currentTeam.id));
    } else {
      setTeamMembers([]);
    }
  }, [currentTeam, getTeamMembers]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'member' as const,
    avatar: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!currentTeam) {
        toast.error(t('No team selected'));
        return;
      }

      const memberData = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        role: formData.role,
        avatar: formData.avatar.trim() || `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name.trim())}`
      };

      if (editingMember) {
        const memberExists = currentTeam.members.some(m => m.id === editingMember.id);
        if (!memberExists) {
          throw new Error(`Member with ID ${editingMember.id} not found in team ${currentTeam.id}`);
        }
        updateMember(currentTeam.id, editingMember.id, memberData);
      } else {
        addMember(currentTeam.id, memberData);
      }

      setFormData({
        name: '',
        email: '',
        role: 'member',
        avatar: ''
      });
      setEditingMember(null);
      setIsDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Request failed'));
    }
  };

  const handleEdit = (member: any) => {
    setEditingMember(member);
    setFormData({
      name: member.name,
      email: member.email,
      role: member.role,
      avatar: member.avatar
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (memberId: string) => {
    if (!currentTeam) {
      toast.error(t('No team selected'));
      return;
    }

    try {
      const confirmed = window.confirm('Are you sure you want to remove this member?');
      if (!confirmed) return;

      removeMember(currentTeam.id, memberId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Member could not be removed'));
    }
  };

  const handleMoveMember = (member: any) => {
    setMovingMember(member);
  };

  const handleMoveMemberConfirm = async (memberId: string, targetTeamId: string) => {
    if (!currentTeam) return;
    
    try {
      await moveMember(memberId, currentTeam.id, targetTeamId);
      toast.success(t('Member moved successfully'));
    } catch (error: any) {
      toast.error(error.message || t('Failed to move member'));
    }
  };

  const handleAddMemberToTeam = async (userId: string, teamId: string) => {
    try {
      await addMemberToTeam(userId, teamId);
      toast.success(t('Member added to team successfully'));
    } catch (error: any) {
      toast.error(error.message || t('Failed to add member to team'));
    }
  };

  if (!currentTeam) {
    return <div className="p-4 text-center text-muted-foreground"><AppT text="Select a team to manage members"/></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold"><AppT text="Team Members"/></h2>
        {permissions.canInviteMembers && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsInviteModalOpen(true)}>
              <Mail className="mr-2 h-4 w-4" />
              <AppT text="Invite via Email"/>
            </Button>
            <Button variant="outline" onClick={() => setShowAddMemberModal(true)}>
              <Users className="mr-2 h-4 w-4" />
              <AppT text="Add Existing Member"/>
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingMember(null)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  <AppT text="Add New Member"/>
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t(editingMember ? 'Edit Member' : 'Add New Member')}</DialogTitle>
                <DialogDescription>
                  {t(editingMember ? 'Update the team member details' : 'Add a new member to your team')}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name"><AppT text="Name"/></Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email"><AppT text="Email"/></Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role"><AppT text="Role"/></Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, role: value as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("Select role")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin"><AppT text="Admin"/></SelectItem>
                      <SelectItem value="member"><AppT text="Member"/></SelectItem>
                      <SelectItem value="viewer"><AppT text="Viewer"/></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="avatar"><AppT text="Avatar URL (optional)"/></Label>
                  <Input
                    id="avatar"
                    name="avatar"
                    type="url"
                    value={formData.avatar}
                    onChange={handleInputChange}
                    placeholder="https://example.com/avatar.jpg"
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsDialogOpen(false);
                      setEditingMember(null);
                    }}
                  ><AppT text="Cancel"/></Button>
                  <Button type="submit">
                    {t(editingMember ? 'Update Member' : 'Add Member')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      {/* Invite Member Modal - only render if user has permission */}
      {permissions.canInviteMembers && (
        <InviteMemberModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          teamId={currentTeam.id}
        />
      )}

      <div className="space-y-4">
        {currentTeam.members.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AppT text="No members in this team yet. Add your first member!"/>
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {teamMembers.map((member) => {
              const isCurrentUser = member.id === currentUser?.id;
              const canManage = permissions.canChangeRoles && !isCurrentUser;
              const canRemove = permissions.canRemoveMembers && !isCurrentUser;

              const handleRoleChange = async (newRole: string) => {
                if (!currentTeam) return;
                try {
                  await updateMemberRole(currentTeam.id, member.id, newRole as Role);
                  toast.success(t('Role updated successfully'));
                } catch (err) {
                  toast.error(t('Failed to update role'));
                }
              };

              return (
                <div key={member.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-muted/50">
                  <div className="flex items-center space-x-4 min-w-0 w-full sm:w-auto">
                    <div className="relative flex-shrink-0">
                      <Avatar>
                        <AvatarImage src={member.avatar} alt={member.name} />
                        <AvatarFallback>{member.name[0]}</AvatarFallback>
                      </Avatar>
                      {member.isOnline && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{member.name}</p>
                        {isCurrentUser && (
                          <span className="text-xs text-muted-foreground flex-shrink-0"><AppT text="(you)"/></span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:space-x-3 flex-wrap">
                    {canManage ? (
                      <Select
                        value={member.role}
                        onValueChange={handleRoleChange}
                      >
                        <SelectTrigger className="w-[100px] h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin"><AppT text="Admin"/></SelectItem>
                          <SelectItem value="member"><AppT text="Member"/></SelectItem>
                          <SelectItem value="viewer"><AppT text="Viewer"/></SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm text-muted-foreground capitalize">
                        {t(member.role)}
                      </span>
                    )}
                    {permissions.canRemoveMembers && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(member)}
                        disabled={!canManage && !isCurrentUser}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {canRemove && teams.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMoveMember(member)}
                        disabled={!canManage}
                        title={t("Move to another team")}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                    {canRemove && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(member.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Role Descriptions */}
      <div className="mt-6 p-4 border rounded-lg">
        <h3 className="text-sm font-medium mb-3 text-muted-foreground"><AppT text="Role Descriptions"/></h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="font-medium"><AppT text="Admin"/></p>
            <p className="text-muted-foreground text-xs mt-1">{t(roleDescriptions.admin)}</p>
          </div>
          <div>
            <p className="font-medium"><AppT text="Member"/></p>
            <p className="text-muted-foreground text-xs mt-1">{t(roleDescriptions.member)}</p>
          </div>
          <div>
            <p className="font-medium"><AppT text="Viewer"/></p>
            <p className="text-muted-foreground text-xs mt-1">{t(roleDescriptions.viewer)}</p>
          </div>
        </div>
      </div>

      {/* Modals */}
      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        teamId={currentTeam?.id}
      />

      <MoveMemberModal
        member={movingMember}
        currentTeamId={currentTeam?.id}
        teams={teams.filter(t => t.organizationId === currentTeam?.organizationId || (t as any).organization_id === currentTeam?.organizationId)}
        open={!!movingMember}
        onClose={() => setMovingMember(null)}
        onMove={handleMoveMemberConfirm}
      />

      <AddMemberToTeamModal
        teamId={currentTeam?.id}
        organizationId={organizationId || ''}
        open={showAddMemberModal}
        onClose={() => setShowAddMemberModal(false)}
        onAdd={handleAddMemberToTeam}
      />
    </div>
  );
}
