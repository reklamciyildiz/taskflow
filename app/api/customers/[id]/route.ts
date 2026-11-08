import { NextRequest, NextResponse } from 'next/server';
import { customerDb } from '@/lib/db';
import { requireAuthedUser } from '@/lib/server-authz';
import { deleteCustomer, readCustomer, updateCustomer, type CustomerResult } from '@/lib/customer-security';

export const dynamic = 'force-dynamic';

function respond<T>(result: CustomerResult<T>) {
  return result.ok === false
    ? NextResponse.json({ success: false, error: result.error }, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
    : NextResponse.json({ success: true, data: result.value }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    return respond(await readCustomer(authed.user, params.id, customerDb));
  } catch {
    console.error('Customer lookup failed');
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const body: unknown = await request.json().catch(() => null);
    return respond(await updateCustomer(authed.user, params.id, body, customerDb));
  } catch {
    console.error('Customer update failed');
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const result = await deleteCustomer(authed.user, params.id, customerDb);
    if (result.ok === false) return respond(result);
    return NextResponse.json({ success: true, message: 'Customer deleted successfully' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error('Customer deletion failed');
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
