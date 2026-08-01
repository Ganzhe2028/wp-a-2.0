import { NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { failure, success } from "@/lib/contracts";
import { requireFormalViewer } from "@/lib/server/student-request";
import { decideAuthoring } from "@/lib/domain/authoring";
import { DAY1_TEMPLATE, DAY3_TEMPLATE, parseFormalSection } from "@/lib/domain/submission-templates";
import { createIdempotencyContext, runIdempotentTransaction } from "@/lib/server/idempotency";

interface RouteContext { params: Promise<{ section: string }> }

export async function PUT(request: Request, routeContext: RouteContext) {
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
  if (!Number.isSafeInteger(body.version)) return NextResponse.json(failure("VALIDATION_ERROR", "version 无效", context.requestId), { status: 400 });
  const templateVersion = section === "DAY1" ? DAY1_TEMPLATE.templateVersion : DAY3_TEMPLATE.templateVersion;
  if (body.templateVersion !== templateVersion) return NextResponse.json(failure("VERSION_CONFLICT", "模板版本已更新", context.requestId), { status: 409 });

  try {
    const idempotency = createIdempotencyContext({ request, body, eventId: context.viewer.eventId, actorUserId: context.viewer.userId, scope: `SUBMISSION_DRAFT:${section}` });
    const result = await runIdempotentTransaction(idempotency, async (tx) => {
      await tx.$queryRaw`SELECT "eventId" FROM "EventSettings" WHERE "eventId" = ${context.viewer.eventId} FOR SHARE`;
      const settings = await tx.eventSettings.findUnique({ where: { eventId: context.viewer.eventId } });
      const existing = await tx.submission.findUnique({
        where: { eventId_userId_section: { eventId: context.viewer.eventId, userId: context.viewer.userId, section } },
      });
      const status = existing?.status ?? "NOT_STARTED";
      const authoring = decideAuthoring({ role: context.viewer.role, section, status, settings });
      if (!authoring.allowed) throw new Error(authoring.code);
      if ((existing?.version ?? 1) !== body.version) throw new Error("VERSION_CONFLICT");

      let submissionId: string;
      let nextVersion: number;
      if (existing) {
        const changed = await tx.submission.updateMany({
          where: { id: existing.id, version: body.version as number },
          data: {
            status: "DRAFT",
            submittedAt: null,
            templateVersion,
            version: { increment: 1 },
            submitIdempotencyKeyHash: null,
            submitRequestHash: null,
            submitResult: Prisma.DbNull,
          },
        });
        if (changed.count !== 1) throw new Error("VERSION_CONFLICT");
        submissionId = existing.id;
        nextVersion = existing.version + 1;
      } else {
        const created = await tx.submission.create({
          data: { eventId: context.viewer.eventId, userId: context.viewer.userId, section, status: "DRAFT", templateVersion, version: 2 },
        });
        submissionId = created.id;
        nextVersion = created.version;
      }

      if (section === "DAY1") {
        if (!Array.isArray(body.slots)) throw new Error("VALIDATION_ERROR");
        const known = new Set(DAY1_TEMPLATE.slots.map((slot) => slot.slotKey));
        const rows = body.slots.map((value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("VALIDATION_ERROR");
          const row = value as Record<string, unknown>;
          const crop = row.crop as Record<string, unknown> | undefined;
          if (typeof row.slotKey !== "string" || !known.has(row.slotKey as never) || typeof row.assetId !== "string" || !crop || ![crop.x, crop.y, crop.scale].every((item) => typeof item === "number" && Number.isFinite(item))) throw new Error("VALIDATION_ERROR");
          if ((crop.x as number) < 0 || (crop.x as number) > 1 || (crop.y as number) < 0 || (crop.y as number) > 1 || (crop.scale as number) < 1 || (crop.scale as number) > 3) throw new Error("VALIDATION_ERROR");
          return { slotKey: row.slotKey as string, assetId: row.assetId as string, x: crop.x as number, y: crop.y as number, scale: crop.scale as number };
        });
        if (new Set(rows.map((row) => row.slotKey)).size !== rows.length) throw new Error("VALIDATION_ERROR");
        const assets = await tx.asset.findMany({ where: { id: { in: rows.map((row) => row.assetId) }, eventId: context.viewer.eventId, ownerUserId: context.viewer.userId, processingStatus: "READY", scanStatus: "PASSED" }, select: { id: true } });
        if (assets.length !== new Set(rows.map((row) => row.assetId)).size) throw new Error("ASSET_PROCESSING_FAILED");
        await tx.day1Slot.deleteMany({ where: { submissionId, slotKey: { notIn: rows.map((row) => row.slotKey) } } });
        for (const row of rows) {
          await tx.day1Slot.upsert({
            where: { submissionId_slotKey: { submissionId, slotKey: row.slotKey } },
            update: { eventId: context.viewer.eventId, assetId: row.assetId, cropX: row.x, cropY: row.y, cropScale: row.scale },
            create: { submissionId, eventId: context.viewer.eventId, slotKey: row.slotKey, assetId: row.assetId, cropX: row.x, cropY: row.y, cropScale: row.scale },
          });
        }
      } else {
        if (!Array.isArray(body.bottles)) throw new Error("VALIDATION_ERROR");
        const configs = new Map(DAY3_TEMPLATE.bottles.map((bottle) => [bottle.bottleKey, bottle]));
        const rows = body.bottles.map((value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("VALIDATION_ERROR");
          const row = value as Record<string, unknown>;
          const config = typeof row.bottleKey === "string" ? configs.get(row.bottleKey) : undefined;
          const level = row.level;
          if (!config || !(level === null || typeof level === "number" && Number.isInteger(level) && level >= 0 && level <= 5) || typeof row.isConfirmed !== "boolean") throw new Error("VALIDATION_ERROR");
          if (row.isConfirmed && level === null) throw new Error("VALIDATION_ERROR");
          return { bottleKey: config.bottleKey, label: config.label, level: level as number | null, isConfirmed: row.isConfirmed as boolean };
        });
        if (new Set(rows.map((row) => row.bottleKey)).size !== rows.length) throw new Error("VALIDATION_ERROR");
        // The draft body is the complete 64-bottle snapshot. Replacing it in two
        // set-based queries keeps the Serializable transaction comfortably below
        // Prisma's interactive-transaction timeout on a remote Neon database.
        await tx.day3Bottle.deleteMany({ where: { submissionId } });
        await tx.day3Bottle.createMany({
          data: rows.map((row) => ({
            submissionId,
            bottleKey: row.bottleKey,
            labelSnapshot: row.label,
            level: row.level,
            isConfirmed: row.isConfirmed,
          })),
        });
      }
      return { version: nextVersion, savedAt: new Date().toISOString() };
    });
    return NextResponse.json(success(result.data, context.requestId), { headers: { "Cache-Control": "no-store", ...(result.replayed && { "Idempotency-Replayed": "true" }) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "IDEMPOTENCY_KEY_INVALID") return NextResponse.json(failure("VALIDATION_ERROR", "Idempotency-Key 无效", context.requestId), { status: 400 });
    if (["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_EXPIRED"].includes(message)) return NextResponse.json(failure("VERSION_CONFLICT", "重复草稿请求与原始内容不一致", context.requestId), { status: 409 });
    const authCodes = ["FORBIDDEN", "AUTHORING_CLOSED", "DAY_CLOSED", "EDITING_DISABLED"] as const;
    const authCode = authCodes.find((code) => code === message);
    if (authCode) return NextResponse.json(failure(authCode, "当前不可编辑", context.requestId), { status: 403 });
    if (message === "VERSION_CONFLICT") return NextResponse.json(failure("VERSION_CONFLICT", "草稿版本冲突", context.requestId), { status: 409 });
    if (message === "ASSET_PROCESSING_FAILED") return NextResponse.json(failure("ASSET_PROCESSING_FAILED", "图片尚未处理完成", context.requestId), { status: 422 });
    if (message === "VALIDATION_ERROR") return NextResponse.json(failure("VALIDATION_ERROR", "草稿数据无效", context.requestId), { status: 400 });
    return NextResponse.json(failure("INTERNAL_ERROR", "草稿保存失败", context.requestId), { status: 500 });
  }
}
