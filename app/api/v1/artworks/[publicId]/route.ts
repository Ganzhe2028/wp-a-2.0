import { NextResponse } from "next/server";
import { createRequestId, failure } from "@/lib/contracts";
import { decideArtworkVisibility } from "@/lib/domain/artwork-access";

interface RouteContext {
  params: Promise<{ publicId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const requestId = createRequestId();
  const { publicId } = await context.params;
  const decision = decideArtworkVisibility("artwork", publicId);

  return NextResponse.json(
    failure(decision.code, "作品不存在", requestId),
    { status: 404 },
  );
}
