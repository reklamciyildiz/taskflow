import { NextRequest, NextResponse } from 'next/server';
import { propertyErrorResponse, setActionProperty } from '@/lib/process-properties-server';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const result = await setActionProperty(params.id, await request.json(), request);
    if (result instanceof NextResponse) return result;
    return NextResponse.json({ success: true });
  } catch (error) { return propertyErrorResponse(error); }
}
