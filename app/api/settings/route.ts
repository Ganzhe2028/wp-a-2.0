import { NextResponse } from "next/server";
import { createRequestId, failure } from "@/lib/contracts";

/**
 * Legacy public settings reads are disabled. Formal event settings are not
 * public, so exposing arbitrary legacy SystemSetting values would broaden access.
 */
export async function GET() {
  const requestId = createRequestId();

  return NextResponse.json(
    failure("FORBIDDEN", "公开设置读取已禁用", requestId),
    { status: 403 },
  );
}
