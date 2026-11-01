import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAdmin } from '@/lib/server-authz';
import { createCreemCheckout } from '@/lib/creem-billing-operations';
import { creemCheckoutEnvironmentSafe } from '@/lib/creem-config';

export async function POST(request: NextRequest) {
  if (request.cookies.get('actiproc_platform')?.value === 'android-twa')
    return NextResponse.json({success:false,error:'Subscriptions must be managed in the web application.'},{status:403});
  if (!creemCheckoutEnvironmentSafe())
    return NextResponse.json({success:false,error:'Checkout is not available yet.'},{status:503});
  const authed=await requireOrgAdmin();
  if (authed instanceof NextResponse) return authed;
  const orgId=authed.user.organization_id;
  if (!orgId) return NextResponse.json({success:false,error:'No organization found'},{status:400});
  return createCreemCheckout(request,orgId,authed.user.email);
}
