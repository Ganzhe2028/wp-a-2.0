import { NextResponse } from "next/server";
import { createRequestId, failure } from "@/lib/contracts";

/**
 * Legacy public settings reads are disabled. EventSettings does not exist yet,
 * so exposing arbitrary SystemSetting values could only broaden access.
 */
export async function GET() {
  const requestId = createRequestId();

  return NextResponse.json(
    failure("FORBIDDEN", "公开设置读取已禁用", requestId),
    { status: 403 },
  );
}
