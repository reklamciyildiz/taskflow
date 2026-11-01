import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAdmin } from '@/lib/server-authz';
import { changeCreemSeats } from '@/lib/creem-billing-operations';
export async function POST(request: NextRequest) {
  const authed=await requireOrgAdmin(request);
  if (authed instanceof NextResponse) return authed;
  const orgId=authed.user.organization_id;
  if (!orgId) return NextResponse.json({success:false,error:'No organization found'},{status:400});
  return changeCreemSeats(request,orgId);
}
