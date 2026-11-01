import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAdmin } from '@/lib/server-authz';
import { resumeCreemBilling, getCreemResumeAvailability } from '@/lib/creem-billing-operations';
export async function POST(request:NextRequest){
  if(request.cookies.get('actiproc_platform')?.value==='capacitor-native')
    return NextResponse.json({success:false,error:'Manage billing on the web.'},{status:403});
  const authed=await requireOrgAdmin(request);
  if(authed instanceof NextResponse)return authed;
  if(!authed.user.organization_id)
    return NextResponse.json({success:false,error:'No organization found'},{status:400});
  return resumeCreemBilling(authed.user.organization_id);
}

export async function GET(request:NextRequest) {
  const authed=await requireOrgAdmin(request);
  if(authed instanceof NextResponse)return authed;
  if(!authed.user.organization_id)
    return NextResponse.json({success:false,error:'No organization found'},{status:400});
  return getCreemResumeAvailability(authed.user.organization_id);
}
