import { NextRequest, NextResponse } from 'next/server';
import { mutateProcessProperty, propertyErrorResponse, readProcessProperties, requireProcessPropertyAccess } from '@/lib/process-properties-server';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await requireProcessPropertyAccess(params.id, request.nextUrl.searchParams.get('teamId'));
    if (access instanceof NextResponse) return access;
    return NextResponse.json({ data: await readProcessProperties(access) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return propertyErrorResponse(error); }
}
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await requireProcessPropertyAccess(params.id, request.nextUrl.searchParams.get('teamId'), true);
    if (access instanceof NextResponse) return access;
    await mutateProcessProperty(params.id, await request.json());
    return NextResponse.json({ success: true });
  } catch (error) { return propertyErrorResponse(error); }
}
