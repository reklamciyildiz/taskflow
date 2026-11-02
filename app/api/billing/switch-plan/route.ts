import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAdmin } from '@/lib/server-authz';
import { changeCreemPlan } from '@/lib/creem-billing-operations';
export async function POST(request: NextRequest) {
  if(request.cookies.get('actiproc_platform')?.value==='capacitor-native')
    return NextResponse.json({success:false,code:'NATIVE_BILLING_DISABLED',
      error:'Paid subscription changes are available only in the web app.'},{status:403});
  const authed=await requireOrgAdmin(request);
  if (authed instanceof NextResponse) return authed;
  const orgId=authed.user.organization_id;
  if (!orgId) return NextResponse.json({success:false,error:'No organization found'},{status:400});
  return changeCreemPlan(request,orgId);
}
