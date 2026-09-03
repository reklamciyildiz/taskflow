'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Users, ArrowRight } from 'lucide-react';

interface MoveMemberModalProps {
  member: any;
  currentTeamId: string;
  teams: any[];
  open: boolean;
  onClose: () => void;
  onMove: (memberId: string, targetTeamId: string) => Promise<void>;
}

export function MoveMemberModal({ 
  member, 
  currentTeamId, 
  teams, 
  open, 
  onClose, 
  onMove 
}: MoveMemberModalProps): JSX.Element {
  const [targetTeamId, setTargetTeamId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const availableTeams = teams.filter(team => team.id !== currentTeamId);

  const handleMove = async () => {
    if (!targetTeamId) {
      setError('Please select a target team');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onMove(member.id, targetTeamId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to move member');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError('');
    setTargetTeamId('');
    onClose();
  };

  useEffect(() => {
    if (open) {
      setTargetTeamId('');
      setError('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5" />
            Move Member
          </DialogTitle>
          <DialogDescription>
            Move {member?.name || 'member'} to another team within the same organization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {member?.name || 'Unknown'}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {member?.email || 'No email'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-team">Target Team</Label>
            <Select value={targetTeamId} onValueChange={setTargetTeamId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a team to move to" />
              </SelectTrigger>
              <SelectContent>
                {availableTeams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {team.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button 
              onClick={handleMove} 
              disabled={loading || !targetTeamId}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Moving...
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Move Member
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
