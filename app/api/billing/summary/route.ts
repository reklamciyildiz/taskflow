import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAdmin } from '@/lib/server-authz';
import { getOrganizationEntitlements, getOrganizationSeatUsage } from '@/lib/entitlements';
import { organizationDb } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const authed = await requireOrgAdmin(request);
    if (authed instanceof NextResponse) return authed;
    const orgId = authed.user.organization_id;
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organization found' }, { status: 400 });
    }

    const ent = await getOrganizationEntitlements(orgId);
    const seatsUsed = await getOrganizationSeatUsage(orgId);

    const org: any = await organizationDb.getById(orgId);
    const billingProvider = 'creem';
    const subscriptionId = org?.creem_subscription_id ? String(org.creem_subscription_id) : null;

    let seatChange:{status:string;previousSeats:number;desiredSeats:number}|null=null;
    if(process.env.CREEM_SEAT_MUTATIONS_ENABLED==='true' && subscriptionId) {
      const {data,error}=await (supabaseAdmin as any).from('creem_seat_changes')
        .select('status,previous_seats,desired_seats').eq('organization_id',orgId)
        .in('status',['pending','awaiting_sync','review']).maybeSingle();
      if(error)console.error('[creem] seat mutation status unavailable',{code:error.code});
      else if(data)seatChange={status:String(data.status),
        previousSeats:Number(data.previous_seats),desiredSeats:Number(data.desired_seats)};
    }
    return NextResponse.json({
      success: true,
      data: {
        plan: ent.plan,
        subscriptionStatus: ent.subscriptionStatus,
        endsAt: ent.endsAt,
        // null signals "unlimited" — Infinity cannot survive JSON serialization
        seatLimit: Number.isFinite(ent.seatLimit) ? ent.seatLimit : null,
        seatsUsed,
        subscriptionId,
        billingProvider,
        seatChange,
      },
    });
  } catch (e: any) {
    console.error('billing summary failed', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal server error' }, { status: 500 });
  }
}

