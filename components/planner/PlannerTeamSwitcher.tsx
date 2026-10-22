"use client";

import { Building2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePlannerRuntime } from './PlannerRuntime';

export function PlannerTeamSwitcher() {
  const { teams, currentTeam, setCurrentTeam, loading } = usePlannerRuntime();

  return (
    <div className="planner-team-switcher" aria-label="Planner workspace">
      <span className="planner-team-switcher-label">
        <Building2 aria-hidden />
        Workspace
      </span>
      <Select
        value={currentTeam?.id}
        onValueChange={(teamId) => void setCurrentTeam(teamId)}
        disabled={loading || teams.length === 0}
      >
        <SelectTrigger className="planner-team-switcher-trigger" aria-label="Select workspace">
          <SelectValue placeholder={loading ? 'Loading workspaces…' : 'Select workspace'} />
        </SelectTrigger>
        <SelectContent align="end">
          {teams.map((team) => (
            <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
