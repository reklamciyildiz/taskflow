import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cleanupAttachments } from "@/lib/attachment-server";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ""}`);
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  if (
    !process.env.CRON_SECRET ||
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await cleanupAttachments(), {
    headers: { "Cache-Control": "no-store" },
  });
}
