import { NextResponse } from 'next/server';
import { requireOrgAdmin } from '@/lib/server-authz';
import { reconcileCreemOrg } from '@/lib/creem-billing-operations';
export async function POST() {
  const authed=await requireOrgAdmin();
  if (authed instanceof NextResponse) return authed;
  const orgId=authed.user.organization_id;
  if (!orgId) return NextResponse.json({success:false,error:'No organization found'},{status:400});
  return reconcileCreemOrg(orgId);
}
