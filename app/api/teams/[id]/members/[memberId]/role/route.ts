import { NextRequest, NextResponse } from 'next/server';
import { updateTeamMemberRole } from '@/lib/team-role-mutations';

export async function PATCH(request: NextRequest, { params }: { params: { id: string; memberId: string } }) {
  try {
    return await updateTeamMemberRole(request, params.id, params.memberId);
  } catch (error) {
    console.error('Error changing team member role:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
