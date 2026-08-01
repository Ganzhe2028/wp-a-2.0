import { NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { failure, success } from "@/lib/contracts";
import { prisma } from "@/lib/prisma";
import { requireFormalViewer } from "@/lib/server/student-request";
import { decideAuthoring } from "@/lib/domain/authoring";
import { DAY1_TEMPLATE, DAY3_TEMPLATE, parseFormalSection } from "@/lib/domain/submission-templates";
import {
  decideSubmitReplay,
  hashIdempotencyKey,
  hashSubmitRequest,
  type SubmitResult,
} from "@/lib/server/submission-idempotency";
import { writeAuditLog } from "@/lib/server/audit";
import { getRequestMetadata } from "@/lib/server/request-security";

interface RouteContext { params: Promise<{ section: string }> }

function replayResponse(data: SubmitResult, requestId: string) {
  return NextResponse.json(success(data, requestId), {
    headers: { "Cache-Control": "no-store", "Idempotency-Replayed": "true" },
  });
}

export async function POST(request: Request, routeContext: RouteContext) {
  const context = await requireFormalViewer(request, { write: true });
  if (!context.ok) return context.response;
  const section = parseFormalSection((await routeContext.params).section);
  if (!section) return NextResponse.json(failure("VALIDATION_ERROR", "Section 无效", context.requestId), { status: 400 });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(failure("VALIDATION_ERROR", "请求格式无效", context.requestId), { status: 400 });
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!Number.isSafeInteger(body.version) || body.confirm !== true || !idempotencyKey || idempotencyKey.length > 200) {
    return NextResponse.json(failure("VALIDATION_ERROR", "version、confirm 或 Idempotency-Key 无效", context.requestId), { status: 400 });
  }
  const keyHash = hashIdempotencyKey(idempotencyKey);
  const requestHash = hashSubmitRequest(section, body.version as number);
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "eventId" FROM "EventSettings" WHERE "eventId" = ${context.viewer.eventId} FOR SHARE`;
      const [settings, submission, publicAddress] = await Promise.all([
        tx.eventSettings.findUnique({ where: { eventId: context.viewer.eventId } }),
        tx.submission.findUnique({
          where: { eventId_userId_section: { eventId: context.viewer.eventId, userId: context.viewer.userId, section } },
          include: { day1Slots: { include: { asset: true } }, day3Bottles: true },
        }),
        tx.artworkPublicId.findFirst({ where: { eventId: context.viewer.eventId, userId: context.viewer.userId, revokedAt: null }, select: { publicId: true } }),
      ]);
      if (!submission) throw new Error("SUBMISSION_INCOMPLETE");
      if (submission.status === "SUBMITTED") {
        const replay = decideSubmitReplay({
          storedKeyHash: submission.submitIdempotencyKeyHash,
          storedRequestHash: submission.submitRequestHash,
          storedResult: submission.submitResult,
          keyHash,
          requestHash,
        });
        if (replay.kind === "REPLAY") return { data: replay.data, replayed: true };
        if (replay.kind === "CONFLICT") throw new Error("VERSION_CONFLICT");
        throw new Error("ALREADY_SUBMITTED");
      }
      const authoring = decideAuthoring({ role: context.viewer.role, section, status: submission.status, settings });
      if (!authoring.allowed) throw new Error(authoring.code);
      if (submission.version !== body.version) throw new Error("VERSION_CONFLICT");
      if (section === "DAY1") {
        const required = new Set(DAY1_TEMPLATE.slots.filter((slot) => slot.required).map((slot) => slot.slotKey));
        const valid = submission.day1Slots.filter((slot) => slot.asset && slot.asset.processingStatus === "READY" && slot.asset.scanStatus === "PASSED");
        if (valid.length < required.size || [...required].some((key) => !valid.some((slot) => slot.slotKey === key))) throw new Error("SUBMISSION_INCOMPLETE");
      } else {
        const required = new Set(DAY3_TEMPLATE.bottles.filter((bottle) => bottle.required).map((bottle) => bottle.bottleKey));
        if ([...required].some((key) => !submission.day3Bottles.some((bottle) => bottle.bottleKey === key && bottle.isConfirmed && bottle.level !== null))) throw new Error("SUBMISSION_INCOMPLETE");
      }
      const submitResult = { publicId: publicAddress?.publicId ?? "", version: submission.version + 1 };
      const updated = await tx.submission.updateMany({
        where: { id: submission.id, version: body.version as number, status: "DRAFT" },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          version: { increment: 1 },
          submitIdempotencyKeyHash: keyHash,
          submitRequestHash: requestHash,
          submitResult,
        },
      });
      if (updated.count !== 1) throw new Error("VERSION_CONFLICT");
      await writeAuditLog(tx, {
        eventId: context.viewer.eventId,
        actorUserId: context.viewer.userId,
        requestId: context.requestId,
        metadata: getRequestMetadata(request),
        change: {
          action: "SECTION_SUBMITTED",
          targetType: "SUBMISSION",
          targetId: submission.id,
          summary: `${section} submission completed`,
          before: { status: submission.status, version: submission.version },
          after: { status: "SUBMITTED", version: submission.version + 1 },
        },
      });
      return { data: submitResult, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.replayed) return replayResponse(result.data, context.requestId);
    return NextResponse.json(success(result.data, context.requestId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      const submitted = await prisma.submission.findUnique({
        where: { eventId_userId_section: { eventId: context.viewer.eventId, userId: context.viewer.userId, section } },
        select: { status: true, submitIdempotencyKeyHash: true, submitRequestHash: true, submitResult: true },
      });
      if (submitted?.status === "SUBMITTED") {
        const replay = decideSubmitReplay({
          storedKeyHash: submitted.submitIdempotencyKeyHash,
          storedRequestHash: submitted.submitRequestHash,
          storedResult: submitted.submitResult,
          keyHash,
          requestHash,
        });
        if (replay.kind === "REPLAY") return replayResponse(replay.data, context.requestId);
      }
    }
    const message = error instanceof Error ? error.message : "";
    const authCodes = ["FORBIDDEN", "AUTHORING_CLOSED", "DAY_CLOSED", "EDITING_DISABLED"] as const;
    const authCode = authCodes.find((code) => code === message);
    if (authCode) return NextResponse.json(failure(authCode, "当前不可提交", context.requestId), { status: 403 });
    if (message === "VERSION_CONFLICT") return NextResponse.json(failure("VERSION_CONFLICT", "提交版本冲突", context.requestId), { status: 409 });
    if (message === "ALREADY_SUBMITTED") return NextResponse.json(failure("ALREADY_SUBMITTED", "作品已经提交", context.requestId), { status: 409 });
    if (message === "SUBMISSION_INCOMPLETE") return NextResponse.json(failure("SUBMISSION_INCOMPLETE", "请先完成全部必填项", context.requestId), { status: 422 });
    return NextResponse.json(failure("INTERNAL_ERROR", "提交失败", context.requestId), { status: 500 });
  }
}
