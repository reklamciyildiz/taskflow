import { NextRequest, NextResponse } from 'next/server';
import { customerDb } from '@/lib/db';
import { requireAuthedUser } from '@/lib/server-authz';
import { createCustomer, listCustomers, type CustomerResult } from '@/lib/customer-security';

export const dynamic = 'force-dynamic';

function respond<T>(result: CustomerResult<T>, successStatus = 200) {
  return result.ok === false
    ? NextResponse.json({ success: false, error: result.error }, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
    : NextResponse.json({ success: true, data: result.value }, { status: successStatus, headers: { 'Cache-Control': 'no-store' } });
}

// Member/Viewer may read customers in their own canonical organization.
export async function GET(request: NextRequest) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    return respond(await listCustomers(authed.user, customerDb));
  } catch {
    console.error('Customer list failed');
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// Only an Owner/Admin from the canonical users row may create customers.
// The client must never choose the record's organization_id.
export async function POST(request: NextRequest) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const body: unknown = await request.json().catch(() => null);
    return respond(await createCustomer(authed.user, body, customerDb), 201);
  } catch {
    console.error('Customer creation failed');
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
