import { NextResponse } from "next/server";
import { failure, success } from "@/lib/contracts";
import { prisma } from "@/lib/prisma";
import { getPublicUrl } from "@/lib/r2";
import { requireFormalViewer } from "@/lib/server/student-request";

interface RouteContext { params: Promise<{ assetId: string }> }

export async function GET(_request: Request, routeContext: RouteContext) {
  const context = await requireFormalViewer();
  if (!context.ok) return context.response;
  const { assetId } = await routeContext.params;
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, eventId: context.viewer.eventId, ownerUserId: context.viewer.userId },
    select: { id: true, storageKey: true, scanStatus: true, processingStatus: true },
  });
  if (!asset) return NextResponse.json(failure("FORBIDDEN", "资源不存在", context.requestId), { status: 404 });
  const status = asset.scanStatus === "FAILED" || asset.processingStatus === "FAILED"
    ? "FAILED"
    : asset.scanStatus === "PASSED" && asset.processingStatus === "READY"
      ? "READY"
      : "PROCESSING";
  return NextResponse.json(success({
    assetId: asset.id,
    status,
    ...(status === "READY" && { imageUrl: getPublicUrl(asset.storageKey) }),
  }, context.requestId), { headers: { "Cache-Control": "no-store" } });
}
