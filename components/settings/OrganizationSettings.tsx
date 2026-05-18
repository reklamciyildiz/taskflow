'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTaskContext } from '@/components/TaskContext';
import { CreateTeamModal } from '@/components/CreateTeamModal';
import { EditTeamModal } from '@/components/EditTeamModal';
import { DeleteTeamModal } from '@/components/DeleteTeamModal';
import { InviteMemberModal } from '@/components/InviteMemberModal';
import { useOrganizationBilling } from '@/hooks/useOrganizationBilling';
import {
  Globe, Users, Layers, CreditCard, Edit, Plus, Trash2, Crown, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export function OrganizationSettings() {
  const {
    currentTeam, currentUser, removeMember,
    organizationName, organizationId, updateOrganization,
    customerDirectoryLabel, customerSingularLabel, updateCustomerTerminology,
    teams, createTeam, updateTeam,
  } = useTaskContext();

  const isAdmin = currentUser?.role === 'admin' || (currentUser?.role as any) === 'owner';

  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [orgUpdateLoading, setOrgUpdateLoading] = useState(false);

  const [customerDirDraft, setCustomerDirDraft] = useState(customerDirectoryLabel);
  const [customerSingDraft, setCustomerSingDraft] = useState(customerSingularLabel);
  const [terminologySaving, setTerminologySaving] = useState(false);

  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [deletingTeam, setDeletingTeam] = useState<any>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const { billingPlan, billingStatus, billingLoading, checkoutBusy, seatLimit, seatsUsed, refreshBilling } =
    useOrganizationBilling(organizationId);

  useEffect(() => {
    setCustomerDirDraft(customerDirectoryLabel);
    setCustomerSingDraft(customerSingularLabel);
  }, [organizationId, customerDirectoryLabel, customerSingularLabel]);

  const handleOrgNameEdit = () => { setNewOrgName(organizationName); setIsEditingOrg(true); };
  const handleOrgNameCancel = () => { setIsEditingOrg(false); setNewOrgName(''); };
  const handleOrgNameSave = async () => {
    if (!newOrgName.trim() || newOrgName === organizationName) { setIsEditingOrg(false); return; }
    setOrgUpdateLoading(true);
    try {
      await updateOrganization(newOrgName.trim());
      setIsEditingOrg(false);
    } catch {
      alert('Failed to update organization name');
    } finally {
      setOrgUpdateLoading(false);
    }
  };

  const handleSaveTerminology = () => {
    if (!organizationId) { toast.error('Organization not loaded yet'); return; }
    setTerminologySaving(true);
    try {
      updateCustomerTerminology({ directory: customerDirDraft, singular: customerSingDraft });
      toast.success('Directory labels saved');
    } finally {
      setTerminologySaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed">
        <p className="text-sm text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Organization</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Workspace configuration — visible to admins only.
        </p>
      </div>

      {/* ── Org name ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" />
            Organization name
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditingOrg ? (
            <div className="flex gap-2">
              <Input
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Organization name"
                disabled={orgUpdateLoading}
              />
              <Button onClick={handleOrgNameSave} disabled={orgUpdateLoading || !newOrgName.trim()}>Save</Button>
              <Button variant="outline" onClick={handleOrgNameCancel} disabled={orgUpdateLoading}>Cancel</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm font-medium">{organizationName}</p>
              <Button variant="outline" size="sm" onClick={handleOrgNameEdit}>
                <Edit className="mr-2 h-4 w-4" />Edit
              </Button>
            </div>
          )}

          <Separator />

          <div>
            <Label className="text-sm font-medium">Customer directory labels</Label>
            <p className="mt-1 mb-3 text-xs text-muted-foreground">
              Rename the sidebar entry and /customers page. Stored on this device per organization.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cust-dir" className="text-xs text-muted-foreground">Plural (nav & page title)</Label>
                <Input
                  id="cust-dir"
                  value={customerDirDraft}
                  onChange={(e) => setCustomerDirDraft(e.target.value)}
                  placeholder="e.g. Clients, Accounts"
                  maxLength={48}
                  disabled={terminologySaving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-sing" className="text-xs text-muted-foreground">Singular (buttons & forms)</Label>
                <Input
                  id="cust-sing"
                  value={customerSingDraft}
                  onChange={(e) => setCustomerSingDraft(e.target.value)}
                  placeholder="e.g. Client, Account"
                  maxLength={48}
                  disabled={terminologySaving}
                />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={handleSaveTerminology}
                disabled={
                  terminologySaving ||
                  (customerDirDraft.trim() === customerDirectoryLabel &&
                    customerSingDraft.trim() === customerSingularLabel)
                }
              >
                Save labels
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setCustomerDirDraft(customerDirectoryLabel); setCustomerSingDraft(customerSingularLabel); }}
                disabled={terminologySaving}
              >
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Teams management ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Teams
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => setShowCreateTeam(true)}>
            <Plus className="mr-2 h-4 w-4" />Create team
          </Button>
          <div className="space-y-2">
            {teams.map((team) => (
              <div key={team.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{team.name}</p>
                    {team.id === currentTeam?.id && (
                      <Badge variant="outline" className="text-xs">Current</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {team.description || 'No description'} · {team.members.length} members
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingTeam(team)}>
                    <Edit className="h-3 w-3" />
                  </Button>
                  {teams.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeletingTeam(team)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Process Center ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4" />
            Process Center
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 rounded-xl border border-dashed bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Manage pipeline processes</p>
              <p className="text-xs text-muted-foreground">Create, edit, delete, and configure columns.</p>
            </div>
            <Button variant="outline" onClick={() => (window.location.href = '/dashboard/processes')} className="gap-2 shrink-0">
              <Layers className="h-4 w-4" />Go to Process Center
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Billing preview ── */}
      {organizationId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <CreditCard className="h-4 w-4" />
                  Billing
                  <Badge variant={billingPlan === 'free' ? 'secondary' : 'default'} className="uppercase text-xs">
                    {billingPlan}
                  </Badge>
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Plans, checkout, invoices, and seats.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={checkoutBusy !== null}
                onClick={() => void refreshBilling()}
                className="shrink-0"
              >
                {billingLoading ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Status </span>
                  <span className="font-medium capitalize">{billingLoading ? '…' : billingStatus.replace('_', ' ')}</span>
                </p>
                {(billingPlan === 'team' || billingPlan === 'pro') ? (
                  <p className="text-muted-foreground">
                    Seats: <span className="font-medium text-foreground">{billingLoading ? '…' : `${seatsUsed} / ${seatLimit}`}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Open the billing page to compare plans.</p>
                )}
              </div>
              <Button asChild className="gap-2 sm:shrink-0">
                <Link href="/settings/billing">
                  Billing & plans
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Current team members (admin quick view) ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Team members — {currentTeam?.members.length ?? 0}</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setIsInviteModalOpen(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />Invite
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {currentTeam?.members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-lg border p-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={member.avatar} alt={member.name} />
                <AvatarFallback className="text-xs">{member.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{member.name}</p>
                  {member.role === 'admin' && <Crown className="h-3 w-3 shrink-0 text-yellow-500" />}
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', member.isOnline ? 'bg-green-500' : 'bg-muted-foreground/40')} />
                </div>
                <p className="text-xs text-muted-foreground truncate">{member.email}</p>
              </div>
              <Badge variant={member.role === 'admin' ? 'default' : 'secondary'} className="text-xs shrink-0">
                {member.role}
              </Badge>
              {member.id !== currentUser?.id && currentUser?.role === 'admin' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                  onClick={() => currentTeam && removeMember(currentTeam.id, member.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Modals */}
      <InviteMemberModal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} teamId={currentTeam?.id} />
      <CreateTeamModal open={showCreateTeam} onClose={() => setShowCreateTeam(false)} />
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
          const res = await fetch(`/api/teams/${teamId}`, { method: 'DELETE' });
          const data = await res.json();
          if (!data.success) throw new Error(data.error || 'Failed to delete team');
          window.location.reload();
        }}
      />
    </div>
  );
}
