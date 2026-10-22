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
    <div className="flex min-w-0 items-center gap-2" aria-label="Planner workspace">
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <Select
        value={currentTeam?.id}
        onValueChange={(teamId) => void setCurrentTeam(teamId)}
        disabled={loading || teams.length === 0}
      >
        <SelectTrigger className="h-10 w-[min(17rem,62vw)] bg-card/55 shadow-none sm:w-64" aria-label="Select workspace">
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
