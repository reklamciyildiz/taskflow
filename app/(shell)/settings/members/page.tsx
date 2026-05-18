'use client';

import dynamic from 'next/dynamic';
import { RouteLoading } from '@/components/RouteLoading';

const TeamMembers = dynamic(
  () => import('@/components/TeamMembers').then((m) => ({ default: m.TeamMembers })),
  { loading: () => <RouteLoading label="Loading members…" /> }
);

export default function SettingsMembersPage() {
  return (
    <div className="space-y-2">
      <div>
        <h1 className="text-xl font-semibold">Members</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite, manage roles, and remove team members.
        </p>
      </div>
      <TeamMembers />
    </div>
  );
}
