import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAdmin } from '@/lib/server-authz';
import { getOrganizationEntitlements, getOrganizationSeatUsage } from '@/lib/entitlements';
import { organizationDb } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { creemApi, getCreemConfig, creemResponseMode } from '@/lib/creem-config';
import { readCreemBillingCycle, type CreemBillingCycle } from '@/lib/creem-billing-cycle';

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

    // Live read: billing dates never come from an assumed 30-day interval or
    // cached organization period_end. Do not present dates if verification fails.
    let billingCycle: CreemBillingCycle | null=null;
    if (org?.billing_provider==='creem' && org?.creem_subscription_id && org?.creem_customer_id) {
      try {
        const config=getCreemConfig();
        if (Boolean(org.creem_test_mode)===(config.mode==='test')) {
          const remote=await creemApi<any>(config,'GET','subscriptions?subscription_id='+
            encodeURIComponent(org.creem_subscription_id));
          const sub=remote?.subscription??remote;
          const id=typeof sub?.id==='string'?sub.id:null;
          const customerId=typeof sub?.customer==='string'?sub.customer:sub?.customer?.id;
          const productId=typeof sub?.product==='string'?sub.product:sub?.product?.id;
          if (id===org.creem_subscription_id && customerId===org.creem_customer_id &&
              productId===org.creem_product_id && sub?.mode===creemResponseMode(config))
            billingCycle=readCreemBillingCycle(remote);
        }
      } catch(e) {
        console.warn('[creem] renewal calendar unavailable', e instanceof Error ? e.name : 'unknown');
      }
    }

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
        billingCycle,
      },
    });
  } catch (e: any) {
    console.error('billing summary failed', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal server error' }, { status: 500 });
  }
}

